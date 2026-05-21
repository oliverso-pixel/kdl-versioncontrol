from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class VersionBase(BaseModel):
    version_code: int
    version_name: str
    force_update: bool = False
    min_supported_version: int = 0
    release_notes: Optional[str] = None

class VersionCreate(VersionBase):
    application_id: int
    branch_id: int
    apk_download_url: str
    apk_file_hash: Optional[str] = None
    file_size: Optional[int] = None

class VersionCheckRequest(BaseModel):
    app_id: str
    branch: str
    current_version_code: int
    device_info: dict

class VersionCheckResponse(BaseModel):
    #Add is_active
    is_active: bool
    needs_update: bool
    force_update: bool
    latest_version_code: int
    latest_version_name: str
    download_url: Optional[str] = None
    apk_hash: Optional[str] = None
    file_size: Optional[int] = None
    release_notes: Optional[str] = None

class Version(VersionBase):
    id: int
    application_id: int
    branch_id: int
    apk_download_url: str
    apk_file_path: Optional[str]
    apk_file_hash: Optional[str]
    file_size: Optional[int]
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True