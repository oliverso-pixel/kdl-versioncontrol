# backend/app/models/version.py
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base
from ..core.utils import get_hkt_now

class Version(Base):
    __tablename__ = "versions"
    
    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"))
    branch_id = Column(Integer, ForeignKey("branches.id"))
    version_code = Column(Integer, nullable=False)
    version_name = Column(String(50), nullable=False)
    apk_download_url = Column(String(500), nullable=False)
    apk_file_path = Column(String(500))
    apk_file_hash = Column(String(64))  # SHA256 hash
    file_size = Column(Integer)
    force_update = Column(Boolean, default=False)
    min_supported_version = Column(Integer, default=0)
    release_notes = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=get_hkt_now)
    
    application = relationship("Application", back_populates="versions")
    branch = relationship("Branch", back_populates="versions")
