# backend/app/api/v2/version_check.py
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Body
from sqlalchemy.orm import Session
from sqlalchemy import and_
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import json
import logging

from ...database import get_db
from ...models import Application, Branch, Version, Device, UpdateLog
from ...schemas.version import VersionCheckResponse
from ...schemas.device import DeviceInfo
from ...core.security import verify_token
from ...core.utils import save_device_info, get_hkt_now

logger = logging.getLogger("v2.version_check")
logger.setLevel(logging.INFO)

router = APIRouter()

class V2VersionCheckRequest(BaseModel):
    branch: str = "stable"
    current_version_code: int

class V2ReportUpdateRequest(BaseModel):
    app_id: str
    version_code: int
    status: str = "success"

class DownloadReportRequest(BaseModel):
    app_id: str
    version_code: int
    status: str
    device_info: DeviceInfo
    error_message: Optional[str] = None

class InstallReportRequest(BaseModel):
    app_id: str
    version_code: int
    status: str
    device_info: DeviceInfo

@router.post("/devices/{android_id}/check-version", response_model=VersionCheckResponse)
async def check_version_v2(
    android_id: str,
    api_key: str = Query(..., description="設備綁定的 API Key"),
    request: V2VersionCheckRequest = Body(...),
    fastapi_request: Request = None,
    db: Session = Depends(get_db)
):
    """[V2] MDM App 專用輕量化檢查更新 (只針對 com.kowloondairy.mdmapp)"""
    
    # 強制鎖定檢查目標為 MDM App
    target_app_id = "com.kowloondairy.mdmapp"
    
    device = db.query(Device).filter(and_(Device.android_id == android_id, Device.device_api_key == api_key)).first()
    if not device:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid Device or API Key")

    device.last_check_time = get_hkt_now()
    
    # 尋找目標 App (com.kowloondairy.mdmapp)
    app = db.query(Application).filter(and_(Application.app_id == target_app_id, Application.is_active == True)).first()
    if not app:
        raise HTTPException(status_code=404, detail=f"Target App '{target_app_id}' not found")
        
    branch = db.query(Branch).filter(and_(Branch.application_id == app.id, Branch.branch_name == request.branch, Branch.is_active == True)).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
        
    latest_version = db.query(Version).filter(and_(Version.application_id == app.id, Version.branch_id == branch.id, Version.is_active == True)).order_by(Version.version_code.desc()).first()

    db.commit()

    if not latest_version:
        raise HTTPException(status_code=404, detail="No version available for this branch")
    
    needs_update = request.current_version_code < latest_version.version_code
    force_update = latest_version.force_update or request.current_version_code < latest_version.min_supported_version
    
    download_url = None
    if needs_update and latest_version.apk_download_url:
        base_url = str(fastapi_request.base_url).rstrip('/')
        if latest_version.apk_download_url.startswith(('http://', 'https://')):
            download_url = latest_version.apk_download_url
        else:
            download_url = f"{base_url}{latest_version.apk_download_url if latest_version.apk_download_url.startswith('/') else '/' + latest_version.apk_download_url}"
    
    return VersionCheckResponse(
        is_active=bool(device.is_active),
        needs_update=needs_update,
        force_update=force_update if needs_update else False,
        latest_version_code=latest_version.version_code,
        latest_version_name=latest_version.version_name,
        download_url=download_url,
        apk_hash=latest_version.apk_file_hash if needs_update else None,
        file_size=latest_version.file_size if needs_update else None,
        release_notes=latest_version.release_notes if needs_update else None
    )

@router.post("/devices/{android_id}/report-updated")
async def report_updated_v2(
    android_id: str,
    api_key: str = Query(...),
    request: V2ReportUpdateRequest = Body(...),
    db: Session = Depends(get_db)
):
    """[V2] 回報更新完成，寫入唯一的 'updated' 日誌"""
    
    device = db.query(Device).filter(and_(Device.android_id == android_id, Device.device_api_key == api_key)).first()
    if not device:
        raise HTTPException(status_code=401, detail="Unauthorized")

    app = db.query(Application).filter(Application.app_id == request.app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="App not found")

    version = db.query(Version).filter(and_(Version.application_id == app.id, Version.version_code == request.version_code)).first()
    
    update_log = UpdateLog(
        device_id=device.id,
        application_id=app.id,
        branch_id=version.branch_id if version else None,
        from_version="unknown",
        to_version=str(request.version_code),
        update_type="updated",
        status=request.status
    )
    db.add(update_log)
    
    from sqlalchemy import text
    db.execute(text("""
        INSERT INTO device_installed_apps (device_id, application_id, current_version_code) 
        VALUES (:d_id, :a_id, :v_code)
        ON DUPLICATE KEY UPDATE current_version_code = :v_code
    """), {"d_id": device.id, "a_id": app.id, "v_code": request.version_code})

    existing_config = db.execute(
        text("SELECT id FROM device_app_configs WHERE device_id = :d_id AND app_id = :a_id"),
        {"d_id": device.id, "a_id": app.app_id}
    ).first()
    
    if not existing_config and app.default_config:
        db.execute(
            text("""INSERT INTO device_app_configs (device_id, app_id, config_data, updated_at) 
               VALUES (:d_id, :a_id, :conf, NOW())"""),
            {
                "d_id": device.id, 
                "a_id": app.app_id, 
                "conf": json.dumps(app.default_config)
            }
        )
    
    db.commit()
    return {"status": "success", "message": "Update logged successfully"}

# TODO：add android_id & API key
@router.get("/apps/{app_id}/latest-version")
async def get_app_latest_version(
    app_id: str,
    branch: str = Query("stable", description="分支名稱，預設為 stable"),
    fastapi_request: Request = None,
    db: Session = Depends(get_db)
):
    """
    [V2] 查詢指定 App 的最新版本資訊 (極簡格式)
    """
    app = db.query(Application).filter(Application.app_id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
        
    b = db.query(Branch).filter(and_(Branch.application_id == app.id, Branch.branch_name == branch)).first()
    if not b:
        raise HTTPException(status_code=404, detail=f"Branch '{branch}' not found for this app")

    latest_version = db.query(Version).filter(
        and_(Version.application_id == app.id, Version.branch_id == b.id, Version.is_active == True)
    ).order_by(Version.version_code.desc()).first()

    if not latest_version:
        raise HTTPException(status_code=404, detail="No version available for this app and branch")

    # 處理下載路徑
    download_url = ""
    if latest_version.apk_download_url:
        base_url = str(fastapi_request.base_url).rstrip('/')
        if latest_version.apk_download_url.startswith(('http://', 'https://')):
            download_url = latest_version.apk_download_url
        else:
            download_url = f"{base_url}{latest_version.apk_download_url if latest_version.apk_download_url.startswith('/') else '/' + latest_version.apk_download_url}"

    # 嚴格依照要求的格式回傳
    return {
        "is_active": bool(app.is_active),
        "latest_version_code": str(latest_version.version_code),
        "latest_version_name": latest_version.version_name or "",
        "download_url": download_url,
        "apk_hash": latest_version.apk_file_hash or "",
        "file_size": str(latest_version.file_size) if latest_version.file_size else "",
        "release_notes": latest_version.release_notes or ""
    }
