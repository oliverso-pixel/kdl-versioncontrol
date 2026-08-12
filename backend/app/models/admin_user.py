# backend/app/models/admin_user.py
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from datetime import datetime
from ..database import Base
from ..core.utils import get_hkt_now

class AdminUser(Base):
    __tablename__ = "admin_users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    created_at = Column(DateTime, default=get_hkt_now)
    last_login = Column(DateTime, nullable=True)
