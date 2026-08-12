# backend/app/models/screen_session.py
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from ..database import Base
from ..core.utils import get_hkt_now

class ScreenControlSession(Base):
    """螢幕控制 Session 記錄"""
    __tablename__ = "screen_control_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False)
    admin_user = Column(String(100), nullable=False)  # 誰發起的控制
    session_id = Column(String(100), unique=True, index=True, nullable=False)
    
    is_active = Column(Boolean, default=True)
    quality = Column(Integer, default=50)  # JPEG 壓縮品質 (1-100)
    scale = Column(Integer, default=2)     # 縮放倍數 (1=100%, 2=50%, 3=33%)
    
    started_at = Column(DateTime, default=get_hkt_now)
    ended_at = Column(DateTime, nullable=True)
    
    device = relationship("Device", backref="screen_sessions")

class ScreenControlLog(Base):
    """螢幕控制操作日誌（點擊、滑動、按鍵）"""
    __tablename__ = "screen_control_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("screen_control_sessions.id"), nullable=False)
    action = Column(String(50), nullable=False)  # tap, swipe, key, input_text
    params = Column(Text, nullable=True)  # JSON 參數（座標、按鍵碼等）
    created_at = Column(DateTime, default=get_hkt_now)
    
    session = relationship("ScreenControlSession", backref="logs")
