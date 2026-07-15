from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta

from ...database import get_db
from ...core.security import verify_password, create_access_token
from ...core.utils import get_hkt_now
from ...config import settings
from ...models.admin_user import AdminUser # 假設你已建立 AdminUser 模型

router = APIRouter(tags=["Auth V2"])

@router.post("/auth/login")
async def login_v2(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """[V2] 使用 Username / Password 登入"""
    user = db.query(AdminUser).filter(AdminUser.username == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="帳號或密碼錯誤")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="帳號已停用")

    # 更新最後登入時間
    from datetime import datetime
    user.last_login = get_hkt_now()
    db.commit()

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": "admin"}, 
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer", "api_version": "v2"}