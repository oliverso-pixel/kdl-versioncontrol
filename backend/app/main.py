from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import os
import logging
from datetime import datetime
from .config import settings
from .database import engine, Base
from .api import auth, version_check, admin, websocket, statistics, database_mgmt, settings as settings_api
from .api.v2 import websocket as v2_websocket
from .api.v2 import version_check as v2_version_check
from .api.v2 import mdm as v2_mdm
from .core.utils import ensure_directory_exists, setup_logging

# Setup logging
setup_logging()
logger = logging.getLogger(__name__)

# Create database tables
Base.metadata.create_all(bind=engine)

# Ensure directories exist
ensure_directory_exists(settings.APK_STORAGE_PATH)
ensure_directory_exists("./logs")
ensure_directory_exists("./backups")

app = FastAPI(
    title="Version Control Center",
    description="Central version control system for Android applications",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Exception handlers
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    logger.error(f"HTTP error: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation error: {exc}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()}
    )

# Include routers
app.include_router(auth.router, tags=["Authentication"])
app.include_router(v2_mdm.router)
app.include_router(version_check.router, tags=["Version Check (V1)"])
app.include_router(admin.router, tags=["Admin"])
app.include_router(websocket.router, tags=["WebSocket (V1)"])
app.include_router(statistics.router, tags=["Statistics"])
app.include_router(database_mgmt.router, tags=["Database Management"])
app.include_router(settings_api.router, tags=["System Settings"])

app.include_router(v2_version_check.router, prefix="/api/v2", tags=["Version Check (V2)"])
app.include_router(v2_websocket.router, prefix="/api/v2", tags=["WebSocket (V2)"])

# Serve APK files
@app.get("/api/download/{app_id}/{branch}/{filename}")
async def download_apk(app_id: str, branch: str, filename: str):
    """Download APK file"""
    file_path = os.path.join(settings.APK_STORAGE_PATH, app_id, branch, filename)
    
    if not os.path.exists(file_path):
        logger.warning(f"File not found: {file_path}")
        return JSONResponse(
            status_code=404,
            content={"error": "File not found"}
        )
    
    logger.info(f"Serving APK: {filename}")
    
    return FileResponse(
        path=file_path,
        media_type="application/vnd.android.package-archive",
        filename=filename
    )

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/")
async def root():
    return {
        "message": "Version Control Center API",
        "version": "1.0.0",
        "documentation": "/api/docs",
        "endpoints": {
            "auth": "/api/auth/token",
            "check_version": "/api/check-version",
            "admin": "/api/admin/*",
            "statistics": "/api/admin/statistics",
            "database": "/api/admin/database/*",
            "settings": "/api/admin/settings",
            "websocket": "/ws/{app_id}/{branch}",
            "health": "/health"
        }
    }

@app.on_event("startup")
async def startup_event():
    logger.info(f"Server starting on {settings.HOST}:{settings.PORT}")
    logger.info(f"APK storage path: {settings.APK_STORAGE_PATH}")
    logger.info(f"Database: {settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Server shutting down")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
        log_level="info"
    )