"""
地址回填背景任務：定期補上 device_location_history 中 address 為 NULL 的紀錄。

NULL 的來源：Nominatim 掛掉/超時期間的即時上報 (geocoder 放棄後寫 NULL)。
規則：
  - 每輪最多處理 BATCH 筆，新資料優先
  - 與即時反查共用 geocoder 的 Semaphore 與快取 (同裝置停在原地的
    一批 NULL 通常只需真正反查一次)
  - 每筆之間 sleep 限速，回填永遠讓路給即時上報
  - 連續失敗 (None = server 有問題) 即中止本輪，下一輪再試
  - 查到 "" (該座標無地址) 也寫入，避免每輪重複處理同一筆
"""
import asyncio
import logging

from sqlalchemy import text

from ..config import settings
from ..database import SessionLocal
from .geocoder import reverse_geocode_zh

logger = logging.getLogger("address_backfill")

PER_ROW_DELAY = 0.2        # 每筆之間的限速 (秒)
MAX_CONSECUTIVE_FAILURES = 3


async def backfill_once() -> int:
    """補一輪，回傳成功補上的筆數。"""
    db = SessionLocal()
    try:
        rows = db.execute(text("""
            SELECT id, latitude, longitude
            FROM device_location_history
            WHERE address IS NULL
              AND latitude IS NOT NULL AND longitude IS NOT NULL
            ORDER BY id DESC
            LIMIT :n
        """), {"n": settings.GEOCODE_BACKFILL_BATCH}).fetchall()

        if not rows:
            return 0

        filled = 0
        consecutive_failures = 0
        for row in rows:
            address = await reverse_geocode_zh(float(row.latitude), float(row.longitude))

            if address is None:
                # server 故障/超時 -> 連續多次就中止本輪，等下一輪
                consecutive_failures += 1
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    logger.warning(f"Backfill aborted after {consecutive_failures} consecutive failures")
                    break
                continue

            consecutive_failures = 0
            db.execute(
                text("UPDATE device_location_history SET address = :a WHERE id = :i"),
                {"a": address, "i": row.id},
            )
            db.commit()
            filled += 1
            await asyncio.sleep(PER_ROW_DELAY)

        return filled
    finally:
        db.close()


async def backfill_loop():
    if not settings.NOMINATIM_BASE_URL:
        logger.info("NOMINATIM_BASE_URL not set; address backfill disabled")
        return
    logger.info(
        f"Address backfill task started (interval={settings.GEOCODE_BACKFILL_INTERVAL}s, "
        f"batch={settings.GEOCODE_BACKFILL_BATCH})"
    )
    while True:
        await asyncio.sleep(settings.GEOCODE_BACKFILL_INTERVAL)
        try:
            filled = await backfill_once()
            if filled:
                logger.info(f"Backfilled {filled} address rows")
        except Exception as e:
            logger.error(f"Backfill round failed: {type(e).__name__}: {e}")
