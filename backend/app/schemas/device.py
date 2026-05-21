from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict

class DeviceBase(BaseModel):
    android_id: str
    device_model: str
    os_version: str
    app_version: str

class DeviceInfo(DeviceBase):
    additional_info: Optional[Dict] = None

class DeviceCreate(DeviceBase):
    additional_info: Optional[Dict] = None
    notes: Optional[str] = None

class DeviceUpdate(BaseModel):
    device_model: Optional[str] = None
    os_version: Optional[str] = None
    app_version: Optional[str] = None
    additional_info: Optional[Dict] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

class Device(DeviceBase):
    id: int
    last_check_time: datetime
    additional_info: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class DeviceWithLogs(Device):
    recent_logs: Optional[list] = []
    total_checks: int = 0
    last_version: Optional[str] = None