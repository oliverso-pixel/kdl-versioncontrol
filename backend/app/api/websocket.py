from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json
import asyncio
from datetime import datetime

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.device_connections: Dict[WebSocket, dict] = {}
    
    async def connect(self, websocket: WebSocket, app_id: str, branch: str, device_info: dict):
        await websocket.accept()
        key = f"{app_id}:{branch}"
        
        if key not in self.active_connections:
            self.active_connections[key] = set()
        
        self.active_connections[key].add(websocket)
        self.device_connections[websocket] = {
            "app_id": app_id,
            "branch": branch,
            "device_info": device_info,
            "connected_at": datetime.utcnow()
        }
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.device_connections:
            conn_info = self.device_connections[websocket]
            key = f"{conn_info['app_id']}:{conn_info['branch']}"
            
            if key in self.active_connections:
                self.active_connections[key].discard(websocket)
                if not self.active_connections[key]:
                    del self.active_connections[key]
            
            del self.device_connections[websocket]
    
    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)
    
    async def broadcast_to_app_branch(self, app_id: str, branch: str, message: dict):
        key = f"{app_id}:{branch}"
        if key in self.active_connections:
            message_str = json.dumps(message)
            disconnected = set()
            
            for connection in self.active_connections[key]:
                try:
                    await connection.send_text(message_str)
                except:
                    disconnected.add(connection)
            
            # Clean up disconnected clients
            for conn in disconnected:
                self.disconnect(conn)

manager = ConnectionManager()

@router.websocket("/ws/{app_id}/{branch}")
async def websocket_endpoint(
    websocket: WebSocket,
    app_id: str,
    branch: str
):
    """WebSocket endpoint for real-time update notifications"""
    
    # Get device info from query params or initial message
    device_info = {}
    
    try:
        await manager.connect(websocket, app_id, branch, device_info)
        
        # Send welcome message
        await manager.send_personal_message(
            json.dumps({
                "type": "connected",
                "message": "Connected to update service",
                "timestamp": datetime.utcnow().isoformat()
            }),
            websocket
        )
        
        while True:
            # Wait for messages from client (heartbeat, etc.)
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "heartbeat":
                await manager.send_personal_message(
                    json.dumps({
                        "type": "heartbeat_ack",
                        "timestamp": datetime.utcnow().isoformat()
                    }),
                    websocket
                )
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)

async def notify_update_available(app_id: str, branch: str, version_info: dict):
    """Notify clients about new update"""
    message = {
        "type": "update_available",
        "version_code": version_info["version_code"],
        "version_name": version_info["version_name"],
        "force_update": version_info["force_update"],
        "timestamp": datetime.utcnow().isoformat()
    }
    
    await manager.broadcast_to_app_branch(app_id, branch, message)
    