# backend/app/database.py
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import settings

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

mssql_engine = None
MSSQLSessionLocal = None
if settings.MSSQL_URL:
    mssql_engine = create_engine(settings.MSSQL_URL)
    MSSQLSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=mssql_engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_mssql_db():
    if not MSSQLSessionLocal:
        yield None
        return
    db = MSSQLSessionLocal()
    try:
        yield db
    finally:
        db.close()
