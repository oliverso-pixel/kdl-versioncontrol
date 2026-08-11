from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List, Optional
import os
import shutil
from datetime import datetime, timedelta
from ..database import get_db
from ..models import Application, Branch, Version, Device, UpdateLog
from ..schemas.application import Application as ApplicationSchema, ApplicationCreate, ApplicationUpdate
from ..schemas.branch import Branch as BranchSchema, BranchCreate, BranchUpdate
from ..schemas.version import Version as VersionSchema, VersionCreate
from ..schemas.device import Device as DeviceSchema, DeviceCreate, DeviceUpdate, DeviceWithLogs
from ..core.security import verify_token, calculate_file_hash
from ..core.utils import ensure_directory_exists, get_hkt_now
from ..core.pagination import paginate, PaginationParams
from ..config import settings
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["Admin"])

# Application Management
@router.post("/applications", response_model=ApplicationSchema)
async def create_application(
    app_data: ApplicationCreate,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Create new application"""
    
    # Check if app_id already exists
    existing = db.query(Application).filter(
        Application.app_id == app_data.app_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Application ID already exists"
        )
    
    app = Application(**app_data.dict())
    db.add(app)
    db.commit()
    db.refresh(app)
    
    logger.info(f"Created application: {app.app_id}")
    return app

@router.get("/applications", response_model=List[ApplicationSchema])
async def list_applications(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """List all applications with pagination"""
    query = db.query(Application)
    
    if is_active is not None:
        query = query.filter(Application.is_active == is_active)
    
    if search:
        query = query.filter(
            or_(
                Application.app_id.contains(search),
                Application.name.contains(search)
            )
        )
    
    apps = query.offset(skip).limit(limit).all()
    return apps

@router.put("/applications/{app_id}", response_model=ApplicationSchema)
async def update_application(
    app_id: int,
    app_data: ApplicationUpdate,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Update application"""
    app = db.query(Application).filter(Application.id == app_id).first()
    
    if not app:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found"
        )
    
    update_data = app_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(app, field, value)
    
    app.updated_at = get_hkt_now()
    db.commit()
    db.refresh(app)
    
    logger.info(f"Updated application: {app.app_id}")
    return app

@router.delete("/applications/{app_id}")
async def delete_application(
    app_id: int,
    permanent: bool = Query(False, description="Permanently delete application"),
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Delete application (soft or hard delete)"""
    app = db.query(Application).filter(Application.id == app_id).first()
    
    if not app:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found"
        )
    
    if permanent:
        # 先刪除相關的版本
        db.query(Version).filter(Version.application_id == app_id).delete()
        # 刪除相關的分支
        db.query(Branch).filter(Branch.application_id == app_id).delete()
        # 刪除相關的更新日誌
        db.query(UpdateLog).filter(UpdateLog.application_id == app_id).delete()
        # 刪除應用程式
        db.delete(app)
        db.commit()
        logger.info(f"Permanently deleted application: {app.app_id}")
        return {"message": "Application permanently deleted"}
    else:
        # 軟刪除
        app.is_active = False
        app.updated_at = get_hkt_now()
        db.commit()
        logger.info(f"Soft deleted application: {app.app_id}")
        return {"message": "Application deactivated"}

# Branch Management
@router.post("/branches", response_model=BranchSchema)
async def create_branch(
    branch_data: BranchCreate,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Create new branch for application"""
    
    # Check if application exists
    app = db.query(Application).filter(
        Application.id == branch_data.application_id
    ).first()
    
    if not app:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found"
        )
    
    # Check if branch already exists
    existing = db.query(Branch).filter(
        and_(
            Branch.application_id == branch_data.application_id,
            Branch.branch_name == branch_data.branch_name
        )
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Branch already exists"
        )
    
    branch = Branch(**branch_data.dict())
    db.add(branch)
    db.commit()
    db.refresh(branch)
    
    logger.info(f"Created branch: {branch.branch_name} for app: {app.app_id}")
    return branch

