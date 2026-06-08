from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_, text
from typing import Dict, Any, List, Optional
from datetime import datetime
import json
import secrets
import string

from ...database import get_db
from ...core.security import verify_token, verify_api_key
from ...models import Device, Application, Branch, Version

router = APIRouter(tags=["MDM Control (v2)"])

def generate_device_key():
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(32))

# ----------------- HTTP Endpoints ----------------- #

@router.post("/devices/register")
async def register_device(
    android_id: str,
    device_model: str,
    os_version: str,
    db: Session = Depends(get_db)
):
    """1. 設備首次登記並取得專屬 API Key"""
    device = db.query(Device).filter(Device.android_id == android_id).first()
    
    if device and device.device_api_key:
        raise HTTPException(status_code=400, detail="Device already registered. Reset required.")
    
    new_key = generate_device_key()
    
    if device:
        device.device_api_key = new_key
        device.device_model = device_model
        device.os_version = os_version
    else:
        device = Device(
            android_id=android_id,
            device_model=device_model,
            os_version=os_version,
            app_version="1.0.0", # MDM App Version
            notes="com.example.test", # 預設綁定的控制包名
            device_api_key=new_key
        )
        db.add(device)
    
    db.commit()
    return {"status": "success", "android_id": android_id, "api_key": new_key}

# @router.get("/devices/{android_id}/managed-apps")
# async def get_managed_apps(
#     android_id: str,
#     api_key: str,
#     branch: Optional[str] = Query(None, description="指定要拉取的分支，若未指定則回傳所有分支"),
#     db: Session = Depends(get_db)
# ):
#     """
#     MDM App 取得應安裝/監控的 App 清單與最新版本資訊
#     """
#     # 1. 驗證設備與 API Key
#     device = db.query(Device).filter(and_(Device.android_id == android_id, Device.device_api_key == api_key)).first()
#     if not device:
#         raise HTTPException(status_code=401, detail="Unauthorized: Invalid Android ID or API Key")

#     # 2. 查詢 latest_versions View 表
#     if branch:
#         # 如果 MDM App 有指定分支 (例如 "stable")
#         query = text("SELECT * FROM latest_versions WHERE branch_name = :branch")
#         results = db.execute(query, {"branch": branch}).fetchall()
#     else:
#         # 取得所有 App 的最新版本
#         query = text("SELECT * FROM latest_versions")
#         results = db.execute(query).fetchall()
    
#     # 3. 整理回傳格式
#     apps_list = []
#     for row in results:
#         # 處理相對路徑與絕對路徑的下載網址
#         download_url = row.apk_download_url
        
#         apps_list.append({
#             "app_id": row.app_id,
#             "app_name": row.app_name,
#             "branch_name": row.branch_name,
#             "version_code": row.version_code,
#             "version_name": row.version_name,
#             "download_url": download_url,
#             "force_update": bool(row.force_update)
#         })
        
#     return {
#         "status": "success", 
#         "device_model": device.device_model,
#         "data": apps_list
#     }

@router.post("/devices/{android_id}/sync-apps")
async def sync_device_apps(
    android_id: str,
    api_key: str,
    apps: List[dict], # [{"app_id": "com.app.a", "version_code": 100}]
    db: Session = Depends(get_db)
):
    """6. 確保裝置已安裝 App 清單為最新狀態"""
    device = db.query(Device).filter(and_(Device.android_id == android_id, Device.device_api_key == api_key)).first()
    if not device:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    db.execute(text("DELETE FROM device_installed_apps WHERE device_id = :id"), {"id": device.id})
    
    for app_data in apps:
        app_model = db.query(Application).filter(Application.app_id == app_data['app_id']).first()
        if app_model:
            db.execute(
                text("""INSERT INTO device_installed_apps (device_id, application_id, current_version_code) 
                   VALUES (:d_id, :a_id, :v_code)"""),
                {"d_id": device.id, "a_id": app_model.id, "v_code": app_data['version_code']}
            )
    db.commit()
    return {"status": "synced"}

@router.post("/devices/{android_id}/report-data")
async def report_app_data(
    android_id: str,
    api_key: str,
    payload: dict,
    db: Session = Depends(get_db)
):
    """MDM App 回傳 App A 的資料"""
    device = db.query(Device).filter(and_(Device.android_id == android_id, Device.device_api_key == api_key)).first()
    if not device:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # 存入資料庫
    db.execute(
        text("INSERT INTO device_command_results (device_id, task_id, action, result_data) VALUES (:d, :t, :a, :r)"),
        {"d": device.id, "t": payload.get('task_id', 'none'), "a": payload.get('action'), "r": json.dumps(payload.get('data'))}
    )
    db.commit()
    return {"status": "recorded"}

