from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import and_, text
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from datetime import datetime, time, date
from ...database import get_db, get_mssql_db
from ...core.security import verify_token, verify_api_key
from ...core.utils import get_hkt_now
from ...core.geocoder import reverse_geocode_zh
from ...models import Device, Application, Branch, Version, SystemSetting, UpdateLog
import json
import secrets
import string
import logging

logger = logging.getLogger("v2.mdm.websocket")
logger.setLevel(logging.INFO)
router = APIRouter(tags=["MDM Control (v2)"])

def generate_device_key():
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(32))

class DeviceRegisterRequest(BaseModel):
    android_id: str
    device_model: str
    os_version: str
    hardware_id: Optional[str] = None
    additional_info: Optional[Dict] = None
    app_signature: Optional[Dict] = None

# ----------------- HTTP Endpoints ----------------- #

@router.post("/devices/register")
async def register_device(
    payload: DeviceRegisterRequest,
    db: Session = Depends(get_db)
):
    """1. 設備首次登記 (防重複機制 + 儲存 additional_info)"""

    logger.info(f"📥 [/devices/register] 收到設備登記請求 Data: {payload.dict()}")

    device = None
    
    add_info_str = json.dumps(payload.additional_info) if payload.additional_info else None
    
    if payload.hardware_id:
        device = db.query(Device).filter(Device.hardware_id == payload.hardware_id).first()
        
    if not device:
        device = db.query(Device).filter(Device.android_id == payload.android_id).first()
    
    new_key = generate_device_key()
    
    if device:
        # 裝置已存在 -> 更新資料
        device.android_id = payload.android_id 
        device.hardware_id = payload.hardware_id if payload.hardware_id else device.hardware_id
        device.device_api_key = new_key
        device.device_model = payload.device_model
        device.os_version = payload.os_version
        device.app_signature = payload.app_signature
        
        if add_info_str:
            device.additional_info = add_info_str
            
        device.is_active = True
    else:
        # 全新裝置 -> 寫入所有資料
        device = Device(
            android_id=payload.android_id,
            hardware_id=payload.hardware_id,
            device_model=payload.device_model,
            os_version=payload.os_version,
            app_signature=payload.app_signature,
            device_api_key=new_key,
            additional_info=add_info_str  # 寫入 additional_info
        )
        db.add(device)
    
    db.commit()
    return {"status": "success", "android_id": payload.android_id, "api_key": new_key}

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