@router.get("/branches", response_model=List[BranchSchema])
async def list_branches(
    application_id: Optional[int] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """List branches"""
    query = db.query(Branch)
    
    if application_id:
        query = query.filter(Branch.application_id == application_id)
    
    if is_active is not None:
        query = query.filter(Branch.is_active == is_active)
    
    branches = query.all()
    return branches

@router.put("/branches/{branch_id}", response_model=BranchSchema)
async def update_branch(
    branch_id: int,
    branch_data: BranchUpdate,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Update branch"""
    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    
    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found"
        )
    
    update_data = branch_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(branch, field, value)
    
    db.commit()
    db.refresh(branch)
    
    return branch

@router.delete("/branches/{branch_id}")
async def delete_branch(
    branch_id: int,
    permanent: bool = Query(False, description="Permanently delete branch"),
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Delete branch (soft or hard delete)"""
    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    
    if not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Branch not found"
        )
    
    if permanent:
        # 刪除相關的版本
        db.query(Version).filter(Version.branch_id == branch_id).delete()
        # 刪除相關的更新日誌
        db.query(UpdateLog).filter(UpdateLog.branch_id == branch_id).delete()
        # 刪除分支
        db.delete(branch)
        db.commit()
        logger.info(f"Permanently deleted branch: {branch.branch_name}")
        return {"message": "Branch permanently deleted"}
    else:
        branch.is_active = False
        db.commit()
        logger.info(f"Soft deleted branch: {branch.branch_name}")
        return {"message": "Branch deactivated"}

# Version Management
@router.post("/upload-apk")
async def upload_apk(
    application_id: int,
    branch_id: int,
    version_code: int,
    version_name: str,
    force_update: bool = False,
    min_supported_version: int = 0,
    release_notes: Optional[str] = None,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Upload APK file and create version"""
    
    # Validate file size
    if file.size > settings.MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Max size: {settings.MAX_FILE_SIZE} bytes"
        )
    
    # Validate file type
    if not file.filename.endswith('.apk'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only APK files are allowed"
        )
    
    # Check for existing version with same version_code
    existing_version = db.query(Version).filter(
        and_(
            Version.application_id == application_id,
            Version.branch_id == branch_id,
            Version.version_code == version_code
        )
    ).first()
    
    if existing_version:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Version with this version code already exists"
        )
    
    # Create directory structure
    app = db.query(Application).filter(Application.id == application_id).first()
    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    
    if not app or not branch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application or branch not found"
        )
    
    # Save file
    file_dir = os.path.join(settings.APK_STORAGE_PATH, app.app_id, branch.branch_name)
    ensure_directory_exists(file_dir)
    
    file_name = f"{app.app_id}_{branch.branch_name}_v{version_code}.apk"
    file_path = os.path.join(file_dir, file_name)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        logger.error(f"Failed to save file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save file"
        )
    
    # Calculate file hash
    file_hash = calculate_file_hash(file_path)
    
    # Create download URL
    download_url = f"/api/download/{app.app_id}/{branch.branch_name}/{file_name}"
    
    # Create version record
    version = Version(
        application_id=application_id,
        branch_id=branch_id,
        version_code=version_code,
        version_name=version_name,
        apk_download_url=download_url,
        apk_file_path=file_path,
        apk_file_hash=file_hash,
        file_size=os.path.getsize(file_path),
        force_update=force_update,
        min_supported_version=min_supported_version,
        release_notes=release_notes
    )
    
    db.add(version)
    db.commit()
    db.refresh(version)
    
    logger.info(f"Uploaded version {version_name} for {app.app_id}/{branch.branch_name}")
    
    # Notify connected clients via WebSocket
    from .websocket import notify_update_available
    await notify_update_available(app.app_id, branch.branch_name, {
        "version_code": version_code,
        "version_name": version_name,
        "force_update": force_update
    })
    
    return {
        "message": "APK uploaded successfully",
        "version": version,
        "file_hash": file_hash
    }

@router.get("/versions", response_model=List[VersionSchema])
async def list_versions(
    application_id: Optional[int] = None,
    branch_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """List versions with optional filters"""
    query = db.query(Version).filter(Version.is_active == True)
    
    if application_id:
        query = query.filter(Version.application_id == application_id)
    
    if branch_id:
        query = query.filter(Version.branch_id == branch_id)
    
    versions = query.order_by(Version.created_at.desc()).offset(skip).limit(limit).all()
    return versions

@router.delete("/versions/{version_id}")
async def delete_version(
    version_id: int,
    permanent: bool = Query(False, description="Permanently delete version"),
    delete_file: bool = Query(False, description="Also delete the APK file"),
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Delete version (soft or hard delete)"""
    version = db.query(Version).filter(Version.id == version_id).first()
    
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version not found"
        )
    
    if permanent:
        # 如果要刪除檔案
        if delete_file and version.apk_file_path and os.path.exists(version.apk_file_path):
            try:
                os.remove(version.apk_file_path)
                logger.info(f"Deleted APK file: {version.apk_file_path}")
            except Exception as e:
                logger.error(f"Failed to delete APK file: {e}")
        
        # 刪除版本記錄
        db.delete(version)
        db.commit()
        logger.info(f"Permanently deleted version: {version.version_name}")
        return {"message": "Version permanently deleted"}
    else:
        version.is_active = False
        db.commit()
        logger.info(f"Soft deleted version: {version.version_name}")
        return {"message": "Version deactivated"}

@router.get("/devices/{device_id}")
async def get_device_details(
    device_id: int,
    include_logs: bool = Query(True, description="Include recent update logs"),
    include_apps: bool = Query(True, description="Include installed apps"),
    log_limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    
    token_payload: dict = Depends(verify_token)
):
    """Get device details with update history and installed apps"""
    
    device = db.query(Device).filter(Device.id == device_id).first()
    
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found"
        )
    
    # 基本設備資訊
    device_dict = {
        "id": device.id,
        "android_id": device.android_id,
        "device_model": device.device_model,
        "os_version": device.os_version,
        "app_version": device.app_version,
        "last_check_time": device.last_check_time,
        "additional_info": device.additional_info,
        "notes": device.notes,
        "is_active": device.is_active,
        "created_at": device.created_at,
        "updated_at": device.updated_at
    }
    
    if include_logs:
        # 獲取更新日誌
        logs = db.query(UpdateLog).filter(
            UpdateLog.device_id == device_id
        ).order_by(UpdateLog.created_at.desc()).limit(log_limit).all()
        
        device_dict["recent_logs"] = [
            {
                "id": log.id,
                "application_id": log.application_id,
                "from_version": log.from_version,
                "to_version": log.to_version,
                "update_type": log.update_type,
                "status": log.status,
                "created_at": log.created_at
            } for log in logs
        ]
    
    if include_apps:
        # 獲取設備上的應用程式資訊
        apps_query = db.query(
            Application.id,
            Application.app_id,
            Application.name.label("app_name"),
            func.max(UpdateLog.to_version).label("current_version"),
            func.max(UpdateLog.created_at).label("last_check_time")
        ).join(
            UpdateLog, UpdateLog.application_id == Application.id
        ).filter(
            UpdateLog.device_id == device_id
        ).group_by(
            Application.id,
            Application.app_id,
            Application.name
        )
        
        installed_apps = []
        for app_info in apps_query.all():
            # 獲取最新版本
            latest_version = db.query(Version).filter(
                Version.application_id == app_info.id,
                Version.is_active == True
            ).order_by(Version.version_code.desc()).first()
            
            installed_apps.append({
                "app_id": app_info.app_id,
                "app_name": app_info.app_name,
                "current_version": app_info.current_version,
                "latest_version": latest_version.version_name if latest_version else "N/A",
                "needs_update": int(app_info.current_version) < latest_version.version_code if latest_version else False,
                "last_check_time": app_info.last_check_time
            })
        
        device_dict["installed_apps"] = installed_apps
    
    return device_dict


