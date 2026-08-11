from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import Dict
from jose import jwt, JWTError
import json
import logging

from ...database import get_db
from ...models import Device
from ...models.screen_session import ScreenControlSession, ScreenControlLog
from ...schemas.screen_control import (
    ScreenCaptureRequest, TouchEventRequest, KeyEventRequest,
    TextInputRequest, SwipeGestureRequest, RotateScreenRequest,
    ScreenControlSessionResponse
)
from ...core.security import verify_token
from ...core.utils import get_hkt_now
from ...config import settings
from .mdm import ws_manager

logger = logging.getLogger("v2.screen_control")
logger.setLevel(logging.INFO)

router = APIRouter(tags=["Screen Control (v2)"])

# ============ WebSocket 連線管理（給前端用） ============

class ScreenStreamManager:
    """管理前端的螢幕串流 WebSocket 連線"""
    def __init__(self):
        self.active_streams: Dict[str, WebSocket] = {}  # {android_id: websocket}
    
    async def connect(self, websocket: WebSocket, android_id: str):
        await websocket.accept()
        self.active_streams[android_id] = websocket
        logger.info(f"🖥️ [Screen Stream] 前端已連線 | 設備: {android_id}")
    
    def disconnect(self, android_id: str):
        if android_id in self.active_streams:
            del self.active_streams[android_id]
            logger.info(f"🔌 [Screen Stream] 前端已斷線 | 設備: {android_id}")
    
    async def send_frame(self, android_id: str, frame_data: dict):
        """發送畫面給前端"""
        if android_id in self.active_streams:
            try:
                await self.active_streams[android_id].send_json(frame_data)
                return True
            except Exception as e:
                logger.error(f"發送畫面失敗: {e}")
                self.disconnect(android_id)
                return False
        return False

screen_stream_manager = ScreenStreamManager()

# ============ HTTP API Endpoints ============

