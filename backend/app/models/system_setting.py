from sqlalchemy import Column, Integer, String, DateTime, Text
from datetime import datetime
from ..database import Base
from ..core.utils import get_hkt_now

class SystemSetting(Base):
    __tablename__ = "system_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(50), nullable=False)
    key = Column(String(100), nullable=False)
    value = Column(Text)
    description = Column(Text)
    created_at = Column(DateTime, default=get_hkt_now)
    updated_at = Column(DateTime, default=get_hkt_now, onupdate=get_hkt_now)
