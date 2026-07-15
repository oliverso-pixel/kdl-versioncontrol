from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base
from ..core.utils import get_hkt_now

class Application(Base):
    __tablename__ = "applications"
    
    id = Column(Integer, primary_key=True, index=True)
    app_id = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(String(500))
    default_config = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_hkt_now)
    updated_at = Column(DateTime, default=get_hkt_now, onupdate=get_hkt_now)
    
    branches = relationship("Branch", back_populates="application")
    versions = relationship("Version", back_populates="application")