@router.post("/admin/devices/{android_id}/screen/start")
async def start_screen_capture(
    android_id: str,
    request: ScreenCaptureRequest,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """[Admin] 啟動螢幕截取"""
    
    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    if not device.is_online:
        raise HTTPException(status_code=400, detail="Device is offline")
    
    # 建立 Session 記錄
    session_id = f"screen_{android_id}_{int(get_hkt_now().timestamp()*1000)}"
    session = ScreenControlSession(
        device_id=device.id,
        admin_user=token_payload.get("sub", "admin"),
        session_id=session_id,
        quality=request.quality,
        scale=request.scale
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    
    # 發送指令給 MDM App
    command = {
        "action": "DC_screen_capture",
        "target_app": "com.kowloondairy.mdmapp",
        "task_id": session_id,
        "quality": request.quality,
        "scale": request.scale
    }
    
    success = await ws_manager.send_command(android_id, command)
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to send command to device")
    
    return {
        "status": "started",
        "session_id": session_id,
        "message": "Screen capture started"
    }

@router.post("/admin/devices/{android_id}/screen/stop")
async def stop_screen_capture(
    android_id: str,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """[Admin] 停止螢幕截取"""
    
    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # 更新 Session 狀態
    active_session = db.query(ScreenControlSession).filter(
        and_(
            ScreenControlSession.device_id == device.id,
            ScreenControlSession.is_active == True
        )
    ).first()
    
    if active_session:
        active_session.is_active = False
        active_session.ended_at = get_hkt_now()
        db.commit()
    
    # 發送停止指令
    command = {
        "action": "DC_stop_capture",
        "target_app": "com.kowloondairy.mdmapp",
        "task_id": f"stop_{int(get_hkt_now().timestamp()*1000)}"
    }
    
    await ws_manager.send_command(android_id, command)
    
    return {"status": "stopped", "message": "Screen capture stopped"}

@router.post("/admin/devices/{android_id}/screen/touch")
async def send_touch_event(
    android_id: str,
    request: TouchEventRequest,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """[Admin] 發送觸控事件"""
    
    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    task_id = f"touch_{int(get_hkt_now().timestamp()*1000)}"
    
    command = {
        "action": "DC_touch_event",
        "target_app": "com.kowloondairy.mdmapp",
        "task_id": task_id,
        "x": request.x,
        "y": request.y,
        "touch_action": request.action
    }
    
    # 記錄操作日誌
    log_session(db, device.id, "tap", json.dumps({"x": request.x, "y": request.y}))
    
    success = await ws_manager.send_command(android_id, command)
    
    if not success:
        raise HTTPException(status_code=400, detail="Device offline")
    
    return {"status": "sent", "task_id": task_id}

@router.post("/admin/devices/{android_id}/screen/key")
async def send_key_event(
    android_id: str,
    request: KeyEventRequest,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """[Admin] 發送按鍵事件"""
    
    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    task_id = f"key_{int(get_hkt_now().timestamp()*1000)}"
    
    command = {
        "action": "DC_key_event",
        "target_app": "com.kowloondairy.mdmapp",
        "task_id": task_id,
        "keycode": request.keycode
    }
    
    log_session(db, device.id, "key", json.dumps({"keycode": request.keycode}))
    
    success = await ws_manager.send_command(android_id, command)
    
    if not success:
        raise HTTPException(status_code=400, detail="Device offline")
    
    return {"status": "sent", "task_id": task_id}

@router.post("/admin/devices/{android_id}/screen/input")
async def send_text_input(
    android_id: str,
    request: TextInputRequest,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """[Admin] 發送文字輸入"""
    
    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    task_id = f"input_{int(get_hkt_now().timestamp()*1000)}"
    
    command = {
        "action": "DC_input_text",
        "target_app": "com.kowloondairy.mdmapp",
        "task_id": task_id,
        "text": request.text
    }
    
    log_session(db, device.id, "input_text", json.dumps({"text": request.text}))
    
    success = await ws_manager.send_command(android_id, command)
    
    if not success:
        raise HTTPException(status_code=400, detail="Device offline")
    
    return {"status": "sent", "task_id": task_id}

@router.post("/admin/devices/{android_id}/screen/swipe")
async def send_swipe_gesture(
    android_id: str,
    request: SwipeGestureRequest,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """[Admin] 發送滑動手勢"""
    
    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    task_id = f"swipe_{int(get_hkt_now().timestamp()*1000)}"
    
    command = {
        "action": "DC_swipe",
        "target_app": "com.kowloondairy.mdmapp",
        "task_id": task_id,
        "start_x": request.start_x,
        "start_y": request.start_y,
        "end_x": request.end_x,
        "end_y": request.end_y,
        "duration": request.duration
    }
    
    log_session(db, device.id, "swipe", json.dumps(request.dict()))
    
    success = await ws_manager.send_command(android_id, command)
    
    if not success:
        raise HTTPException(status_code=400, detail="Device offline")
    
    return {"status": "sent", "task_id": task_id}

@router.post("/admin/devices/{android_id}/screen/rotate")
async def rotate_screen(
    android_id: str,
    request: RotateScreenRequest,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """[Admin] 旋轉螢幕方向"""
    
    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    task_id = f"rotate_{int(get_hkt_now().timestamp()*1000)}"
    
    command = {
        "action": "DC_rotate_screen",
        "target_app": "com.kowloondairy.mdmapp",
        "task_id": task_id,
        "rotation": request.rotation
    }
    
    success = await ws_manager.send_command(android_id, command)
    
    if not success:
        raise HTTPException(status_code=400, detail="Device offline")
    
    return {"status": "sent", "task_id": task_id}

@router.post("/admin/devices/{android_id}/screen/screenshot")
async def capture_screenshot(
    android_id: str,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """[Admin] 截取單一畫面快照"""
    
    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    task_id = f"screenshot_{int(get_hkt_now().timestamp()*1000)}"
    
    command = {
        "action": "DC_screenshot",
        "target_app": "com.kowloondairy.mdmapp",
        "task_id": task_id
    }
    
    success = await ws_manager.send_command(android_id, command)
    
    if not success:
        raise HTTPException(status_code=400, detail="Device offline")
    
    return {"status": "sent", "task_id": task_id, "message": "Screenshot will be returned via WebSocket"}

# ============ WebSocket Endpoint（給前端接收畫面） ============

@router.websocket("/ws/screen/live/{android_id}")
async def screen_stream_websocket(
    websocket: WebSocket,
    android_id: str,
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        await websocket.close(code=1008)
        return

    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        await websocket.close(code=1008)
        return

    await screen_stream_manager.connect(websocket, android_id)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                continue
            # 把前端的畫面請求轉發給裝置（走裝置的 WS）
            if msg.get("type") == "request_frame":
                await ws_manager.send_command(android_id, {
                    "action": "DC_request_frame",
                    "target_app": "com.kowloondairy.mdmapp",
                    "task_id": f"frame_{int(get_hkt_now().timestamp()*1000)}"
                })
    except WebSocketDisconnect:
        screen_stream_manager.disconnect(android_id)

# ============ 輔助函式 ============

def log_session(db: Session, device_id: int, action: str, params: str):
    """記錄操作日誌"""
    try:
        active_session = db.query(ScreenControlSession).filter(
            and_(
                ScreenControlSession.device_id == device_id,
                ScreenControlSession.is_active == True
            )
        ).first()
        
        if active_session:
            log = ScreenControlLog(
                session_id=active_session.id,
                action=action,
                params=params
            )
            db.add(log)
            db.commit()
    except Exception as e:
        logger.error(f"記錄操作日誌失敗: {e}")