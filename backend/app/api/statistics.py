from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, timedelta
from typing import Optional
from ..database import get_db
from ..models import Application, Version, Device, UpdateLog
from ..schemas.statistics import Statistics, VersionStatistics
from ..core.security import verify_token

router = APIRouter(prefix="/api/admin", tags=["Statistics"])

@router.get("/statistics")
async def get_statistics(
    period: str = Query("week", regex="^(day|week|month|year)$"),
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Get system statistics"""
    
    # Calculate date range
    now = datetime.utcnow()
    if period == "day":
        start_date = now - timedelta(days=1)
    elif period == "week":
        start_date = now - timedelta(days=7)
    elif period == "month":
        start_date = now - timedelta(days=30)
    else:  # year
        start_date = now - timedelta(days=365)
    
    # Total counts
    total_apps = db.query(func.count(Application.id)).filter(
        Application.is_active == True
    ).scalar()
    
    total_versions = db.query(func.count(Version.id)).filter(
        Version.is_active == True
    ).scalar()
    
    # Active devices (checked in period)
    active_devices = db.query(func.count(func.distinct(Device.id))).filter(
        Device.last_check_time >= start_date
    ).scalar()
    
    # Update checks in period
    update_checks = db.query(func.count(UpdateLog.id)).filter(
        and_(
            UpdateLog.created_at >= start_date,
            UpdateLog.update_type == "check"
        )
    ).scalar()
    
    # Downloads in period
    downloads = db.query(func.count(UpdateLog.id)).filter(
        and_(
            UpdateLog.created_at >= start_date,
            UpdateLog.update_type == "download",
            UpdateLog.status == "success"
        )
    ).scalar()
    
    # Version distribution
    version_stats = db.query(
        Version.version_name,
        func.count(UpdateLog.id).label('count')
    ).join(
        UpdateLog, UpdateLog.to_version == func.cast(Version.version_code, func.String)
    ).filter(
        and_(
            UpdateLog.created_at >= start_date,
            UpdateLog.update_type == "check"
        )
    ).group_by(Version.version_name).all()
    
    # Daily trend
    daily_trend = db.query(
        func.date(UpdateLog.created_at).label('date'),
        func.count(UpdateLog.id).label('count')
    ).filter(
        and_(
            UpdateLog.created_at >= start_date,
            UpdateLog.update_type == "check"
        )
    ).group_by(func.date(UpdateLog.created_at)).all()
    
    return {
        "period": period,
        "total_apps": total_apps,
        "total_versions": total_versions,
        "active_devices": active_devices,
        "update_checks": update_checks,
        "downloads": downloads,
        "version_distribution": [
            {"version": v[0], "count": v[1]} for v in version_stats
        ],
        "daily_trend": [
            {"date": str(d[0]), "count": d[1]} for d in daily_trend
        ]
    }

@router.get("/statistics/applications/{app_id}")
async def get_app_statistics(
    app_id: str,
    period: str = Query("week", regex="^(day|week|month|year)$"),
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Get statistics for specific application"""
    
    app = db.query(Application).filter(Application.app_id == app_id).first()
    if not app:
        return {"error": "Application not found"}
    
    # Calculate date range
    now = datetime.utcnow()
    if period == "day":
        start_date = now - timedelta(days=1)
    elif period == "week":
        start_date = now - timedelta(days=7)
    elif period == "month":
        start_date = now - timedelta(days=30)
    else:  # year
        start_date = now - timedelta(days=365)
    
    # Version statistics
    versions = db.query(
        Version.version_name,
        Version.version_code,
        func.count(UpdateLog.id).label('checks')
    ).join(
        UpdateLog, and_(
            UpdateLog.application_id == app.id,
            UpdateLog.to_version == func.cast(Version.version_code, func.String)
        )
    ).filter(
        and_(
            Version.application_id == app.id,
            UpdateLog.created_at >= start_date,
            UpdateLog.update_type == "check"
        )
    ).group_by(Version.version_name, Version.version_code).all()
    
    # Device platform distribution
    device_stats = db.query(
        Device.os_version,
        func.count(func.distinct(Device.id)).label('count')
    ).join(
        UpdateLog, UpdateLog.device_id == Device.id
    ).filter(
        and_(
            UpdateLog.application_id == app.id,
            UpdateLog.created_at >= start_date
        )
    ).group_by(Device.os_version).all()
    
    return {
        "application": app.name,
        "period": period,
        "versions": [
            {
                "version_name": v[0],
                "version_code": v[1],
                "check_count": v[2]
            } for v in versions
        ],
        "device_distribution": [
            {"os_version": d[0], "count": d[1]} for d in device_stats
        ]
    }