@router.post("/devices", response_model=DeviceSchema)
async def create_device(
    device_data: DeviceCreate,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Manually create a device"""
    
    # Check if device already exists
    existing = db.query(Device).filter(
        Device.android_id == device_data.android_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Device with this Android ID already exists"
        )
    
    # Process additional info
    device_dict = device_data.dict()
    if device_dict.get('additional_info'):
        device_dict['additional_info'] = json.dumps(device_dict['additional_info'])
    
    device = Device(**device_dict)
    db.add(device)
    db.commit()
    db.refresh(device)
    
    logger.info(f"Created device: {device.android_id}")
    return device

@router.get("/devices", response_model=List[DeviceSchema])
async def list_devices(
    app_id: Optional[str] = None,
    is_active: Optional[bool] = None,
    days: int = Query(30, ge=1, le=365, description="Show devices active in last N days"),
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """List devices with filters"""
    
    since_date = get_hkt_now() - timedelta(days=days)
    query = db.query(Device)
    
    # Apply filters
    if is_active is not None:
        query = query.filter(Device.is_active == is_active)
    
    # Filter by last activity
    query = query.filter(Device.last_check_time >= since_date)
    
    # Search filter
    if search:
        query = query.filter(
            or_(
                Device.android_id.contains(search),
                Device.device_model.contains(search),
                Device.os_version.contains(search)
            )
        )
    
    # If app_id is provided, join with update_logs to filter by application
    if app_id:
        query = query.join(UpdateLog).join(Application).filter(
            Application.app_id == app_id
        ).distinct()
    
    total = query.count()
    devices = query.order_by(Device.last_check_time.desc()).offset(skip).limit(limit).all()
    
    return devices

@router.get("/devices/{device_id}", response_model=DeviceWithLogs)
async def get_device_details(
    device_id: int,
    include_logs: bool = Query(True, description="Include recent update logs"),
    log_limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Get device details with update history"""
    
    device = db.query(Device).filter(Device.id == device_id).first()
    
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found"
        )
    
    # Convert to dict to add extra fields
    device_dict = {
        "id": device.id,
        "android_id": device.android_id,
        "device_model": device.device_model,
        "os_version": device.os_version,
        "app_version": device.app_version,
        "last_check_time": device.last_check_time,
        "additional_info": device.additional_info,
        "notes": device.notes,
        "is_active": device.is_active,
        "created_at": device.created_at,
        "updated_at": device.updated_at
    }
    
    if include_logs:
        # Get recent update logs
        logs = db.query(UpdateLog).filter(
            UpdateLog.device_id == device_id
        ).order_by(UpdateLog.created_at.desc()).limit(log_limit).all()
        
        device_dict["recent_logs"] = [
            {
                "id": log.id,
                "application_id": log.application_id,
                "from_version": log.from_version,
                "to_version": log.to_version,
                "update_type": log.update_type,
                "status": log.status,
                "created_at": log.created_at
            } for log in logs
        ]
        
        # Get total check count
        total_checks = db.query(func.count(UpdateLog.id)).filter(
            UpdateLog.device_id == device_id,
            UpdateLog.update_type == "check"
        ).scalar()
        device_dict["total_checks"] = total_checks
        
        # Get last version
        last_log = logs[0] if logs else None
        if last_log:
            device_dict["last_version"] = last_log.to_version
    
    return device_dict

