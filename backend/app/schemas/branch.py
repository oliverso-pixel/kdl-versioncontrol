from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class BranchBase(BaseModel):
    branch_name: str
    description: Optional[str] = None

class BranchCreate(BranchBase):
    application_id: int

class BranchUpdate(BaseModel):
    branch_name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class Branch(BranchBase):
    id: int
    application_id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True