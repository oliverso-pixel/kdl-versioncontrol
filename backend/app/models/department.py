from sqlalchemy import Column, String, Integer, DateTime
from sqlalchemy.sql import func
from ..database import Base

class Department(Base):
    __tablename__ = "department"

    dept_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    dept_code = Column(String(50), unique=True, nullable=False, index=True) 
    dept_name_zh = Column(String(100), nullable=False)
    dept_name_en = Column(String(100), nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())