import os
from typing import List
from pydantic_settings import BaseSettings
from dotenv import load_dotenv
from urllib.parse import quote_plus

load_dotenv()

class Settings(BaseSettings):
    # Database - 分離的參數
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: int = int(os.getenv("DB_PORT", 3306))
    DB_USER: str = os.getenv("DB_USER", "root")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "")
    DB_NAME: str = os.getenv("DB_NAME", "version_control_db")
    
    # 動態建構 DATABASE_URL
    @property
    def DATABASE_URL(self) -> str:
        # 對密碼進行 URL 編碼
        password = quote_plus(self.DB_PASSWORD)
        return f"mysql+pymysql://{self.DB_USER}:{password}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
    
    # 其他設定保持不變
    SECRET_KEY: str = os.getenv("SECRET_KEY")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))
    
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", 8000))
    
    APK_STORAGE_PATH: str = os.getenv("APK_STORAGE_PATH", "./app/static/apks/")
    MAX_FILE_SIZE: int = int(os.getenv("MAX_FILE_SIZE", 500000000))
    
    # Nominatim 反向地理編碼 server (查詢中文地址用)；留空 = 停用反查，address 一律寫 NULL
    NOMINATIM_BASE_URL: str = os.getenv("NOMINATIM_BASE_URL", "")
    # 地址回填任務：每隔多少秒補一輪、每輪最多幾筆
    GEOCODE_BACKFILL_INTERVAL: int = int(os.getenv("GEOCODE_BACKFILL_INTERVAL", 300))
    GEOCODE_BACKFILL_BATCH: int = int(os.getenv("GEOCODE_BACKFILL_BATCH", 100))

    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:8080",
        "http://192.9.204.143:3000",
        "http://192.9.204.143:3001",
        "http://192.9.204.143",
        "*"
    ]
    
    class Config:
        case_sensitive = True

settings = Settings()