# backend/app/core/redis_manager.py

import redis.asyncio as aioredis
from redis.asyncio import ConnectionPool
from typing import Optional, Any
import json
import logging
import time
from ..config import settings

logger = logging.getLogger(__name__)

class RedisManager:
    def __init__(self):
        self.pool: Optional[ConnectionPool] = None
        self.client: Optional[aioredis.Redis] = None
    
    async def initialize(self):
        """初始化 Redis 連接池"""
        try:
            self.pool = ConnectionPool.from_url(
                settings.REDIS_URL,
                max_connections=settings.REDIS_MAX_CONNECTIONS,
                decode_responses=False  # 支援二進位數據
            )
            self.client = aioredis.Redis(connection_pool=self.pool)
            
            # 測試連接
            await self.client.ping()
            logger.info("✅ Redis 連線成功")
            
        except Exception as e:
            logger.error(f"❌ Redis 連線失敗: {e}")
            raise
    
    async def close(self):
        """關閉連接"""
        if self.client:
            await self.client.close()
        if self.pool:
            await self.pool.disconnect()
    
    # ==================== 螢幕畫面快取 ====================
    
    async def cache_screen_frame(
        self, 
        android_id: str, 
        frame_data: bytes,
        ttl: int = None
    ) -> bool:
        """快取螢幕畫面"""
        try:
            key = f"screen:frame:{android_id}"
            ttl = ttl or settings.SCREEN_FRAME_TTL
            await self.client.setex(key, ttl, frame_data)
            return True
        except Exception as e:
            logger.error(f"快取畫面失敗: {e}")
            return False
    
    async def get_screen_frame(self, android_id: str) -> Optional[bytes]:
        """取得快取的螢幕畫面"""
        try:
            key = f"screen:frame:{android_id}"
            return await self.client.get(key)
        except Exception as e:
            logger.error(f"讀取快取畫面失敗: {e}")
            return None
    
    async def clear_screen_frame(self, android_id: str):
        """清除快取的螢幕畫面"""
        key = f"screen:frame:{android_id}"
        await self.client.delete(key)
    
    # ==================== Session 管理 ====================
    
    async def set_screen_session(
        self, 
        android_id: str, 
        session_data: dict,
        ttl: int = 3600
    ):
        """設定螢幕控制 Session"""
        key = f"screen:session:{android_id}"
        await self.client.setex(key, ttl, json.dumps(session_data))
    
    async def get_screen_session(self, android_id: str) -> Optional[dict]:
        """取得螢幕控制 Session"""
        key = f"screen:session:{android_id}"
        data = await self.client.get(key)
        return json.loads(data) if data else None
    
    async def delete_screen_session(self, android_id: str):
        """刪除螢幕控制 Session"""
        key = f"screen:session:{android_id}"
        await self.client.delete(key)
    
    # ==================== 指令佇列 ====================
    
    async def push_command(self, android_id: str, command: dict) -> int:
        """推送指令到佇列"""
        key = f"commands:{android_id}"
        return await self.client.rpush(key, json.dumps(command))
    
    async def pop_command(self, android_id: str) -> Optional[dict]:
        """彈出指令（FIFO）"""
        key = f"commands:{android_id}"
        data = await self.client.lpop(key)
        return json.loads(data) if data else None
    
    async def get_command_queue_length(self, android_id: str) -> int:
        """取得指令佇列長度"""
        key = f"commands:{android_id}"
        return await self.client.llen(key)
    
    # ==================== 連線狀態 ====================
    
    async def set_device_online(self, android_id: str, metadata: dict = None):
        """標記設備上線"""
        key = f"device:online:{android_id}"
        data = metadata or {}
        data["online_at"] = str(int(time.time()))
        await self.client.setex(key, 60, json.dumps(data))  # 60秒心跳
    
    async def is_device_online(self, android_id: str) -> bool:
        """檢查設備是否在線"""
        key = f"device:online:{android_id}"
        return await self.client.exists(key) > 0
    
    async def get_online_devices(self) -> list:
        """取得所有在線設備"""
        pattern = "device:online:*"
        keys = await self.client.keys(pattern)
        return [key.decode().split(":")[-1] for key in keys]
    
    # ==================== 統計與監控 ====================
    
    async def increment_frame_count(self, android_id: str):
        """增加畫面傳輸計數"""
        key = f"stats:frames:{android_id}"
        await self.client.incr(key)
        await self.client.expire(key, 3600)  # 1小時後過期
    
    async def get_frame_count(self, android_id: str) -> int:
        """取得畫面傳輸計數"""
        key = f"stats:frames:{android_id}"
        count = await self.client.get(key)
        return int(count) if count else 0
    
    async def set_fps_limit(self, android_id: str, max_fps: int = 15):
        """設定 FPS 限制（使用 Token Bucket）"""
        key = f"fps:limit:{android_id}"
        current_time = int(time.time() * 1000)
        
        # 如果 key 不存在，初始化
        if not await self.client.exists(key):
            await self.client.hset(key, mapping={
                "tokens": max_fps,
                "last_refill": current_time
            })
            await self.client.expire(key, 10)
        
        # 計算應補充的 token
        data = await self.client.hgetall(key)
        last_refill = int(data[b"last_refill"])
        tokens = int(data[b"tokens"])
        
        elapsed = current_time - last_refill
        refill = int((elapsed / 1000.0) * max_fps)
        
        new_tokens = min(max_fps, tokens + refill)
        
        if new_tokens > 0:
            await self.client.hset(key, mapping={
                "tokens": new_tokens - 1,
                "last_refill": current_time
            })
            return True
        
        return False

# 全域實例
redis_manager = RedisManager()