@router.post("/admin/devices/{android_id}/screen/control")
async def screen_control(
    android_id: str,
    action: str,  # "start_capture" | "stop_capture" | "tap" | "swipe" | "key"
    params: dict = {},
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """遠端螢幕控制"""
    
    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    task_id = f"screen_{int(get_hkt_now().timestamp()*1000)}"
    
    command = {
        "task_id": task_id,
        "target_app": "com.kowloondairy.mdmapp",
        "action": f"DC_{action}",
        **params
    }
    
    success = await ws_manager.send_command(android_id, command)
    
    if not success:
        raise HTTPException(status_code=400, detail="Device offline")
    
    return {"status": "command_sent", "task_id": task_id}

# ----------------- WebSocket Manager ----------------- #

class DeviceWSManager:
    def __init__(self):
        self.active_devices: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, android_id: str, db: Session):
        await websocket.accept()
        old = self.active_devices.get(android_id)
        if old is not None and old is not websocket:
            try:
                await old.close(code=1000)
            except Exception:
                pass
        self.active_devices[android_id] = websocket
        db.execute(text("UPDATE devices SET is_online = 1, last_check_time = NOW() WHERE android_id = :aid"), {"aid": android_id})
        db.commit()

    def disconnect(self, android_id: str, db: Session = None, websocket: WebSocket = None):
        current = self.active_devices.get(android_id)
        if current is None:
            return
        if websocket is not None and current is not websocket:
            return
        del self.active_devices[android_id]
        if db is not None:
            db.execute(text("UPDATE devices SET is_online = 0 WHERE android_id = :aid"), {"aid": android_id})
            db.commit()

    async def send_command(self, android_id: str, command: dict) -> bool:
        """發送指令給指定設備，成功回傳 True，設備離線或發送失敗回傳 False"""
        websocket = self.active_devices.get(android_id)
        if websocket is None:
            logger.warning(f"⚠️ [WS 指令發送失敗] 設備不在線: {android_id}")
            return False
        try:
            await websocket.send_json(command)
            logger.info(f"📤 [WS 指令已發送] 設備: {android_id} | 指令: {command.get('action')}")
            return True
        except Exception as e:
            logger.error(f"❌ [WS 指令發送異常] 設備: {android_id} | 錯誤: {e}")
            # 連線已失效，清掉它
            self.active_devices.pop(android_id, None)
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
        await websocket.send_json({
            "type": "connected",
            "status": "success",
            "message": "Connected to V2 MDM WebSocket Service",
            "device_model": device.device_model,
            "timestamp": get_hkt_now().isoformat()
        })
    except Exception as e:
        ws_manager.disconnect(android_id, db)
        return
    
    try:
        while True:
            data = await websocket.receive_text()

            if not data or not data.strip():
                continue

            logger.info(f"📥 [MDM WS 收到資料] 來自設備: {android_id} | 內容: {data}")
            connected_list = list(ws_manager.active_devices.keys())
            # logger.info(f"📋 [MDM WS 當前連線清單] 列表: {connected_list}")

            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON format"})
                continue

            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong", "status": "success", "message": ""})
                device.last_check_time = get_hkt_now()
                db.commit()
            
            # 處理即時狀態回報 (GPS, 電量)
            if message.get("type") == "status_update":

                gps_time_raw = message.get("GPStime")
                if gps_time_raw:
                    if isinstance(gps_time_raw, (int, float)):
                        # 將毫秒轉換為秒 (除以 1000) 並轉為 datetime
                        gps_time = datetime.fromtimestamp(gps_time_raw / 1000.0)
                    else:
                        try:
                            gps_time = datetime.fromisoformat(str(gps_time_raw))
                        except ValueError:
                            gps_time = get_hkt_now()
                else:
                    gps_time = get_hkt_now()

                if gps_time.tzinfo is not None:
                    gps_time = gps_time.replace(tzinfo=None)

                boot_time_raw = message.get("boot_time")
                boot_time = (
                    datetime.fromtimestamp(boot_time_raw / 1000.0)
                    if isinstance(boot_time_raw, (int, float))
                    else None
                )

                route = message.get("route", message.get("Route"))
                altitude = message.get("altitude", message.get("Altitude"))
                satellites = message.get("satellites_used", message.get("Satellites"))
                conn_status = message.get("connection_status", message.get("Connection_status", "online"))
                location_source = message.get("location_source")

                # 一律由後端反查地址；Nominatim 失敗/未設定時才退回裝置回報的 address
                # (此處尚未執行任何 SQL，5 秒反查預算不會佔住 DB 連線)
                address = None
                if message.get("lat") and message.get("lng"):
                    address = await reverse_geocode_zh(message["lat"], message["lng"])
                if not address:
                    address = message.get("address", message.get("Address"))

                if not device.gps_time or gps_time > device.gps_time:
                    device.battery_level = message.get("battery")
                    device.latitude = message.get("lat")
                    device.longitude = message.get("lng")
                    device.route = route
                    device.altitude = altitude
                    device.address = address
                    device.satellites = satellites
                    device.gps_time = gps_time
                    device.boot_time = boot_time
                    device.location_source = location_source

                device.last_check_time = get_hkt_now()
                
                if message.get("lat") and message.get("lng"):
                    db.execute(text("""
                        INSERT INTO device_location_history 
                        (device_id, latitude, longitude, battery_level, route, altitude, address, satellites, gps_time, connection_status)
                        VALUES (:d_id, :lat, :lng, :bat, :route, :alt, :addr, :sat, :gps_time, :conn_status)
                    """), {
                        "d_id": device.id, 
                        "lat": message.get("lat"), 
                        "lng": message.get("lng"), 
                        "bat": message.get("battery"),
                        "route": route,
                        "alt": altitude,
                        "addr": address,
                        "sat": satellites,
                        "gps_time": gps_time,
                        "conn_status": conn_status
                    })
                
                db.commit()

                sleep_start_setting = db.query(SystemSetting).filter_by(category="mssql_sync", key="sleep_start").first()
                sleep_end_setting = db.query(SystemSetting).filter_by(category="mssql_sync", key="sleep_end").first()
                
                sleep_start_str = sleep_start_setting.value if sleep_start_setting else "00:00"
                sleep_end_str = sleep_end_setting.value if sleep_end_setting else "06:00"
                
                # 判斷當前伺服器時間是否在休眠區間
                current_time = get_hkt_now().time()
                try:
                    s_hr, s_min = map(int, sleep_start_str.split(':'))
                    e_hr, e_min = map(int, sleep_end_str.split(':'))
                    start_t = time(s_hr, s_min)
                    end_t = time(e_hr, e_min)
                    
                    is_sleeping = False
                    if start_t <= end_t:
                        is_sleeping = start_t <= current_time <= end_t
                    else: # 跨夜情況 (例如 22:00 到 06:00)
                        is_sleeping = current_time >= start_t or current_time <= end_t
                except Exception as e:
                    logger.error(f"解析休眠時間錯誤: {e}")
                    is_sleeping = False

                # 若不在休眠期間，且有連線到 MSSQL，則插入資料
                if not is_sleeping and message.get("lat") and message.get("lng"):
                    # 手動取得 MSSQL Session
                    mssql_db = next(get_mssql_db())
                    if mssql_db:
                        try:
                            mssql_db.execute(text("""
                                INSERT INTO GPSLocationHistory 
                                (DeviceID, Route, Battery_level, Latitude, Longitude, Altitude, Address, Satellites, GPStime, Connection_status)
                                VALUES (:dev_id, :route, :bat, :lat, :lng, :alt, :addr, :sat, :gps_time, :conn_status)
                            """), {
                                "dev_id": device.android_id, 
                                "route": route,
                                "bat": message.get("battery"),
                                "lat": message.get("lat"),
                                "lng": message.get("lng"),
                                "alt": altitude,
                                "addr": address,
                                "sat": satellites,
                                "gps_time": gps_time,
                                "conn_status": conn_status
                            })
                            mssql_db.commit()
                        except Exception as e:
                            logger.error(f"寫入 MSSQL 失敗: {e}")
                            mssql_db.rollback()
                        finally:
                            mssql_db.close()
                
                await websocket.send_json({
                    "type": "status_update_ack", 
                    "status": "success",
                    "updated_at": get_hkt_now().isoformat()
                })

            elif message.get("type") == "sync_apps":
                apps_list = message.get("apps", [])
                # logger.info(f"📥 [MDM WS App 同步] 設備: {android_id} | 清單: {apps_list}")
                
                reported_app_ids = {app['app_id'] for app in apps_list}
                
                for app_data in apps_list:
                    app_model = db.query(Application).filter(Application.app_id == app_data['app_id']).first()
                    if app_model:
                        db.execute(
                            text("""INSERT INTO device_installed_apps (device_id, application_id, current_version_code) 
                               VALUES (:d_id, :a_id, :v_code)
                               ON DUPLICATE KEY UPDATE current_version_code = :v_code"""),
                            {"d_id": device.id, "a_id": app_model.id, "v_code": app_data['version_code']}
                        )
                        
                        existing_config = db.execute(
                            text("SELECT id FROM device_app_configs WHERE device_id = :d_id AND app_id = :a_id"),
                            {"d_id": device.id, "a_id": app_model.app_id}
                        ).first()
                        if not existing_config and app_model.default_config:
                            db.execute(
                                text("""INSERT INTO device_app_configs (device_id, app_id, config_data, updated_at) 
                                   VALUES (:d_id, :a_id, :conf, NOW())"""),
                                {"d_id": device.id, "a_id": app_model.app_id, "conf": json.dumps(app_model.default_config)}
                            )
                
                existing_installed = db.execute(
                    text("""
                        SELECT a.app_id, dia.application_id 
                        FROM device_installed_apps dia
                        JOIN applications a ON dia.application_id = a.id
                        WHERE dia.device_id = :d_id
                    """), {"d_id": device.id}
                ).fetchall()
                
                for row in existing_installed:
                    if row.app_id not in reported_app_ids:
                        db.execute(
                            text("DELETE FROM device_installed_apps WHERE device_id = :d_id AND application_id = :a_id"),
                            {"d_id": device.id, "a_id": row.application_id}
                        )
                        db.execute(
                            text("DELETE FROM device_app_configs WHERE device_id = :d_id AND app_id = :app_id"),
                            {"d_id": device.id, "app_id": row.app_id}
                        )
                        logger.info(f"🗑️ [MDM WS App 卸載] 設備 {android_id} 已移除 App: {row.app_id}，相關設定已清除")

                db.commit()
                await websocket.send_json({"type": "sync_apps_ack", "status": "success"})

            elif message.get("type") == "sync_configs":
                logger.info(f"📥 [MDM WS 取得所有 Config] 設備: {android_id}")
                configs = db.execute(text("SELECT app_id, config_data FROM device_app_configs WHERE device_id = :d_id"), {"d_id": device.id}).fetchall()
                result = {row.app_id: json.loads(row.config_data) for row in configs}
                await websocket.send_json({
                    "type": "sync_configs_result",
                    "status": "success",
                    "configs": result
                })

            elif message.get("type") == "get_config":
                target_app = message.get("app_id")
                logger.info(f"📥 [MDM WS 取得單一 Config] 設備: {android_id} | App: {target_app}")
                query = text("SELECT config_data FROM device_app_configs WHERE device_id = :d_id AND app_id = :a_id")
                result = db.execute(query, {"d_id": device.id, "a_id": target_app}).first()
                await websocket.send_json({
                    "type": "get_config_result",
                    "app_id": target_app,
                    "status": "success",
                    "config": json.loads(result[0]) if result else {}
                })

            elif message.get("type") in ["report_download", "report_install", "report_updated"]:
                app_id = message.get("app_id")
                version_code = message.get("version_code")
                status = message.get("status", "success") # e.g., "started", "success", "failed"
                error_msg = message.get("error_message")
                task_id = message.get("task_id") # 必須從 JSON 中取得 task_id
                
                update_type = message.get("type").replace("report_", "") 

                logger.info(f"📥 [MDM WS 回報狀態] 設備: {android_id} | App: {app_id} | 類型: {update_type} | 狀態: {status}")

                if task_id:
                    try:
                        result_data = {
                            "app_id": app_id,
                            "version_code": version_code,
                            "status": f"{update_type}_{status}", # 例如: download_success, install_started
                            "message": error_msg or f"已執行: {update_type} ({status})"
                        }
                        db.execute(text("""
                            INSERT INTO device_command_results (device_id, task_id, action, result_data, created_at)
                            VALUES (:d_id, :t_id, :act, :res, NOW())
                        """), {
                            "d_id": device.id,
                            "t_id": task_id,
                            "act": "AC_app_install", # 統一名稱以便關聯同一個指令
                            "res": json.dumps(result_data, ensure_ascii=False)
                        })
                    except Exception as e:
                        logger.error(f"寫入 Command History 失敗: {e}")

                # 處理原本的安裝紀錄與配發 Config 邏輯
                app_model = db.query(Application).filter(Application.app_id == app_id).first()
                if app_model:
                    # 寫入 UpdateLog 歷史 (供統計面板使用)
                    version = db.query(Version).filter(and_(Version.application_id == app_model.id, Version.version_code == version_code)).first()
                    update_log = UpdateLog(
                        device_id=device.id,
                        application_id=app_model.id,
                        branch_id=version.branch_id if version else None,
                        from_version="unknown", 
                        to_version=str(version_code),
                        update_type=update_type,
                        status=status
                    )
                    if error_msg and hasattr(update_log, 'additional_info'):
                        update_log.additional_info = json.dumps({"error": error_msg})
                    db.add(update_log)
                    
                    if update_type == "install" and status == "success":
                        db.execute(text("""
                            INSERT INTO device_installed_apps (device_id, application_id, current_version_code) 
                            VALUES (:d_id, :a_id, :v_code)
                            ON DUPLICATE KEY UPDATE current_version_code = :v_code
                        """), {"d_id": device.id, "a_id": app_model.id, "v_code": version_code})
                        
                        existing_config = db.execute(
                            text("SELECT id FROM device_app_configs WHERE device_id = :d_id AND app_id = :a_id"),
                            {"d_id": device.id, "a_id": app_model.app_id}
                        ).first()
                        
                        if not existing_config and app_model.default_config:
                            db.execute(
                                text("""INSERT INTO device_app_configs (device_id, app_id, config_data, updated_at) 
                                   VALUES (:d_id, :a_id, :conf, NOW())"""),
                                {
                                    "d_id": device.id, 
                                    "a_id": app_model.app_id, 
                                    "conf": json.dumps(app_model.default_config)
                                }
                            )

                db.commit()
                
                await websocket.send_json({
                    "type": f"report_{update_type}_ack", 
                    "status": "success", 
                    "app_id": app_id
                })

            elif message.get("type") == "command_result":
                task_id = message.get("task_id")
                action = message.get("action")
                status = message.get("status")  # 例如: "received", "completed", "failed"
                result_data = message.get("result_data", {})
                
                result_data["status"] = status
                
                if task_id and action:
                    try:
                        db.execute(text("""
                            INSERT INTO device_command_results (device_id, task_id, action, result_data, created_at)
                            VALUES (:d_id, :t_id, :act, :res, NOW())
                        """), {
                            "d_id": device.id,
                            "t_id": task_id,
                            "act": action,
                            "res": json.dumps(result_data, ensure_ascii=False)
                        })
                        db.commit()
                        logger.info(f"📝 [MDM WS 指令回報] 設備 {android_id} | 任務 {task_id} ({action}) | 狀態: {status}")
                        
                        await websocket.send_json({
                            "type": "command_result_ack",
                            "task_id": task_id,
                            "status": "success"
                        })
                    except Exception as e:
                        db.rollback()
                        logger.error(f"❌ [MDM WS 指令回報錯誤] 設備 {android_id} : {e}")

            elif message.get("type") == "report_config":
                target_app_id = message.get("app_id")
                new_config = message.get("config_data")
                
                if target_app_id and new_config:
                    try:
                        config_json = json.dumps(new_config)
                        db.execute(text("""
                            INSERT INTO device_app_configs (device_id, app_id, config_data, updated_at) 
                            VALUES (:d_id, :a_id, :conf, NOW())
                            ON DUPLICATE KEY UPDATE config_data = :conf, updated_at = NOW()
                        """), {
                            "d_id": device.id, 
                            "a_id": target_app_id, 
                            "conf": config_json
                        })
                        db.commit()
                        
                        await websocket.send_json({
                            "type": "report_config_ack",
                            "app_id": target_app_id,
                            "status": "success"
                        })
                        logger.info(f"🔄 [Config 同步] 設備 {android_id} 已更新 {target_app_id} 的設定")
                    except Exception as e:
                        db.rollback()
                        logger.error(f"❌ [Config 同步錯誤] 設備 {android_id} 更新設定失敗: {e}")

            elif message.get("type") == "screen_frame":
                # MDM App 回傳的螢幕畫面
                task_id = message.get("task_id")
                image_base64 = message.get("image_base64")
                
                if image_base64:
                    # 轉發給前端（透過 Screen Stream WebSocket）
                    from .screen_control import screen_stream_manager
                    await screen_stream_manager.send_frame(android_id, {
                        "type": "screen_frame",
                        "task_id": task_id,
                        "image_base64": image_base64,
                        "timestamp": get_hkt_now().timestamp() * 1000
                    })
                    
                    logger.info(f"🖼️ [MDM WS] 轉發螢幕畫面 | 設備: {android_id} | 大小: {len(image_base64)} bytes")
                
            elif message.get("type") == "heartbeat":
                await websocket.send_json({"type": "heartbeat_ack"})
                device.last_check_time = get_hkt_now()
                db.commit()

    except WebSocketDisconnect:
        ws_manager.disconnect(android_id, db, websocket)

