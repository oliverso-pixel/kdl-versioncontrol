import os
import json
import logging
from typing import Optional
from datetime import datetime

logger = logging.getLogger(__name__)

def ensure_directory_exists(path: str):
    """Ensure directory exists, create if not"""
    os.makedirs(path, exist_ok=True)

def save_device_info(device_info: dict) -> dict:
    """Process and save device information"""
    processed_info = {
        "android_id": device_info.get("android_id"),
        "device_model": device_info.get("device_model"),
        "os_version": device_info.get("os_version"),
        "app_version": device_info.get("app_version"),
        "additional_info": json.dumps(device_info.get("additional_info", {}))
    }
    return processed_info

def format_file_size(size_bytes: int) -> str:
    """Format file size in human readable format"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"

def setup_logging():
    """Setup logging configuration"""
    log_dir = "./logs"
    ensure_directory_exists(log_dir)
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(f"{log_dir}/app_{datetime.now().strftime('%Y%m%d')}.log"),
            logging.StreamHandler()
        ]
    )

def validate_version_code(version_code: int) -> bool:
    """Validate version code format"""
    return version_code > 0 and version_code < 2147483647  # Max int32

def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent directory traversal"""
    # Remove any directory components
    filename = os.path.basename(filename)
    # Remove any non-alphanumeric characters except dots and underscores
    filename = "".join(c for c in filename if c.isalnum() or c in "._-")
    return filename