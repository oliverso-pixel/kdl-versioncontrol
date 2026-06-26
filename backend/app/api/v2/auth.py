from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone 
import bcrypt

from ...database import get_db
from ...core.security import create_access_token # 這裡保留簽發 Token 即可
from ...config import settings
from ...models.admin_user import AdminUser 
from pydantic import BaseModel, Field

import smtplib
from email.mime.text import MIMEText
from email.header import Header

router = APIRouter(tags=["Auth V2"])

SMTP_SERVER = "127.0.0.1"
SMTP_PORT = 1025  # Mailpit 預設的 SMTP 監聽埠
SENDER_EMAIL = "system-noreply@kowloondairy.com"

class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., description="管理員帳號")

class ResetPasswordRequest(BaseModel):
    token: str = Field(..., description="重設憑證 / 臨時 Token")
    new_password: str = Field(..., description="新的密碼", min_length=6)

@router.post("/auth/login")
async def login_v2(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(AdminUser).filter(AdminUser.username == form_data.username).first()
    if not user:
        raise HTTPException(status_code=400, detail="帳號或密碼錯誤")

    password_bytes = form_data.password.encode('utf-8')
    hashed_bytes = user.hashed_password.encode('utf-8')
        
    is_password_correct = bcrypt.checkpw(password_bytes, hashed_bytes)
        
    if not is_password_correct:
        raise HTTPException(status_code=400, detail="帳號或密碼錯誤")
            
    if not user.is_active:
        raise HTTPException(status_code=400, detail="帳號已停用")
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    is_super = bool(getattr(user, "is_superuser", False))
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": str(user.username), 
            "is_superuser": is_super,
        }, 
        expires_delta=access_token_expires
    )
        
    final_response = {
        "access_token": str(access_token), 
        "token_type": "bearer", 
        "api_version": "v2",
        "user": {
            "username": str(user.username),
            "is_superuser": is_super,
        }
    }
    return JSONResponse(status_code=200, content=final_response)