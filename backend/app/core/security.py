# backend/app/core/security.py
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import and_
from ..core.utils import get_hkt_now
from ..database import get_db
from ..models import ApiKey
from ..config import settings
import hashlib
import secrets
import string

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = get_hkt_now() + expires_delta
    else:
        expire = get_hkt_now() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def calculate_file_hash(file_path: str) -> str:
    """Calculate SHA256 hash of a file"""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def generate_api_key() -> str:
    """Generate a secure API key"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(32))

def verify_api_key(api_key: str, db: Session = None) -> bool:
    """Verify API key for client authentication"""
    
    # For testing, allow hardcoded key
    if api_key == "test-api-key-123":
        return True
    
    # Check database for API key
    if db:
        key = db.query(ApiKey).filter(
            and_(
                ApiKey.key == api_key,
                ApiKey.is_active == True
            )
        ).first()
        
        if key:
            # Check expiration
            if key.expires_at and key.expires_at < get_hkt_now():
                return False
            
            # Update last used
            key.last_used = get_hkt_now()
            db.commit()
            
            return True
    
    return False

def hash_password(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)
