from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from ..database import get_db
from ..models import Application, Branch, Version, Device, UpdateLog
from ..schemas.version import VersionCheckRequest, VersionCheckResponse
from ..schemas.device import DeviceInfo
from ..core.security import verify_token
from ..core.utils import save_device_info
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/api/check-version", response_model=VersionCheckResponse)
async def check_version(
    request: VersionCheckRequest,
    fastapi_request: Request,  # 添加 Request 參數以獲取請求信息
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Check if update is available for the application"""
    # Log the version check
    # logger.info(f"Version check request: {request.app_id}/{request.branch} v{request.current_version_code}")

        # Get application
    app = db.query(Application).filter(
        and_(
            Application.app_id == request.app_id,
            Application.is_active == True
        )
    ).first()
    
    # Get branch
    branch = db.query(Branch).filter(
        and_(
            Branch.application_id == app.id,
            Branch.branch_name == request.branch,
            Branch.is_active == True
        )
    ).first()
       
    # Get latest version for this branch
    latest_version = db.query(Version).filter(
        and_(
            Version.application_id == app.id,
            Version.branch_id == branch.id,
            Version.is_active == True
        )
    ).order_by(Version.version_code.desc()).first()

    # Save or update device info
    device_data = save_device_info(request.device_info)
    app_data = {"notes": app.id}
    device_data.update(app_data)
    device = db.query(Device).filter(
                and_(
        Device.android_id == device_data["android_id"],
        Device.notes == app.id
                )
    ).first()
    
    if device:
        for key, value in device_data.items():
            setattr(device, key, value)
        device.last_check_time = datetime.utcnow()
    else:
        device = Device(**device_data)
        db.add(device)
        # db.commit()
    


    if not app or not branch or not latest_version:
        if datetime.now().minute == 0:
            update_log = UpdateLog(
            device_id=device.id,
            application_id=app.id,
            branch_id=branch.id,
            from_version=str(request.current_version_code),
            to_version=str(latest_version.version_code),
            update_type="check",
            status="failed")
            db.add(update_log)
            db.commit()
    
    if not app:
        logger.warning(f"Application not found: {request.app_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found"
        )
    
    if not branch:
        logger.warning(f"Branch not found: {request.branch} for app {request.app_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found"
        )
    
    if not latest_version:
        logger.warning(f"No version available for {request.app_id}/{request.branch}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No version available for this branch"
        )
    
    # if datetime.now().minute == 0:
    # update_log = UpdateLog(
    # device_id=device.id,
    # application_id=app.id,
    # branch_id=branch.id,
    # from_version=str(request.current_version_code),
    # to_version=str(latest_version.version_code),
    # update_type="check",
    # status="success")
    # db.add(update_log)
    # db.commit()
    
    # Check if update is needed
    needs_update = request.current_version_code < latest_version.version_code
    force_update = (
        latest_version.force_update or 
        request.current_version_code < latest_version.min_supported_version
    )
    
    # 構建完整的下載 URL
    download_url = None
    if needs_update and latest_version.apk_download_url:
        # 獲取基礎 URL
        base_url = str(fastapi_request.url).split('/api/')[0]
        
        # 如果 apk_download_url 已經是完整 URL，直接使用
        if latest_version.apk_download_url.startswith(('http://', 'https://')):
            download_url = latest_version.apk_download_url
        else:
            # 否則構建完整 URL
            if latest_version.apk_download_url.startswith('/'):
                download_url = base_url + latest_version.apk_download_url
            else:
                download_url = base_url + '/' + latest_version.apk_download_url
    
    response = VersionCheckResponse(
        is_active= True if device.is_active == 1 else False,
        needs_update=needs_update,
        force_update=force_update if needs_update else False,
        latest_version_code=latest_version.version_code,
        latest_version_name=latest_version.version_name,
        download_url=download_url,
        apk_hash=latest_version.apk_file_hash if needs_update else None,
        file_size=latest_version.file_size if needs_update else None,
        release_notes=latest_version.release_notes if needs_update else None
    )
    
    logger.info(f"Version check response: needs_update={needs_update}, latest={latest_version.version_name}, download_url={download_url}")
    
    return response

class DownloadReportRequest(BaseModel):
    app_id: str
    version_code: int
    status: str
    device_info: DeviceInfo
    error_message: Optional[str] = None

@router.post("/api/report-download")
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

@router.post("/api/report-install")
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