@router.post("/admin/devices/{android_id}/command")
async def send_admin_command(
    android_id: str,
    command: dict,
    db: Session = Depends(get_db),
    token_payload: dict = Depends(verify_token)
):
    """管理員後台發送指令給 MDM，並寫入 Command History"""
    
    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    try:
        success = await ws_manager.send_command(android_id, command)
    except Exception as e:
        logger.error(f"❌ [指令發送異常] 設備 {android_id}: {e}")
        success = False
    
    # 如果前端沒有傳 task_id，我們自動產生一個確保後續追蹤
    task_id = command.get("task_id", f"task_{int(get_hkt_now().timestamp()*1000)}")
    action = command.get("action", "unknown_action")
    
    status = "sent" if success else "offline_failed"
    result_data = {
        "status": status, 
        "command_payload": command,
        "message": "指令已發送至設備" if success else "設備離線，指令發送失敗"
    }
    
    try:
        db.execute(text("""
            INSERT INTO device_command_results (device_id, task_id, action, result_data, created_at)
            VALUES (:d_id, :t_id, :act, :res, NOW())
        """), {
            "d_id": device.id,
            "t_id": task_id,
            "act": action,
            "res": json.dumps(result_data, ensure_ascii=False)
        })
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"寫入 Command History 失敗: {e}")

    if not success:
        return JSONResponse(
            status_code=400,
            content={"status": "device_offline", "task_id": task_id, "message": "設備離線或連線已中斷"}
        )
        
    return {"status": "command_sent", "task_id": task_id}

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