# ----------------- WebSocket Manager ----------------- #

class DeviceWSManager:
    def __init__(self):
        self.active_devices: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, android_id: str, db: Session):
        await websocket.accept()
        self.active_devices[android_id] = websocket
        db.execute(text("UPDATE devices SET is_online = 1, last_check_time = NOW() WHERE android_id = :aid"), {"aid": android_id})
        db.commit()

    def disconnect(self, android_id: str, db: Session):
        if android_id in self.active_devices:
            del self.active_devices[android_id]
            db.execute(text("UPDATE devices SET is_online = 0 WHERE android_id = :aid"), {"aid": android_id})
            db.commit()

    async def send_command(self, android_id: str, command: dict):
        if android_id in self.active_devices:
            await self.active_devices[android_id].send_json(command)
            return True
        return False

ws_manager = DeviceWSManager()

@router.websocket("/ws/device/{android_id}")
async def device_websocket(
    websocket: WebSocket, 
    android_id: str, 
    api_key: str = Query(...),
    db: Session = Depends(get_db)
):
    """監聽連線、維持心跳、即時狀態回報"""
    device = db.query(Device).filter(and_(Device.android_id == android_id, Device.device_api_key == api_key)).first()
    if not device:
        await websocket.close(code=1008)
        return

    await ws_manager.connect(websocket, android_id, db)
    
    try:
        while True:
            data = await websocket.receive_text()

            if not data or not data.strip():
                continue

            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON format"})
                continue
            
            # 處理即時狀態回報 (GPS, 電量)
            if message.get("type") == "status_update":
                device.battery_level = message.get("battery")
                device.latitude = message.get("lat")
                device.longitude = message.get("lng")
                device.last_check_time = datetime.utcnow()
                db.commit()
                
                await websocket.send_json({
                    "type": "status_update_ack", 
                    "status": "success",
                    "updated_at": datetime.utcnow().isoformat()
                })
                
            elif message.get("type") == "heartbeat":
                await websocket.send_json({"type": "heartbeat_ack"})
                device.last_check_time = datetime.utcnow()
                db.commit()

    except WebSocketDisconnect:
        ws_manager.disconnect(android_id, db)

@router.post("/admin/devices/{android_id}/command")
async def send_admin_command(
    android_id: str,
    command: dict,
    token_payload: dict = Depends(verify_token)
):
    """管理員後台發送指令給 MDM"""
    success = await ws_manager.send_command(android_id, command)
    if not success:
        raise HTTPException(status_code=400, detail="Device is offline")
    return {"status": "command_sent"}

# ----------------- Enterprise App Store Endpoints ----------------- #

@router.get("/store/apps")
async def get_store_apps(
    api_key: str = Query(...), 
    db: Session = Depends(get_db)
):
    """
    [Store] 獲取應用程式商城首頁 (所有 App 列表)
    返回所有啟用的 App，並附上各分支的最新版本號供首頁預覽
    """
    # 簡易驗證 API Key (實務上應檢查 device_api_key 是否存在於 devices 表)
    
    # 1. 查詢所有啟用中的 App
    apps = db.query(Application).filter(Application.is_active == True).all()
    
    result = []
    for app in apps:
        # 2. 透過已建立的 latest_versions View 取得該 App 每個分支的最新版本
        query = text("""
            SELECT branch_name, version_name, version_code 
            FROM latest_versions 
            WHERE app_id = :app_id
        """)
        latest_v = db.execute(query, {"app_id": app.app_id}).fetchall()
        
        result.append({
            "app_id": app.app_id,
            "name": app.name,
            "description": app.description,
            "branches_summary": [
                {
                    "branch_name": row.branch_name, 
                    "version_name": row.version_name, 
                    "version_code": row.version_code
                } for row in latest_v
            ]
        })
        
    return {"status": "success", "data": result}

