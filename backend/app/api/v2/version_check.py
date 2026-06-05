from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import json
import logging

from ...database import get_db
from ...models import Application, Branch, Version, Device, UpdateLog
from ...schemas.version import VersionCheckRequest, VersionCheckResponse
from ...schemas.device import DeviceInfo
from ...core.security import verify_token
from ...core.utils import save_device_info

logger = logging.getLogger("v2.version_check")
logger.setLevel(logging.INFO)

router = APIRouter()

@router.post("/check-version", response_model=VersionCheckResponse)
async def check_version_v2(
    request: VersionCheckRequest,
    fastapi_request: Request,
    db: Session = Depends(get_db)
):
    """[V2] Check if update is available for the application"""
    logger.info(f"[V2 檢查更新] App: {request.app_id} | Branch: {request.branch} | Device: {request.device_info['android_id']}")
    
    # 邏輯與原本完全相同
    app = db.query(Application).filter(and_(Application.app_id == request.app_id, Application.is_active == True)).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
        
    branch = db.query(Branch).filter(and_(Branch.application_id == app.id, Branch.branch_name == request.branch, Branch.is_active == True)).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
        
    latest_version = db.query(Version).filter(and_(Version.application_id == app.id, Version.branch_id == branch.id, Version.is_active == True)).order_by(Version.version_code.desc()).first()

    # 保存設備資訊
    device_data = save_device_info(request.device_info)
    device_data.update({"notes": app.id})
    device = db.query(Device).filter(and_(Device.android_id == device_data["android_id"], Device.notes == app.id)).first()
    
    if device:
        for key, value in device_data.items():
            setattr(device, key, value)
        device.last_check_time = datetime.utcnow()
    else:
        device = Device(**device_data)
        db.add(device)

    if not latest_version:
        db.commit() # 儲存設備資訊
        raise HTTPException(status_code=404, detail="No version available for this branch")
    
    # 記錄檢查日誌
    update_log = UpdateLog(
        device_id=device.id,
        application_id=app.id,
        branch_id=branch.id,
        from_version=str(request.current_version_code),
        to_version=str(latest_version.version_code),
        update_type="check",
        status="success"
    )
    db.add(update_log)
    db.commit()
    
    needs_update = request.current_version_code < latest_version.version_code
    force_update = latest_version.force_update or request.current_version_code < latest_version.min_supported_version
    
    download_url = None
    if needs_update and latest_version.apk_download_url:
        base_url = str(fastapi_request.base_url).rstrip('/')
        if latest_version.apk_download_url.startswith(('http://', 'https://')):
            download_url = latest_version.apk_download_url
        else:
            download_url = f"{base_url}{latest_version.apk_download_url if latest_version.apk_download_url.startswith('/') else '/' + latest_version.apk_download_url}"
    
    logger.info(f"[V2 檢查結果] 設備 {device.android_id} 是否需更新: {needs_update}")
    
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

class DownloadReportRequest(BaseModel):
    app_id: str
    version_code: int
    status: str
    device_info: DeviceInfo
    error_message: Optional[str] = None

@router.post("/report-download")
async def report_download(
    request: DownloadReportRequest,  # 使用請求體模型
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Report download status"""
    
    logger.info(f"Download report: {request.app_id} v{request.version_code} - {request.status}")
    
    # 保存下載日誌
    device = db.query(Device).filter(
        Device.android_id == request.device_info.android_id
    ).first()
    
    if device:
        app = db.query(Application).filter(
            Application.app_id == request.app_id
        ).first()
        
        if app:
            update_log = UpdateLog(
                device_id=device.id,
                application_id=app.id,
                to_version=str(request.version_code),
                update_type="download",
                status=request.status
            )
            
            if request.error_message:
                # 存儲錯誤訊息
                update_log.additional_info = json.dumps({"error": request.error_message})
            
            db.add(update_log)
            db.commit()
            
            logger.info(f"Download status logged for device {device.android_id}")
    
    return {"status": "logged"}

class InstallReportRequest(BaseModel):
    app_id: str
    version_code: int
    status: str
    device_info: DeviceInfo

@router.post("/report-install")
async def report_install(
    request: InstallReportRequest,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Report installation status"""
    
    logger.info(f"Install report: {request.app_id} v{request.version_code} - {request.status}")
    
    # 更新設備資訊
    if request.status == "success":
        device = db.query(Device).filter(
            Device.android_id == request.device_info.android_id
        ).first()
        
        if device:
            # 記錄安裝成功
            app = db.query(Application).filter(
                Application.app_id == request.app_id
            ).first()
            
            if app:
                update_log = UpdateLog(
                    device_id=device.id,
                    application_id=app.id,
                    to_version=str(request.version_code),
                    update_type="install",
                    status=request.status
                )
                db.add(update_log)
                db.commit()
    
    return {"status": "logged"}