# backend/app/schemas/screen_control.py
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ScreenCaptureRequest(BaseModel):
    quality: int = 50  # 1-100
    scale: int = 2     # 1=100%, 2=50%, 3=33%, 4=25%

class TouchEventRequest(BaseModel):
    x: int
    y: int
    action: str = "tap"  # tap | down | move | up

class KeyEventRequest(BaseModel):
    keycode: int  # Android Keycode

class TextInputRequest(BaseModel):
    text: str

class SwipeGestureRequest(BaseModel):
    start_x: int
    start_y: int
    end_x: int
    end_y: int
    duration: int = 300  # 毫秒

class RotateScreenRequest(BaseModel):
    rotation: int  # 0=正常, 1=90度, 2=180度, 3=270度

class ScreenControlSessionResponse(BaseModel):
    session_id: str
    device_id: int
    is_active: bool
    quality: int
    scale: int
    started_at: datetime
    
    class Config:
        from_attributes = True
