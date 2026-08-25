from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import collate
from typing import List
from ...database import get_db
from ...core.security import verify_token, hash_password
from ...models.admin_user import AdminUser
from .auth import FAILED_LOGIN_CACHE
from ...models.department import Department
import json 

router = APIRouter(tags=["Users V2"])

class DepartmentResponse(BaseModel):
    dept_code: str
    dept_name_zh: str
    dept_name_en: str

    class Config:
        from_attributes = True

@router.get("/admin/users")
async def get_users(db: Session = Depends(get_db), token: dict = Depends(verify_token)):
    operator_is_super = bool(token.get("is_superuser", False))
    operator_dept_code = token.get("department_code")

    # base_query = db.query(AdminUser, Department).outerjoin(
    #     Department, AdminUser.department_code == Department.dept_code
    # )
    base_query = db.query(AdminUser, Department).outerjoin(
        Department, 
        collate(AdminUser.department_code, 'utf8mb4_unicode_ci') == collate(Department.dept_code, 'utf8mb4_unicode_ci')
        )
    if not operator_is_super:
        if not operator_dept_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="您的帳號未配置部門代碼，無法查詢人員清單。"
            )
        base_query = base_query.filter(AdminUser.department_code == operator_dept_code)

    query_results = base_query.all()
    
    result = []
    for u, dept in query_results:
        raw_app_id = getattr(u, "app_id", None)
        parsed_app_ids = []
        if raw_app_id:
            try:
                parsed_app_ids = json.loads(raw_app_id) if isinstance(raw_app_id, str) and raw_app_id.startswith('[') else raw_app_id
                if not isinstance(parsed_app_ids, list):
                    parsed_app_ids = [parsed_app_ids] if parsed_app_ids else []
            except Exception:
                parsed_app_ids = [raw_app_id] if raw_app_id else []

        is_super = bool(getattr(u, "is_superuser", False))
        perm_level = getattr(u, "permission_level", 1)

        result.append({
            "id": u.id, 
            "username": u.username, 
            "email": u.email, 
            "is_active": u.is_active, 
            "is_superuser": is_super,
            "last_login": u.last_login,
            "app_id": parsed_app_ids,  # 回傳陣列
            "permission_level": perm_level,
            "is_normal_user": (perm_level == 0) and not is_super,
            "department_code": u.department_code,
            "department_name_zh": dept.dept_name_zh if dept else None,
            "department_name_en": dept.dept_name_en if dept else None
        })
        
    return result

@router.get("/departments", response_model=List[DepartmentResponse])
async def get_departments(
    db: Session = Depends(get_db),
    token: dict = Depends(verify_token)
):
    departments = db.query(Department).all()
    return departments

@router.post("/admin/users")
async def create_user(data: dict, db: Session = Depends(get_db), token: dict = Depends(verify_token)):
    # 只有超級管理員才能建立另一個超級管理員
    target_is_superuser = bool(data.get("is_superuser", False))
    if target_is_superuser:
        current_operator_is_super = bool(token.get("is_superuser", False))
        if not current_operator_is_super:
            raise HTTPException(
                status_code=403, 
                detail="權限不足。只有超級管理員才可以建立超級管理員帳號。"
            )

    # 檢查帳號重複
    if db.query(AdminUser).filter(AdminUser.username == data["username"]).first():
        raise HTTPException(status_code=400, detail="accountExists")
    
    # 檢查 Email 重複
    user_email = data.get("email", "").strip()
    if user_email:
        if db.query(AdminUser).filter(AdminUser.email == user_email).first():
            raise HTTPException(status_code=400, detail="emailExists")

    # app_id 陣列
    front_app_ids = data.get("app_id", [])
    db_app_id_value = json.dumps(front_app_ids) if isinstance(front_app_ids, list) else front_app_ids

    # 區分超級管理員與一般專案管理員的寫入規則
    final_dept_code = None if target_is_superuser else data.get("dept_code")
    final_perm_level = 3 if target_is_superuser else int(data.get("permission_level", 2))

    # 新增至資料庫
    new_user = AdminUser(
        username=data["username"],
        email=user_email,
        hashed_password=hash_password(data["password"]),
        is_superuser=target_is_superuser,
        app_id=db_app_id_value,
        department_code=final_dept_code,
        permission_level=final_perm_level
    )
    db.add(new_user)
    db.commit()
    return {"status": "success"}