# ----------------- Admin Web Panel Endpoints ----------------- #
# ----------------- Store ----------------- #

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
        "default_config": app.default_config,
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
                "apk_hash": latest_version.apk_file_hash,
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

# ----------------- installed-apps location-history ----------------- #

@router.get("/admin/devices/{android_id}/installed-apps")
async def get_device_installed_apps(android_id: str, db: Session = Depends(get_db), token: dict = Depends(verify_token)):
    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
        
    query = text("""
        SELECT a.app_id, a.name, dia.current_version_code, dia.installed_at 
        FROM device_installed_apps dia
        JOIN applications a ON dia.application_id = a.id
        WHERE dia.device_id = :d_id
    """)
    apps = db.execute(query, {"d_id": device.id}).fetchall()
    return [{"app_id": row.app_id, "name": row.name, "version_code": row.current_version_code, "installed_at": row.installed_at} for row in apps]

@router.get("/admin/devices/{android_id}/location-history")
async def get_device_location_history(android_id: str, limit: int = 50, db: Session = Depends(get_db), token: dict = Depends(verify_token)):
    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
        
    query = text("""
        SELECT latitude, longitude, battery_level, created_at 
        FROM device_location_history 
        WHERE device_id = :d_id 
        ORDER BY created_at DESC LIMIT :limit
    """)
    history = db.execute(query, {"d_id": device.id, "limit": limit}).fetchall()
    return [{"lat": float(row.latitude), "lng": float(row.longitude), "battery": row.battery_level, "time": row.created_at} for row in history]

