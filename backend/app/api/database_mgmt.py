# backend/app/api/database_mgmt.py
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta
import os
import shutil
import subprocess
from ..database import get_db, engine
from ..models import UpdateLog, Device
from ..core.security import verify_token
from ..core.utils import ensure_directory_exists, get_hkt_now
from ..config import settings
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin/database", tags=["Database Management"])

@router.get("/stats")
async def get_database_stats(
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Get database statistics"""
    
    # Get table sizes
    table_stats = []
    tables = ['applications', 'branches', 'versions', 'devices', 'update_logs']
    
    for table in tables:
        try:
            result = db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            
            # Get table size (MySQL specific)
            size_query = text(f"""
                SELECT 
                    ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
                FROM information_schema.TABLES 
                WHERE table_schema = :db_name 
                AND table_name = :table_name
            """)
            
            size_result = db.execute(
                size_query, 
                {"db_name": settings.DB_NAME, "table_name": table}
            ).fetchone()
            
            table_stats.append({
                "name": table,
                "row_count": result,
                "size": f"{size_result[0] if size_result else 0} MB"
            })
        except Exception as e:
            logger.error(f"Error getting stats for table {table}: {e}")
    
    # Get total database size
    total_size_query = text("""
        SELECT 
            ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb
        FROM information_schema.TABLES 
        WHERE table_schema = :db_name
    """)
    
    total_size = db.execute(
        total_size_query, 
        {"db_name": settings.DB_NAME}
    ).scalar()
    
    return {
        "total_size": f"{total_size} MB",
        "table_stats": table_stats,
        "backup_status": "idle"
    }

@router.post("/backup")
async def backup_database(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Create database backup"""
    
    def perform_backup():
        try:
            backup_dir = "./backups"
            ensure_directory_exists(backup_dir)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_file = os.path.join(backup_dir, f"backup_{timestamp}.sql")
            
            # MySQL dump command
            command = [
                "mysqldump",
                f"--host={settings.DB_HOST}",
                f"--port={settings.DB_PORT}",
                f"--user={settings.DB_USER}",
                f"--password={settings.DB_PASSWORD}",
                settings.DB_NAME
            ]
            
            with open(backup_file, "w") as f:
                subprocess.run(command, stdout=f, check=True)
            
            # Compress the backup
            shutil.make_archive(backup_file.replace('.sql', ''), 'zip', backup_dir, os.path.basename(backup_file))
            os.remove(backup_file)
            
            logger.info(f"Database backup completed: {backup_file}.zip")
            
        except Exception as e:
            logger.error(f"Database backup failed: {e}")
    
    background_tasks.add_task(perform_backup)
    
    return {"message": "Backup started", "status": "in_progress"}

@router.post("/cleanup")
async def cleanup_database(
    days: int = 90,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Clean up old data"""
    
    cutoff_date = get_hkt_now() - timedelta(days=days)
    
    # Delete old update logs
    deleted_logs = db.query(UpdateLog).filter(
        UpdateLog.created_at < cutoff_date
    ).delete()
    
    # Delete inactive devices not seen in specified days
    deleted_devices = db.query(Device).filter(
        Device.last_check_time < cutoff_date
    ).delete()
    
    db.commit()
    
    # Clean up old APK files
    apk_cleanup_count = 0
    apk_dir = settings.APK_STORAGE_PATH
    
    if os.path.exists(apk_dir):
        for root, dirs, files in os.walk(apk_dir):
            for file in files:
                file_path = os.path.join(root, file)
                file_age = datetime.now() - datetime.fromtimestamp(os.path.getmtime(file_path))
                
                if file_age.days > days:
                    try:
                        os.remove(file_path)
                        apk_cleanup_count += 1
                    except Exception as e:
                        logger.error(f"Failed to delete file {file_path}: {e}")
    
    return {
        "deleted_logs": deleted_logs,
        "deleted_devices": deleted_devices,
        "deleted_apk_files": apk_cleanup_count,
        "message": f"Cleaned up data older than {days} days"
    }

@router.get("/export")
async def export_data(
    table: str,
    format: str = "csv",
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """Export table data"""
    
    allowed_tables = ['applications', 'branches', 'versions', 'devices', 'update_logs']
    
    if table not in allowed_tables:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid table. Allowed tables: {', '.join(allowed_tables)}"
        )
    
    # This is a simplified example. In production, you'd want to stream the response
    query = f"SELECT * FROM {table}"
    result = db.execute(text(query))
    
    if format == "csv":
        import csv
        import io
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write headers
        writer.writerow(result.keys())
        
        # Write data
        for row in result:
            writer.writerow(row)
        
        content = output.getvalue()
        
        from fastapi.responses import Response
        return Response(
            content=content,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={table}_{datetime.now().strftime('%Y%m%d')}.csv"
            }
        )
    
    return {"error": "Unsupported format"}
