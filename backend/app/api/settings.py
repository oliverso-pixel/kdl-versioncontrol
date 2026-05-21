from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List
from datetime import datetime
from ..database import get_db
from ..models import SystemSetting, ApiKey
from ..schemas.system_setting import SystemSetting as SystemSettingSchema, SystemSettingUpdate
from ..schemas.api_key import ApiKey as ApiKeySchema, ApiKeyCreate
from ..core.security import verify_token, generate_api_key
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["System Settings"])

@router.get("/settings", response_model=dict)
async def get_system_settings(
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Get all system settings"""
    settings = db.query(SystemSetting).all()
    
    # Convert to dictionary grouped by category
    settings_dict = {}
    for setting in settings:
        if setting.category not in settings_dict:
            settings_dict[setting.category] = {}
        settings_dict[setting.category][setting.key] = setting.value
    
    return settings_dict

@router.put("/settings")
async def update_system_settings(
    settings_data: dict,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Update system settings"""
    
    for category, settings in settings_data.items():
        for key, value in settings.items():
            setting = db.query(SystemSetting).filter(
                and_(
                    SystemSetting.category == category,
                    SystemSetting.key == key
                )
            ).first()
            
            if setting:
                setting.value = str(value)
                setting.updated_at = datetime.utcnow()
            else:
                # Create new setting
                setting = SystemSetting(
                    category=category,
                    key=key,
                    value=str(value)
                )
                db.add(setting)
    
    db.commit()
    logger.info("System settings updated")
    
    return {"message": "Settings updated successfully"}

# API Key Management
@router.get("/api-keys", response_model=List[ApiKeySchema])
async def list_api_keys(
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """List all API keys"""
    keys = db.query(ApiKey).order_by(ApiKey.created_at.desc()).all()
    return keys

@router.post("/api-keys", response_model=dict)
async def create_api_key(
    key_data: ApiKeyCreate,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Create new API key"""
    
    # Generate unique key
    api_key_value = generate_api_key()
    
    api_key = ApiKey(
        name=key_data.name,
        key=api_key_value,
        description=key_data.description,
        expires_at=key_data.expires_at
    )
    
    db.add(api_key)
    db.commit()
    db.refresh(api_key)
    
    logger.info(f"Created API key: {api_key.name}")
    
    # Return the key only once
    return {
        "id": api_key.id,
        "name": api_key.name,
        "key": api_key_value,
        "message": "Save this key securely. It will not be shown again."
    }

@router.post("/api-keys/{key_id}/revoke")
async def revoke_api_key(
    key_id: int,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Revoke API key"""
    
    api_key = db.query(ApiKey).filter(ApiKey.id == key_id).first()
    
    if not api_key:
        raise HTTPException(
            status_code=404,
            detail="API key not found"
        )
    
    api_key.is_active = False
    api_key.revoked_at = datetime.utcnow()
    db.commit()
    
    logger.info(f"Revoked API key: {api_key.name}")
    
    return {"message": "API key revoked successfully"}