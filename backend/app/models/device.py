# backend/app/models/device.py
from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, Numeric, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base
from ..core.utils import get_hkt_now

class Device(Base):
    __tablename__ = "devices"
    
    id = Column(Integer, primary_key=True, index=True)
    android_id = Column(String(100), unique=True, index=True, nullable=False)

    hardware_id = Column(String(100), unique=True, nullable=True)

    device_api_key = Column(String(100), unique=True, nullable=True)

    device_model = Column(String(200))
    os_version = Column(String(50))
    app_signature = Column(JSON, nullable=True)
    last_check_time = Column(DateTime, default=get_hkt_now)
    additional_info = Column(Text)  # JSON field for extra data
    notes = Column(Text)  # Admin notes
    is_active = Column(Boolean, default=True)

    is_online = Column(Boolean, default=False)
    battery_level = Column(Integer, nullable=True)
    latitude = Column(Numeric(10, 8), nullable=True)
    longitude = Column(Numeric(11, 8), nullable=True)

    route = Column(String(100), nullable=True)
    altitude = Column(Numeric(10, 2), nullable=True)
    address = Column(Text, nullable=True)
    satellites = Column(Integer, nullable=True)
    gps_time = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=get_hkt_now)
    updated_at = Column(DateTime, default=get_hkt_now, onupdate=get_hkt_now)
    
    update_logs = relationship("UpdateLog", back_populates="device")