@router.get("/store/apps/{app_id}/details")
async def get_store_app_details(
    app_id: str,
    api_key: str = Query(...),
    db: Session = Depends(get_db)
):
    """
    [Store] 取得單一 App 的詳細資訊
    包含：App介紹、所有分支，以及各分支的「最新版本(可下載)」與「歷史版本列表」
    """
    # 1. 取得 App 基本資訊
    app = db.query(Application).filter(
        Application.app_id == app_id, 
        Application.is_active == True
    ).first()
    
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
        
    # 2. 取得所有啟用的分支
    branches = db.query(Branch).filter(
        Branch.application_id == app.id, 
        Branch.is_active == True
    ).all()
    
    app_data = {
        "app_id": app.app_id,
        "name": app.name,
        "description": app.description,
        "branches": []
    }
    
    # 3. 整理每個分支的版本資料
    for b in branches:
        # 取出該分支下所有啟用的版本，依 version_code 降冪排序 (最新在最前)
        versions = db.query(Version).filter(
            Version.branch_id == b.id, 
            Version.is_active == True
        ).order_by(Version.version_code.desc()).all()
        
        if not versions:
            continue
            
        # 第一筆即為最新版本
        latest_version = versions[0]
        
        branch_info = {
            "branch_name": b.branch_name,
            "description": b.description,
            "latest_version": {
                "version_code": latest_version.version_code,
                "version_name": latest_version.version_name,
                "download_url": latest_version.apk_download_url,
                "release_notes": latest_version.release_notes,
                "file_size": latest_version.file_size,
                "force_update": latest_version.force_update,
                "created_at": latest_version.created_at.isoformat()
            },
            # 歷史版本列表 (不含下載網址，僅供展示)
            "version_history": [
                {
                    "version_code": v.version_code,
                    "version_name": v.version_name,
                    "release_notes": v.release_notes,
                    "created_at": v.created_at.isoformat()
                } for v in versions
            ]
        }
        app_data["branches"].append(branch_info)
        
    return {"status": "success", "data": app_data}

# ----------------- Admin Web Panel Store Endpoints ----------------- #

@router.get("/admin/store/apps")
async def get_admin_store_apps(
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)  # 使用 JWT Token 驗證
):
    """
    [Web Panel] 獲取應用程式商城首頁 (所有 App 列表)
    提供給 Web Panel 使用，透過 JWT Token 驗證。
    """
    apps = db.query(Application).filter(Application.is_active == True).all()
    
    result = []
    for app in apps:
        query = text("""
            SELECT branch_name, version_name, version_code 
            FROM latest_versions 
            WHERE app_id = :app_id
        """)
        latest_v = db.execute(query, {"app_id": app.app_id}).fetchall()
        
        result.append({
            "app_id": app.app_id,
            "name": app.name,
            "description": app.description,
            "branches_summary": [
                {
                    "branch_name": row.branch_name, 
                    "version_name": row.version_name, 
                    "version_code": row.version_code
                } for row in latest_v
            ]
        })
        
    return {"status": "success", "data": result}

@router.get("/admin/store/apps/{app_id}/details")
async def get_admin_store_app_details(
    app_id: str,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)  # 使用 JWT Token 驗證
):
    """
    [Web Panel] 取得單一 App 的詳細資訊
    提供給 Web Panel 使用，透過 JWT Token 驗證。
    """
    app = db.query(Application).filter(
        Application.app_id == app_id, 
        Application.is_active == True
    ).first()
    
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
        
    branches = db.query(Branch).filter(
        Branch.application_id == app.id, 
        Branch.is_active == True
    ).all()
    
    app_data = {
        "app_id": app.app_id,
        "name": app.name,
        "description": app.description,
        "branches": []
    }
    
    for b in branches:
        versions = db.query(Version).filter(
            Version.branch_id == b.id, 
            Version.is_active == True
        ).order_by(Version.version_code.desc()).all()
        
        if not versions:
            continue
            
        latest_version = versions[0]
        
        branch_info = {
            "branch_name": b.branch_name,
            "description": b.description,
            "latest_version": {
                "version_code": latest_version.version_code,
                "version_name": latest_version.version_name,
                "download_url": latest_version.apk_download_url,
                "release_notes": latest_version.release_notes,
                "file_size": latest_version.file_size,
                "force_update": latest_version.force_update,
                "created_at": latest_version.created_at.isoformat()
            },
            "version_history": [
                {
                    "version_code": v.version_code,
                    "version_name": v.version_name,
                    "release_notes": v.release_notes,
                    "created_at": v.created_at.isoformat()
                } for v in versions
            ]
        }
        app_data["branches"].append(branch_info)
        
    return {"status": "success", "data": app_data}