@router.delete("/admin/users/{user_id}")
async def delete_user(user_id: int, db: Session = Depends(get_db), token: dict = Depends(verify_token)):
    if not token.get("is_superuser") and int(token.get("permission_level", 0)) < 3:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="權限不足")

    user = db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if user:
        db.delete(user)
        db.commit()
    return {"status": "success"}

@router.patch("/admin/users/{user_id}/toggle-active")
async def toggle_user_active(user_id: int, db: Session = Depends(get_db), token: dict = Depends(verify_token)):
    """直接手動停用或啟用某個管理員帳號"""
    
    user = db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="找不到該使用者")
        
    current_permission = int(token.get("permission_level", 0))
    is_superuser = token.get("is_superuser", False)
    
    if not is_superuser:
        if current_permission < 3 or current_permission <= user.permission_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="權限不足，您無法變更同等或更高階級使用者的狀態"
            )

    user.is_active = not user.is_active
    
    # 除了清空資料庫計數，也必須清空記憶體快取
    if user.is_active:
        user.login_attempts = 0
        current_username = str(user.username)
        # 引入並清理你的登入錯誤快取
        if current_username in FAILED_LOGIN_CACHE:
            del FAILED_LOGIN_CACHE[current_username]
        
    db.commit()
    db.refresh(user)
    
    status_str = "啟用" if user.is_active else "停用"
    return {
        "status": "success", 
        "detail": f"已將管理員 {user.username} 的狀態改為：{status_str}",
        "is_active": user.is_active
    }

@router.patch("/admin/users/{user_id}/permission")
async def update_user_permission(
    user_id: int, 
    action: str = Query(..., pattern="^(promote|demote)$"),
    db: Session = Depends(get_db), 
    token: dict = Depends(verify_token)
):
    user = db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="找不到該使用者")
    
    current_permission = int(token.get("permission_level", 0))
    is_superuser = token.get("is_superuser", False)

    # 無論升降，操作者絕對不能動階級高於或等於自己的人（防同階互整、自我提權、或弄長官）
    # if current_permission <= user.permission_level:
    #     raise HTTPException(status_code=403, detail="權限不足，您無法變更同等或更高階級使用者的權限")

    # 提權
    if action == "promote":
        if not is_superuser and current_permission < 3:
            raise HTTPException(status_code=403, detail="權限不足，必須是高級管理員或超級管理員才能提權")
        
        user.permission_level = 3
        detail_msg = f"已將 {user.username} 提升為高級管理員"

    # 降職
    elif action == "demote":
        if not is_superuser:
            raise HTTPException(status_code=403, detail="權限不足，只有超級管理員可以執行降職操作")
        
        user.permission_level = 2
        detail_msg = f"已將 {user.username} 降職"

    db.commit()
    db.refresh(user)
               
    return {
        "status": "success", 
        "detail": detail_msg,
        "permission_level": user.permission_level
    }

@router.patch("/admin/users/{user_id}/AppPermissions")
async def update_user_app_permissions(
    user_id: int,
    app_ids: list[str],
    db: Session = Depends(get_db),
    token: dict = Depends(verify_token)
):
    user = db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="找不到該使用者")
    
    current_permission = int(token.get("permission_level", 0))
    is_superuser = token.get("is_superuser", False)

    if not is_superuser and current_permission <= user.permission_level:
        raise HTTPException(status_code=403, detail="權限不足，無法修改此用戶的權限")

    user.app_id = json.dumps(app_ids) if isinstance(app_ids, list) else app_ids
    
    db.commit()
    db.refresh(user)

    return {
        "status": "success", 
        "detail": "用戶 App 權限更新成功",
        "permission_level": user.permission_level
    }
