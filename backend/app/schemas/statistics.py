# backend/app/schemas/statistics.py
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class VersionStatistics(BaseModel):
    version_name: str
    version_code: int
    check_count: int
    download_count: Optional[int] = 0

class DailyTrend(BaseModel):
    date: str
    count: int

class Statistics(BaseModel):
    period: str
    total_apps: int
    total_versions: int
    active_devices: int
    update_checks: int
    downloads: int
    version_distribution: List[dict]
    daily_trend: List[DailyTrend]
