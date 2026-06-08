from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ...database import get_db
from ...core.security import verify_token, hash_password
from ...models.admin_user import AdminUser

router = APIRouter(tags=["Users V2"])

@router.get("/admin/users")
async def get_users(db: Session = Depends(get_db), token: dict = Depends(verify_token)):
    users = db.query(AdminUser).all()
    # 隱藏密碼
    return [{"id": u.id, "username": u.username, "email": u.email, "is_active": u.is_active, "last_login": u.last_login} for u in users]

@router.post("/admin/users")
async def create_user(data: dict, db: Session = Depends(get_db), token: dict = Depends(verify_token)):
    if db.query(AdminUser).filter(AdminUser.username == data["username"]).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    
    new_user = AdminUser(
        username=data["username"],
        email=data.get("email", ""),
        hashed_password=hash_password(data["password"]),
        is_active=True
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