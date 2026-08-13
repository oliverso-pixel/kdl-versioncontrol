from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone 
import bcrypt
import mailtrap as mt
from email.mime.text import MIMEText
from email.header import Header
from pydantic import BaseModel, Field
from jose import jwt, JWTError

from ...database import get_db, SessionLocal
from ...core.security import create_access_token 
from ...config import settings
from ...models.admin_user import AdminUser 

router = APIRouter(tags=["Auth V2"])

FAILED_LOGIN_CACHE = {}
USED_RESET_TOKENS = set()
# === Mailtrap SMTP 連線設定 ===
SMTP_SERVER = "sandbox.smtp.mailtrap.io"
SMTP_PORT = 2525  # Mailtrap 支援 2525, 587, 25 或 465
# kowloondairy要domain verivication
SENDER_EMAIL = "hello@demomailtrap.co"
SENDER_NAME = "維記牛奶後台系統"
MAILTRAP_USERNAME = "您的_MAILTRAP_使用者名稱" 
MAILTRAP_PASSWORD = "您的_MAILTRAP_密碼"
mailtrap_client = mt.MailtrapClient(token="430db30b3ffbfe9a158640c034607db0")

class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., description="管理員帳號")

class ResetPasswordRequest(BaseModel):
    token: str = Field(..., description="重設憑證 / 臨時 Token")
    new_password: str = Field(..., description="新的密碼", min_length=6)

@router.post("/auth/login")
async def login_v2(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(AdminUser).filter(AdminUser.username == form_data.username).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="帳號或密碼錯誤")

    current_username = str(user.username)
    if not user.is_active or FAILED_LOGIN_CACHE.get(current_username, 0) >= 3:
        user.is_active = False
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ACCOUNT_LOCKED_MAX_ATTEMPTS")

    password_bytes = form_data.password.encode('utf-8')
    hashed_bytes = user.hashed_password.encode('utf-8')
    is_password_correct = bcrypt.checkpw(password_bytes, hashed_bytes)
        
    if not is_password_correct:
        # 在記憶體快取中累加該使用者的錯誤次數
        if current_username not in FAILED_LOGIN_CACHE:
            FAILED_LOGIN_CACHE[current_username] = 0
            
        FAILED_LOGIN_CACHE[current_username] += 1
        current_attempts = FAILED_LOGIN_CACHE[current_username]

        # 判斷是否達到 3 次鎖定
        if current_attempts >= 3:
            user.is_active = False
            db.commit() # 嘗試同步資料庫（就算失敗也沒關係，因為記憶體已經鎖死了）
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="ACCOUNT_LOCKED_MAX_ATTEMPTS"
            )
        
        # 未滿 3 次，計算剩餘次數並拋出錯誤
        remaining_attempts = 3 - current_attempts
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"INVALID_PASSWORD_REMAINING_{remaining_attempts}"
        )
            
    if current_username in FAILED_LOGIN_CACHE:
        del FAILED_LOGIN_CACHE[current_username]
        
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    is_super = bool(getattr(user, "is_superuser", False))
    user_app_id = getattr(user, "app_id", None)
    user_department_code = getattr(user, "department_code", None)
    user_permission_level = getattr(user, "permission_level", 1)

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": str(user.username), 
            "is_superuser": is_super,
            "app_id": user_app_id,
            "department_code": user_department_code,
            "permission_level": user_permission_level
        }, 
        expires_delta=access_token_expires
    )
        
    final_response = {
        "access_token": str(access_token), 
        "token_type": "bearer", 
        "api_version": "v2",
        "user": {
            "user_id": user.id,
            "user_name": str(user.username),
            "is_active": user.is_active,
            "is_superuser": is_super,
            "app_id": user.app_id,
            "department_code": user.department_code,
            "permission_level": user.permission_level,
        }
    }
    return JSONResponse(status_code=200, content=final_response)

