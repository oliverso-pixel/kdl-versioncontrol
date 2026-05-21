from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class Branch(Base):
    __tablename__ = "branches"
    
    id = Column(Integer, primary_key=True, index=True)
    branch_name = Column(String(100), nullable=False)
    application_id = Column(Integer, ForeignKey("applications.id"))
    description = Column(String(500))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    application = relationship("Application", back_populates="branches")
    versions = relationship("Version", back_populates="branch")