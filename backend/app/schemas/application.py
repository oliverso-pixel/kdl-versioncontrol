from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ApplicationBase(BaseModel):
    app_id: str
    name: str
    description: Optional[str] = None

class ApplicationCreate(ApplicationBase):
    pass

class ApplicationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class Application(ApplicationBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True