@router.put("/devices/{device_id}", response_model=DeviceSchema)
async def update_device(
    device_id: int,
    device_data: DeviceUpdate,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Update device information"""
    
    device = db.query(Device).filter(Device.id == device_id).first()
    
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found"
        )
    
    update_data = device_data.dict(exclude_unset=True)
    
    # Handle additional_info
    if 'additional_info' in update_data and update_data['additional_info'] is not None:
        update_data['additional_info'] = json.dumps(update_data['additional_info'])
    
    for field, value in update_data.items():
        setattr(device, field, value)
    
    device.updated_at = get_hkt_now()
    db.commit()
    db.refresh(device)
    
    logger.info(f"Updated device: {device.android_id}")
    return device

@router.delete("/devices/{device_id}")
async def delete_device(
    device_id: int,
    permanent: bool = Query(False, description="Permanently delete device and all logs"),
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Delete device (soft or hard delete)"""
    
    device = db.query(Device).filter(Device.id == device_id).first()
    
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found"
        )
    
    if permanent:
        # Delete all related logs first
        db.query(UpdateLog).filter(UpdateLog.device_id == device_id).delete()
        # Delete device
        db.delete(device)
        db.commit()
        logger.info(f"Permanently deleted device: {device.android_id}")
        return {"message": "Device permanently deleted"}
    else:
        # Soft delete
        device.is_active = False
        device.updated_at = get_hkt_now()
        db.commit()
        logger.info(f"Soft deleted device: {device.android_id}")
        return {"message": "Device deactivated"}

