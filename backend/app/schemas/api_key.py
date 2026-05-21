from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ApiKeyBase(BaseModel):
    name: str
    description: Optional[str] = None

class ApiKeyCreate(ApiKeyBase):
    expires_at: Optional[datetime] = None

class ApiKey(ApiKeyBase):
    id: int
    is_active: bool
    created_at: datetime
    expires_at: Optional[datetime]
    last_used: Optional[datetime]
    revoked_at: Optional[datetime]
    
    class Config:
        from_attributes = True