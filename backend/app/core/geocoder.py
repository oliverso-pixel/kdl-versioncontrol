"""
Nominatim 反向地理編碼 (經緯度 -> 中文地址)。

設計原則：geocode 永遠不能拖垮裝置狀態上報 —
  - Semaphore 限制同時反查數，避免大量裝置同時重連時壓垮 Nominatim
  - 總時限 (排隊 + HTTP) 超過即放棄，回傳 None (address 寫 NULL，之後由回填任務補上)
  - 任何錯誤只記 log、回傳 None，不往外拋
  - LRU + TTL 快取：座標四捨五入到 4 位小數 (~11m)，裝置停在原地不重複反查

回傳語義：
  - str  : 中文地址 (查詢成功)
  - ""   : 查詢成功但該座標無地址 (例如海上)，不需重試
  - None : 查詢失敗 (超時 / server 掛了)，可以重試
"""
import asyncio
import logging
import time
from collections import OrderedDict
from typing import Optional

import httpx

from ..config import settings

logger = logging.getLogger("geocoder")

# 地址欄位取捨沿用既有的欄位挑選邏輯 (由細到粗)
ADDRESS_KEYS = ['amenity', 'road', 'neighbourhood', 'quarter', 'suburb', 'region', 'city']

MAX_CONCURRENT_REQUESTS = 8   # 同時最多 8 個反查請求
REQUEST_TIMEOUT = 3.0         # 單一 HTTP 請求時限 (秒)
TOTAL_BUDGET = 5.0            # 排隊 + 請求的總時限 (秒)，超過即放棄

CACHE_PRECISION = 4           # 座標四捨五入位數，4 位 ≈ 11 米
CACHE_MAX_ENTRIES = 5000
CACHE_TTL = 24 * 3600         # 秒

_semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

# NOMINATIM_BASE_URL 未設定 -> 停用反查 (reverse_geocode_zh 一律回 None)
_client = None
if settings.NOMINATIM_BASE_URL:
    _client = httpx.AsyncClient(
        base_url=settings.NOMINATIM_BASE_URL,
        timeout=REQUEST_TIMEOUT,
        headers={"User-Agent": "kdl-versioncontrol-mdm"},
    )
else:
    logger.warning("NOMINATIM_BASE_URL not set; reverse geocoding disabled (address will be NULL)")

# key: (lat, lng) 四捨五入後 -> (address, 過期時間戳)
_cache: "OrderedDict[tuple, tuple[str, float]]" = OrderedDict()


def _cache_get(key: tuple) -> Optional[str]:
    item = _cache.get(key)
    if item is None:
        return None
    address, expires_at = item
    if expires_at < time.monotonic():
        del _cache[key]
        return None
    _cache.move_to_end(key)
    return address


def _cache_put(key: tuple, address: str):
    _cache[key] = (address, time.monotonic() + CACHE_TTL)
    _cache.move_to_end(key)
    while len(_cache) > CACHE_MAX_ENTRIES:
        _cache.popitem(last=False)


async def _reverse(lat: float, lng: float) -> str:
    async with _semaphore:
        resp = await _client.get("/reverse", params={
            "lat": lat,
            "lon": lng,
            "format": "jsonv2",
            "accept-language": "zh-Hant",
        })
        resp.raise_for_status()
        addr = resp.json().get("address", {})
        parts = [addr[k] for k in ADDRESS_KEYS if addr.get(k)]
        return ", ".join(parts)


async def reverse_geocode_zh(lat: float, lng: float) -> Optional[str]:
    """經緯度反查中文地址 (帶快取)；未設定 server、失敗或超時回傳 None。"""
    if _client is None:
        return None

    key = (round(float(lat), CACHE_PRECISION), round(float(lng), CACHE_PRECISION))

    cached = _cache_get(key)
    if cached is not None:
        return cached

    try:
        address = await asyncio.wait_for(_reverse(lat, lng), timeout=TOTAL_BUDGET)
    except Exception as e:
        logger.warning(f"Reverse geocode failed for ({lat}, {lng}): {type(e).__name__}: {e}")
        return None

    _cache_put(key, address)  # "" (無地址) 也快取，避免重複查海上座標
    return address
