# backend/app/schemas/__init__.py
from .application import Application, ApplicationCreate, ApplicationUpdate
from .branch import Branch, BranchCreate, BranchUpdate
from .device import Device, DeviceInfo
from .version import Version, VersionCreate, VersionCheckRequest, VersionCheckResponse
from .statistics import Statistics, VersionStatistics, DailyTrend
from .api_key import ApiKey, ApiKeyCreate
from .system_setting import SystemSetting, SystemSettingUpdate

__all__ = [
    "Application", "ApplicationCreate", "ApplicationUpdate",
    "Branch", "BranchCreate", "BranchUpdate",
    "Device", "DeviceInfo",
    "Version", "VersionCreate", "VersionCheckRequest", "VersionCheckResponse",
    "Statistics", "VersionStatistics", "DailyTrend",
    "ApiKey", "ApiKeyCreate",
    "SystemSetting", "SystemSettingUpdate"
]
