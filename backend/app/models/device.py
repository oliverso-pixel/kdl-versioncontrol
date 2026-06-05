from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class Device(Base):
    __tablename__ = "devices"
    
    id = Column(Integer, primary_key=True, index=True)
    android_id = Column(String(100), unique=True, index=True, nullable=False)

    device_api_key = Column(String(100), unique=True, nullable=True)

    device_model = Column(String(200))
    os_version = Column(String(50))
    app_version = Column(String(50))
    last_check_time = Column(DateTime, default=datetime.utcnow)
    additional_info = Column(Text)  # JSON field for extra data
    notes = Column(Text)  # Admin notes
    is_active = Column(Boolean, default=True)

    is_online = Column(Boolean, default=False)
    battery_level = Column(Integer, nullable=True)
    latitude = Column(Numeric(10, 8), nullable=True)
    longitude = Column(Numeric(11, 8), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    update_logs = relationship("UpdateLog", back_populates="device")