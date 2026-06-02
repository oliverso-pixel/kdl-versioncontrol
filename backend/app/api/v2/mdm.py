from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from typing import Dict, Any
import json

from ...database import get_db
from ...core.security import verify_token, verify_api_key
from ...models import Device

router = APIRouter(prefix="/api/v2", tags=["MDM Control (v2)"])

# 設備級別的 WebSocket 連線管理器
class DeviceConnectionManager:
    def __init__(self):
        # 格式: { "android_id": WebSocket }
        self.active_devices: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, android_id: str):
        await websocket.accept()
        self.active_devices[android_id] = websocket

    def disconnect(self, android_id: str):
        if android_id in self.active_devices:
            del self.active_devices[android_id]

    async def send_command(self, android_id: str, command: dict):
        if android_id in self.active_devices:
            await self.active_devices[android_id].send_json(command)
            return True
        return False

device_manager = DeviceConnectionManager()

# 1. MDM App 連接的 WebSocket Endpoint (使用 API Key 驗證)
@router.websocket("/ws/device/{android_id}")
async def device_websocket(
    websocket: WebSocket, 
    android_id: str, 
    api_key: str = Query(...)
):
    # 簡易的 API Key 驗證 (實際環境可注入 DB dependency)
    if api_key != "test-api-key-123": # 請替換為 verify_api_key 邏輯
        await websocket.close(code=1008)
        return

    await device_manager.connect(websocket, android_id)
    try:
        while True:
            data = await websocket.receive_text()
            # 這裡可以處理 MDM 主動發送的 Heartbeat 或 Log 狀態
            message = json.loads(data)
            if message.get("type") == "log_upload":
                # 處理 Log 存檔邏輯...
                pass
    except WebSocketDisconnect:
        device_manager.disconnect(android_id)

# 2. Admin 發送遠端指令的 API (使用 JWT Token 驗證)
@router.post("/admin/devices/{android_id}/command")
async def send_device_command(
    android_id: str,
    command_payload: Dict[str, Any],
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token) # admin login logic
):
    """
    Web Panel 呼叫此 API，將指令發送給指定的 Android 設備
    Command Payload 範例:
    { "action": "reboot" }
    { "action": "update_settings", "target_app": "AppA", "settings": {...} }
    { "action": "fetch_logs", "target_app": "AppB" }
    { "action": "push_notification", "target_app": "AppC", "message": "Hello" }
    """
    # 確認設備是否存在於 DB
    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    success = await device_manager.send_command(android_id, command_payload)
    if not success:
        raise HTTPException(status_code=400, detail="Device is currently offline")
    
    return {"status": "success", "message": f"Command sent to {android_id}"}