@router.post("/auth/forgotPassword")
async def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db)
):
    """[V2] 申請忘記密碼 - 生成臨時 Token 並透過 Mailtrap SDK 發送郵件"""
    success_response = JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"detail": "重設連結已成功發送至您的信箱，請至郵件客戶端查看。"}
    )
    
    try:
        user = db.query(AdminUser).filter(AdminUser.email == payload.email).first()
        
        if not user:
            return success_response 

        token_expires = timedelta(minutes=15)
        reset_token = create_access_token(
            data={"sub": str(user.username), "action": "reset_password"},
            expires_delta=token_expires
        )

        safe_token = reset_token.decode('utf-8') if isinstance(reset_token, bytes) else str(reset_token)
        # localhost:3000 是前端的 URL，請根據實際部署環境修改
        reset_link = f"http://localhost:3000/forgot-password?token={safe_token}"
        # email內容
        email_html_content = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 500px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b; background-color: #ffffff;">      
            <h3 style="color: #3b82f6; font-size: 18px; margin-top: 0; margin-bottom: 16px; font-weight: 600;">
                【維記牛奶】管理員密碼重設要求
            </h3>
            <p style="font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
                您好，系統收到您（帳號：<strong>{user.username}</strong>）重設密碼的申請。<br>
                請點擊下方按鈕前往安全頁面設定新密碼：
            </p>         
            <div style="margin: 24px 0;">
                <a href="{reset_link}" target="_blank"
                    style="background-color: #3b82f6; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">
                    確認重設密碼
                </a>
            </div>   
            <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 12px; color: #64748b; line-height: 1.6;">
                <span style="color: #ef4444; font-weight: 600;">⚠️ 連結有效時間為 15 分鐘。</span><br>
                若按鈕無法點擊，請複製此網址至瀏覽器開啟：<br>
                <a href="{reset_link}" target="_blank" style="color: #3b82f6; word-break: break-all; text-decoration: underline;">{reset_link}</a>
            </div>
            <p style="color: #94a3b8; font-size: 11px; margin-top: 20px; margin-bottom: 0;">
                如果您並未提交此申請，請忽略此郵件。本信由系統自動發送，請勿直接回覆。
            </p>    
        </div>
        """

        mail = mt.Mail(
            sender=mt.Address(email=SENDER_EMAIL, name=SENDER_NAME),
            to=[mt.Address(email=user.email)],
            subject="重設您的管理員密碼",
            html=email_html_content,
            category="Password Reset"
        )

        response = mailtrap_client.send(mail)
        
        return success_response

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"發送失敗: {str(e)}"
        )

@router.post("/auth/resetPassword")
async def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    """[V2] 執行重設密碼 - 驗證 Token 且限制只能單次使用，用過即作廢"""
    try:
        # 檢查此 Token 是否已經被使用過
        if payload.token in USED_RESET_TOKENS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="該重設連結已被使用過，請重新申請。"
            )

        # 驗證 Token 有效性與過期時間
        try:
            payload_data = jwt.decode(payload.token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            username: str = payload_data.get("sub")
            action: str = payload_data.get("action")
            
            if username is None or action != "reset_password":
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="無效或格式錯誤的重設憑證")
        except JWTError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="重設憑證已過期或無效")

        user = db.query(AdminUser).filter(AdminUser.username == username).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到該使用者帳號")

        new_password_bytes = payload.new_password.encode("utf-8")
        salt = bcrypt.gensalt()
        new_hashed_password = bcrypt.hashpw(new_password_bytes, salt).decode("utf-8")
        user.hashed_password = new_hashed_password

        user.is_active = True
        db.commit()
        db.refresh(user)

        USED_RESET_TOKENS.add(payload.token)

        current_username = str(user.username)
        if current_username in FAILED_LOGIN_CACHE:
            del FAILED_LOGIN_CACHE[current_username]
            print(f"🔓 [記憶體解鎖] 使用者 {current_username} 全域錯誤計數器已清空。")

        print(f"🔒 [安全性防禦] Token 已成功作廢，剩餘有效時間內將無法再次使用。")

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"detail": "密碼已成功重設，帳號已自動解鎖，請使用新密碼重新登入"}
        )

    except HTTPException as http_err:
        raise http_err
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"重設失敗: {str(e)}"
        )
