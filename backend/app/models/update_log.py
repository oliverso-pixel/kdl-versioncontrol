# backend/app/models/update_log.py
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base
from ..core.utils import get_hkt_now

class UpdateLog(Base):
    __tablename__ = "update_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    application_id = Column(Integer, ForeignKey("applications.id"))
    branch_id = Column(Integer, ForeignKey("branches.id"))
    from_version = Column(String(50))
    to_version = Column(String(50))
    update_type = Column(String(50))  # 'check', 'download', 'install'
    status = Column(String(50))  # 'success', 'failed', 'pending'
    created_at = Column(DateTime, default=get_hkt_now)
    
    device = relationship("Device", back_populates="update_logs")
