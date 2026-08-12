# backend/app/schemas/system_setting.py
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class SystemSettingBase(BaseModel):
    category: str
    key: str
    value: str
    description: Optional[str] = None

class SystemSettingUpdate(BaseModel):
    value: str

class SystemSetting(SystemSettingBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
