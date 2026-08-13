from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta
from ..database import get_db
from ..core.security import create_access_token, verify_api_key, verify_token
from ..config import settings
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/api/auth/token")
async def get_token(
    api_key: str,
    db: Session = Depends(get_db)
):
    """Get JWT token using API key"""
    if not verify_api_key(api_key, db):
        logger.warning(f"Invalid API key attempted: {api_key[:8]}...")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key"
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"api_key": api_key}, 
        expires_delta=access_token_expires
    )
    
    logger.info(f"Token generated for API key: {api_key[:8]}...")
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }

@router.post("/api/auth/refresh")
async def refresh_token(
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Refresh JWT token"""
    api_key = token_payload.get("api_key")
    
    if not api_key or not verify_api_key(api_key, db):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"api_key": api_key}, 
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }