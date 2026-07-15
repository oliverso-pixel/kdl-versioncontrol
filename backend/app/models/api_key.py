from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text
from datetime import datetime
from ..database import Base
from ..core.utils import get_hkt_now

class ApiKey(Base):
    __tablename__ = "api_keys"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    key = Column(String(100), unique=True, index=True, nullable=False)
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_hkt_now)
    expires_at = Column(DateTime, nullable=True)
    last_used = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)