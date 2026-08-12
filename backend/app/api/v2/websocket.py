# backend/app/api/v2/websocket.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request
from typing import Dict, Set
from datetime import datetime
from ...core.utils import get_hkt_now
import json
import logging

logger = logging.getLogger("v2.websocket")
logger.setLevel(logging.INFO)

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.device_connections: Dict[WebSocket, dict] = {}
    
    async def connect(self, websocket: WebSocket, app_id: str, branch: str, client_ip: str):
        await websocket.accept()
        key = f"{app_id}:{branch}"
        
        if key not in self.active_connections:
            self.active_connections[key] = set()
        
        self.active_connections[key].add(websocket)
        self.device_connections[websocket] = {
            "app_id": app_id,
            "branch": branch,
            "client_ip": client_ip,
            "connected_at": get_hkt_now()
        }
        logger.info(f"[WS 連線建立] 來源 IP: {client_ip} | App: {app_id} | 分支: {branch} | 目前此分支連線數: {len(self.active_connections[key])}")
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.device_connections:
            conn_info = self.device_connections[websocket]
            key = f"{conn_info['app_id']}:{conn_info['branch']}"
            
            if key in self.active_connections:
                self.active_connections[key].discard(websocket)
                if not self.active_connections[key]:
                    del self.active_connections[key]
            
            logger.info(f"[WS 連線中斷] 來源 IP: {conn_info['client_ip']} | App: {conn_info['app_id']} | 分支: {conn_info['branch']} | 剩餘連線數: {len(self.active_connections.get(key, []))}")
            del self.device_connections[websocket]
    
    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)
        conn_info = self.device_connections.get(websocket, {})
        logger.debug(f"[WS 發送單播] 給 IP: {conn_info.get('client_ip', 'Unknown')} | 內容: {message}")
    
    async def broadcast_to_app_branch(self, app_id: str, branch: str, message: dict):
        key = f"{app_id}:{branch}"
        if key in self.active_connections:
            message_str = json.dumps(message)
            disconnected = set()
            
            logger.info(f"[WS 廣播發送] 目標: {key} | 影響連線數: {len(self.active_connections[key])} | 內容: {message_str}")
            
            for connection in self.active_connections[key]:
                try:
                    await connection.send_text(message_str)
                except Exception as e:
                    logger.warning(f"[WS 廣播失敗] 連線已失效，準備清除。錯誤: {e}")
                    disconnected.add(connection)
            
            for conn in disconnected:
                self.disconnect(conn)

manager = ConnectionManager()

@router.websocket("/ws/{app_id}/{branch}")
async def websocket_endpoint(
    websocket: WebSocket,
    app_id: str,
    branch: str
):
    """V2 WebSocket endpoint for real-time update notifications"""
    
    client_ip = websocket.client.host if websocket.client else "Unknown"
    
    try:
        await manager.connect(websocket, app_id, branch, client_ip)
        
        await manager.send_personal_message(
            json.dumps({
                "type": "connected",
                "message": "Connected to V2 update service",
                "timestamp": get_hkt_now().isoformat()
            }),
            websocket
        )
        
        while True:
            data = await websocket.receive_text()
            logger.info(f"[WS 收到訊息] 來自 IP: {client_ip} | 內容: {data}")
            connected_ips = [info['client_ip'] for info in manager.device_connections.values()]
            logger.info(f"📋 [App WS 當前連線清單] 總數: {len(connected_ips)} | IP列表: {connected_ips}")
            message = json.loads(data)
            
            if message.get("type") == "heartbeat":
                await manager.send_personal_message(
                    json.dumps({
                        "type": "heartbeat_ack",
                        "timestamp": get_hkt_now().isoformat()
                    }),
                    websocket
                )
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"[WS 發生錯誤] IP: {client_ip} | 錯誤: {str(e)}")
        manager.disconnect(websocket)

async def notify_update_available_v2(app_id: str, branch: str, version_info: dict):
    """Notify clients about new update (V2)"""
    message = {
        "type": "update_available",
        "version_code": version_info["version_code"],
        "version_name": version_info["version_name"],
        "force_update": version_info["force_update"],
        "timestamp": get_hkt_now().isoformat(),
        "api_version": "v2"
    }
    await manager.broadcast_to_app_branch(app_id, branch, message)
