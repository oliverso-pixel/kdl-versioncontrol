from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from ...database import get_db
from ...core.security import verify_token, hash_password
from ...models.admin_user import AdminUser
from .auth import FAILED_LOGIN_CACHE

router = APIRouter(tags=["Users V2"])

@router.get("/admin/users")
async def get_users(db: Session = Depends(get_db), token: dict = Depends(verify_token)):
    users = db.query(AdminUser).all()
    
    return [
        {
            "id": u.id, 
            "username": u.username, 
            "email": u.email, 
            "is_active": u.is_active, 
            "is_superuser": bool(getattr(u, "is_superuser", False)),
            "last_login": u.last_login
        } 
        for u in users
    ]

@router.post("/admin/users")
async def create_user(data: dict, db: Session = Depends(get_db), token: dict = Depends(verify_token)):
    if db.query(AdminUser).filter(AdminUser.username == data["username"]).first():
        raise HTTPException(status_code=400, detail="accountExists")
    
    user_email = data.get("email", "").strip()
    if user_email:
        if db.query(AdminUser).filter(AdminUser.email == user_email).first():
            raise HTTPException(status_code=400, detail="emailExists")

    new_user = AdminUser(
        username=data["username"],
        email=user_email,
        hashed_password=hash_password(data["password"]),
        is_superuser=bool(data.get("is_superuser", False)),
    )
    db.add(new_user)
    db.commit()
    return {"status": "success"}

@router.delete("/admin/users/{user_id}")
async def delete_user(user_id: int, db: Session = Depends(get_db), token: dict = Depends(verify_token)):
    user = db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if user:
        db.delete(user)
        db.commit()
    return {"status": "success"}

@router.patch("/admin/users/{user_id}/toggle-active")
async def toggle_user_active(user_id: int, db: Session = Depends(get_db), token: dict = Depends(verify_token)):
    """直接手動停用或啟用某個管理員帳號"""
    if not token.get("is_superuser"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="權限不足")
        
    user = db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="找不到該使用者")
        
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
    return {"status": "success", "detail": f"已將管理員 {user.username} 的狀態改為：{status_str}"}