@router.get("/admin/devices/{android_id}/mssql-location-history")
async def get_mssql_location_history(
    android_id: str, 
    target_date: date = Query(..., description="查詢日期，格式 YYYY-MM-DD"),
    db: Session = Depends(get_db), 
    token: dict = Depends(verify_token)
):
    """[V2 Web Panel] 從 MSSQL 取得指定日期的 GPS 軌跡"""
    
    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
        
    mssql_db = next(get_mssql_db())
    if not mssql_db:
        raise HTTPException(status_code=503, detail="MSSQL connection is not configured")
        
    try:
        query = text("""
            SELECT Latitude, Longitude, Battery_level, GPStime, Connection_status, Route 
            FROM DeviceLocationHistory 
            WHERE DeviceID = :d_id 
              AND CAST(GPStime AS DATE) = :t_date
            ORDER BY GPStime ASC
        """)
        
        history = mssql_db.execute(query, {"d_id": android_id, "t_date": target_date}).fetchall()
        
        return [
            {
                "lat": float(row.Latitude) if row.Latitude else None, 
                "lng": float(row.Longitude) if row.Longitude else None, 
                "battery": row.Battery_level, 
                "time": row.GPStime.isoformat() if row.GPStime else None,
                "status": row.Connection_status,
                "route": row.Route
            } for row in history if row.Latitude and row.Longitude
        ]
    except Exception as e:
        logger.error(f"查詢 MSSQL 失敗: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        mssql_db.close()

# ----------------- All Device ----------------- #
@router.get("/admin/devices")
async def get_all_devices_v2(db: Session = Depends(get_db), token: dict = Depends(verify_token)):

    """[V2 Web Panel] 取得所有裝置 (包含停用與離線)，供後台清單與篩選使用"""
    
    devices = db.query(Device).order_by(Device.last_check_time.desc()).all()
    result = []
    for d in devices:
        result.append({
            "id": d.id,
            "android_id": d.android_id,
            "hardware_id": d.hardware_id,
            "device_model": d.device_model,
            "device_api_key": d.device_api_key,
            "is_online": bool(d.is_online),
            "battery_level": d.battery_level,
            "latitude": float(d.latitude) if d.latitude else None,
            "longitude": float(d.longitude) if d.longitude else None,
            "is_active": bool(d.is_active),
            "last_check_time": d.last_check_time.isoformat() if d.last_check_time else None,
            "notes": d.notes
        })
    return result

# ----------------- Device App config ----------------- #
@router.get("/admin/devices/{android_id}/configs/{app_id}")
async def get_device_app_config(android_id: str, app_id: str, db: Session = Depends(get_db)):

    """[Web Panel] 取得指定設備的指定 App 設定"""

    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
        
    query = text("SELECT config_data FROM device_app_configs WHERE device_id = :d_id AND app_id = :a_id")
    result = db.execute(query, {"d_id": device.id, "a_id": app_id}).first()
    
    return {"status": "success", "config": json.loads(result[0]) if result else {}}

@router.post("/admin/devices/{android_id}/configs/{target_app_id}")
async def update_device_app_config(
    android_id: str, 
    target_app_id: str, 
    config_data: dict, 
    db: Session = Depends(get_db)
):
    """[Web Panel] 修改設定並推播給線上設備"""
    
    device = db.query(Device).filter(Device.android_id == android_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
        
    # 寫入資料庫
    config_json = json.dumps(config_data)
    db.execute(text("""
        INSERT INTO device_app_configs (device_id, app_id, config_data, updated_at) 
        VALUES (:d_id, :a_id, :conf, NOW())
        ON DUPLICATE KEY UPDATE config_data = :conf, updated_at = NOW()
    """), {"d_id": device.id, "a_id": target_app_id, "conf": config_json})
    db.commit()

    # 如果設備在線上，透過 WebSocket 即時推播指令
    payload = {
        "action": "update_config",
        "target_app": target_app_id,
        "data": config_data
    }
    await ws_manager.send_command(android_id, payload)
    
    return {"status": "success", "message": "Config saved and push attempted"}

# @router.get("/devices/{android_id}/sync-configs")
# async def device_pull_configs(android_id: str, api_key: str, db: Session = Depends(get_db)):

#     """[App 端] MDM App 開機或重連時，主動拉取所有屬於此設備的 Config"""

#     device = db.query(Device).filter(and_(Device.android_id == android_id, Device.device_api_key == api_key)).first()
#     if not device:
#         raise HTTPException(status_code=401, detail="Unauthorized")
        
#     configs = db.execute(text("SELECT app_id, config_data FROM device_app_configs WHERE device_id = :d_id"), {"d_id": device.id}).fetchall()
    
#     result = {row.app_id: json.loads(row.config_data) for row in configs}
#     return {"status": "success", "configs": result}

@router.get("/devices/{android_id}/configs/{app_id}")
async def device_get_specific_app_config(
    android_id: str, 
    app_id: str, 
    api_key: str = Query(...), 
    db: Session = Depends(get_db)
):
    """[App 端] 取得指定設備的指定單一 App 設定"""
    device = db.query(Device).filter(and_(Device.android_id == android_id, Device.device_api_key == api_key)).first()
    if not device:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    query = text("SELECT config_data FROM device_app_configs WHERE device_id = :d_id AND app_id = :a_id")
    result = db.execute(query, {"d_id": device.id, "a_id": app_id}).first()
    
    return {"status": "success", "config": json.loads(result[0]) if result else {}}