@router.post("/devices/{device_id}/activate")
async def activate_device(
    device_id: int,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Reactivate a deactivated device"""
    
    device = db.query(Device).filter(Device.id == device_id).first()
    
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found"
        )
    
    device.is_active = True
    device.updated_at = get_hkt_now()
    db.commit()
    
    logger.info(f"Activated device: {device.android_id}")
    return {"message": "Device activated"}

@router.get("/devices/stats/summary")
async def get_device_statistics(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Get device statistics summary"""
    
    since_date = get_hkt_now() - timedelta(days=days)
    
    # Total devices
    total_devices = db.query(func.count(Device.id)).filter(
        Device.is_active == True
    ).scalar()
    
    # Active devices (checked in period)
    active_devices = db.query(func.count(Device.id)).filter(
        and_(
            Device.is_active == True,
            Device.last_check_time >= since_date
        )
    ).scalar()
    
    # Device OS distribution
    os_distribution = db.query(
        Device.os_version,
        func.count(Device.id).label('count')
    ).filter(
        and_(
            Device.is_active == True,
            Device.last_check_time >= since_date
        )
    ).group_by(Device.os_version).all()
    
    # Device model distribution (top 10)
    model_distribution = db.query(
        Device.device_model,
        func.count(Device.id).label('count')
    ).filter(
        and_(
            Device.is_active == True,
            Device.last_check_time >= since_date
        )
    ).group_by(Device.device_model).order_by(
        func.count(Device.id).desc()
    ).limit(10).all()
    
    # New devices in period
    new_devices = db.query(func.count(Device.id)).filter(
        Device.created_at >= since_date
    ).scalar()
    
    return {
        "period_days": days,
        "total_devices": total_devices,
        "active_devices": active_devices,
        "new_devices": new_devices,
        "os_distribution": [
            {"os_version": os, "count": count} 
            for os, count in os_distribution
        ],
        "top_device_models": [
            {"model": model, "count": count} 
            for model, count in model_distribution
        ]
    }

@router.post("/devices/bulk/deactivate")
async def bulk_deactivate_devices(
    days_inactive: int = Query(90, ge=30, le=365, description="Deactivate devices not seen in N days"),
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Bulk deactivate inactive devices"""
    
    cutoff_date = get_hkt_now() - timedelta(days=days_inactive)
    
    # Update devices
    affected = db.query(Device).filter(
        and_(
            Device.is_active == True,
            Device.last_check_time < cutoff_date
        )
    ).update({
        "is_active": False,
        "updated_at": get_hkt_now()
    })
    
    db.commit()
    
    logger.info(f"Bulk deactivated {affected} devices")
    
    return {
        "message": f"Deactivated {affected} devices",
        "criteria": f"Not seen in {days_inactive} days"
    }

# Update Logs
@router.get("/logs")
async def get_update_logs(
    app_id: Optional[str] = None,
    branch: Optional[str] = None,
    device_id: Optional[int] = None,
    status: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Get update logs with filters"""
    query = db.query(UpdateLog)
    
    if device_id:
        query = query.filter(UpdateLog.device_id == device_id)
    
    if status:
        query = query.filter(UpdateLog.status == status)
    
    if date_from:
        query = query.filter(UpdateLog.created_at >= date_from)
    
    if date_to:
        query = query.filter(UpdateLog.created_at <= date_to)

    if branch:
        query = query.join(Branch).filter(Branch.id == branch)
    
    if app_id:
        # Join with application table
        query = query.join(Application).filter(Application.id == app_id)
    
    logs = query.order_by(UpdateLog.created_at.desc()).offset(skip).limit(limit).all()
    
    return {
        "total": query.count(),
        "logs": logs
    }