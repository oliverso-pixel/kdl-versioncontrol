from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import Dict
from jose import jwt, JWTError
import json
import logging
import base64
from io import BytesIO
from PIL import Image

from ...database import get_db
from ...models import Device
from ...models.screen_session import ScreenControlSession, ScreenControlLog
from ...schemas.screen_control import (
    ScreenCaptureRequest, TouchEventRequest, KeyEventRequest,
    TextInputRequest, SwipeGestureRequest, RotateScreenRequest,
    GestureRequest
)
from ...core.security import verify_token
from ...core.utils import get_hkt_now
from ...core.redis_manager import redis_manager
from ...config import settings
from .mdm import ws_manager

logger = logging.getLogger("v2.screen_control")
logger.setLevel(logging.INFO)

router = APIRouter(tags=["Screen Control (v2)"])

# ============ 圖片處理工具 ============

async def compress_image(image_base64: str, quality: int = 60, scale: int = 2) -> str:
    """壓縮並縮放圖片"""
    try:
        # 解碼 Base64
        image_data = base64.b64decode(image_base64)
        img = Image.open(BytesIO(image_data))
        
        # 縮放
        if scale > 1:
            new_size = (img.width // scale, img.height // scale)
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        # 轉換為 RGB（PNG 可能是 RGBA）
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # 壓縮
        buffer = BytesIO()
        img.save(buffer, format='JPEG', quality=quality, optimize=True)
        
        # 編碼回 Base64
        compressed = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        logger.info(f"🖼️ 圖片壓縮: {len(image_base64)} → {len(compressed)} bytes (減少 {100 - int(len(compressed)/len(image_base64)*100)}%)")
        
        return compressed
        
    except Exception as e:
        logger.error(f"圖片壓縮失敗: {e}")
        return image_base64

# ============ WebSocket 連線管理（給前端用） ============

class ScreenStreamManager:

    """管理前端的螢幕串流 WebSocket 連線"""
    
    def __init__(self):
        self.active_streams: Dict[str, WebSocket] = {}
    
    async def connect(self, websocket: WebSocket, android_id: str):
        await websocket.accept()
        self.active_streams[android_id] = websocket
        logger.info(f"🖥️ [Screen Stream] 前端已連線 | 設備: {android_id}")
        
        # 標記 Session 為活躍
        await redis_manager.set_screen_session(android_id, {
            "active": True,
            "connected_at": get_hkt_now().isoformat()
        })
    
    def disconnect(self, android_id: str):
        if android_id in self.active_streams:
            del self.active_streams[android_id]
            logger.info(f"🔌 [Screen Stream] 前端已斷線 | 設備: {android_id}")
    
    async def send_frame(self, android_id: str, frame_data: dict):
        """發送畫面給前端 — 直接轉發 device 已壓縮的 JPEG，不再二次壓縮"""
        if android_id in self.active_streams:
            try:
                # FPS 限制（防止 device 端過度餵送把前端塞爆）
                if not await redis_manager.set_fps_limit(android_id, settings.SCREEN_MAX_FPS):
                    return False  # 超過 FPS 限制，丟棄此幀

                await self.active_streams[android_id].send_json(frame_data)
                await redis_manager.increment_frame_count(android_id)
                return True
            except Exception as e:
                logger.error(f"發送畫面失敗: {e}")
                self.disconnect(android_id)
                return False
        return False
    
    async def send_error(self, android_id: str, error_message: str):
        """發送錯誤訊息"""
        if android_id in self.active_streams:
            try:
                await self.active_streams[android_id].send_json({
                    "type": "error",
                    "message": error_message,
                    "timestamp": get_hkt_now().timestamp() * 1000
                })
            except Exception as e:
                logger.error(f"發送錯誤訊息失敗: {e}")

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

    # 檢查設備是否在線（從 Redis）
    is_online = await redis_manager.is_device_online(android_id)
    if not device.is_online:
        raise HTTPException(status_code=400, detail="Device is offline")
    
    # 若已有活躍 Session，複用同一 session_id（讓 App 端 idempotent 判斷）
    # 不再直接 raise 400，避免使用者需要每次都被打斷
    existing_session = await redis_manager.get_screen_session(android_id)
    reuse = bool(existing_session and existing_session.get("active"))
    
    # 若複用則沿用原 session_id，否則新建
    if reuse:
        session_id = existing_session.get("session_id") or \
            f"screen_{android_id}_{int(get_hkt_now().timestamp()*1000)}"
    else:
        session_id = f"screen_{android_id}_{int(get_hkt_now().timestamp()*1000)}"
        db_session = ScreenControlSession(
            device_id=device.id,
            admin_user=token_payload.get("sub", "admin"),
            session_id=session_id,
            quality=request.quality,
            scale=request.scale
        )
        db.add(db_session)
        db.commit()

    # 更新/刷新 Redis session（TTL 重置）
    await redis_manager.set_screen_session(android_id, {
        "session_id": session_id,
        "quality": request.quality,
        "scale": request.scale,
        "active": True,
        "admin_user": token_payload.get("sub")
    })
    
    # 發送指令給 MDM App（App 端會判斷 Service 是否已在跑，idempotent）
    command = {
        "action": "DC_screen_capture",
        "target_app": "com.kowloondairy.mdmapp",
        "task_id": session_id,
        "quality": request.quality,
        "scale": request.scale
    }
    await redis_manager.push_command(android_id, command)
    success = await ws_manager.send_command(android_id, command)
    
    if not success and not reuse:
        # 首次啟動且指令發送失敗才清理
        await redis_manager.delete_screen_session(android_id)
        raise HTTPException(status_code=400, detail="Failed to send command to device")

    logger.info(
        f"📸 [Screen Capture] {'複用' if reuse else '已啟動'} | 設備: {android_id} | Session: {session_id}"
    )
    return {
        "status": "reused" if reuse else "started",
        "session_id": session_id,
        "quality": request.quality,
        "scale": request.scale,
        "message": "Screen capture reused" if reuse else "Screen capture started"
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
    
    # 取得 Session
    session_data = await redis_manager.get_screen_session(android_id)
    
    # 更新資料庫 Session 狀態
    if session_data:
        active_session = db.query(ScreenControlSession).filter(
            ScreenControlSession.session_id == session_data.get("session_id")
        ).first()
        
        if active_session:
            active_session.is_active = False
            active_session.ended_at = get_hkt_now()
            db.commit()
    
    # 清理 Redis
    await redis_manager.delete_screen_session(android_id)
    await redis_manager.clear_screen_frame(android_id)
    
    # 發送停止指令
    command = {
        "action": "DC_stop_capture",
        "target_app": "com.kowloondairy.mdmapp",
        "task_id": f"stop_{int(get_hkt_now().timestamp()*1000)}"
    }
    
    await ws_manager.send_command(android_id, command)
    
    logger.info(f"⏹️ [Screen Capture] 已停止 | 設備: {android_id}")
    
    # 斷開前端連線
    screen_stream_manager.disconnect(android_id)
    
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

    # 檢查 Session
    session_data = await redis_manager.get_screen_session(android_id)
    if not session_data or not session_data.get("active"):
        raise HTTPException(status_code=400, detail="No active screen session")
    
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
    
    # 推送到佇列並發送
    await redis_manager.push_command(android_id, command)
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
    
    await redis_manager.push_command(android_id, command)
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
    
    await redis_manager.push_command(android_id, command)
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
    
    await redis_manager.push_command(android_id, command)
    success = await ws_manager.send_command(android_id, command)
    
    if not success:
        raise HTTPException(status_code=400, detail="Device offline")
    
    return {"status": "sent", "task_id": task_id}

@router.post("/admin/devices/{android_id}/screen/gesture")
async def send_gesture(
    android_id: str,
    request: GestureRequest,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """[Admin] 發送統一手勢（tap / long-press / swipe / drag / multi-touch）。

    Frontend 依 stroke 內容自行判斷手勢類型並封裝為 strokes 陣列，
    device 端由 AccessibilityService 的 GestureDescription 直接派送。
    """
    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    session_data = await redis_manager.get_screen_session(android_id)
    if not session_data or not session_data.get("active"):
        raise HTTPException(status_code=400, detail="No active screen session")

    task_id = f"gesture_{int(get_hkt_now().timestamp()*1000)}"

    # 把 pydantic 模型轉為 dict-of-dict，交給 MDM 端解析
    strokes_payload = [
        {
            "points": [{"x": p.x, "y": p.y} for p in stroke.points],
            "duration_ms": stroke.duration_ms,
            "start_ms": stroke.start_ms,
        }
        for stroke in request.strokes
    ]

    command = {
        "action": "DC_gesture",
        "target_app": "com.kowloondairy.mdmapp",
        "task_id": task_id,
        "strokes": strokes_payload,
    }

    # 記錄一筆簡短摘要（避免整段軌跡塞爆 log）
    summary = ", ".join(
        f"{len(s.points)}pt/{s.duration_ms}ms" for s in request.strokes
    )
    log_session(db, device.id, "gesture", summary)

    await redis_manager.push_command(android_id, command)
    success = await ws_manager.send_command(android_id, command)

    if not success:
        raise HTTPException(status_code=400, detail="Device offline")

    return {"status": "sent", "task_id": task_id}


@router.get("/admin/devices/{android_id}/screen/status")
async def get_screen_status(
    android_id: str,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """取得螢幕控制狀態"""
    
    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # 從 Redis 取得狀態
    session_data = await redis_manager.get_screen_session(android_id)
    is_online = await redis_manager.is_device_online(android_id)
    frame_count = await redis_manager.get_frame_count(android_id)
    queue_length = await redis_manager.get_command_queue_length(android_id)
    
    return {
        "android_id": android_id,
        "is_online": is_online,
        "has_active_session": bool(session_data and session_data.get("active")),
        "session_data": session_data,
        "frame_count": frame_count,
        "command_queue_length": queue_length
    }

# ============ WebSocket Endpoint（給前端接收畫面） ============

@router.websocket("/ws/screen/live/{android_id}")
async def screen_stream_websocket(
    websocket: WebSocket,
    android_id: str,
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    """前端接收螢幕畫面的 WebSocket"""
    
    # 驗證 Token
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
            
            # 前端請求畫面
            if msg.get("type") == "request_frame":
                # 先嘗試從 Redis 取得快取
                cached_frame = await redis_manager.get_screen_frame(android_id)
                
                if cached_frame:
                    await websocket.send_json({
                        "type": "screen_frame",
                        "image_base64": base64.b64encode(cached_frame).decode(),
                        "source": "cache",
                        "timestamp": get_hkt_now().timestamp() * 1000
                    })
                else:
                    # 請求 MDM App 提供新畫面
                    await ws_manager.send_command(android_id, {
                        "action": "DC_request_frame",
                        "target_app": "com.kowloondairy.mdmapp",
                        "task_id": f"frame_{int(get_hkt_now().timestamp()*1000)}"
                    })
            
            # 前端發送控制指令（滑鼠、鍵盤）
            elif msg.get("type") == "control":
                command = {
                    "action": f"DC_{msg.get('action')}",
                    "target_app": "com.kowloondairy.mdmapp",
                    "task_id": f"ctrl_{int(get_hkt_now().timestamp()*1000)}",
                    **msg.get("params", {})
                }
                await redis_manager.push_command(android_id, command)
                await ws_manager.send_command(android_id, command)
            
    except WebSocketDisconnect:
        # 只斷開前端串流連線，保留 device 端 ScreenCaptureService 常駐
        # 這樣下次使用者重新開視窗時不需要重新授權 MediaProjection
        # 明確結束 capture 由 /screen/stop API 或裝置重啟時處理
        screen_stream_manager.disconnect(android_id)
        logger.info(f"🔌 [Screen Stream] 前端斷線，保留 device 端 capture Service | 設備: {android_id}")

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
