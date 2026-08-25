from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class GesturePoint(BaseModel):
    x: int
    y: int

class GestureStroke(BaseModel):
    points: List[GesturePoint] = Field(..., min_length=1, max_length=100)
    duration_ms: int = Field(50, ge=1, le=10000)
    start_ms: int = Field(0, ge=0)

class GestureRequest(BaseModel):
    """統一手勢請求，涵蓋 tap / long-press / swipe / drag / multi-touch。

    - 1 個 stroke + 1 point + duration_ms 短 → tap
    - 1 個 stroke + 1 point + duration_ms >= 500 → long-press
    - 1 個 stroke + 2 points → swipe
    - 1 個 stroke + N points → drag / 折線
    - 多個 stroke → 多指手勢（GestureDescription 上限 10）
    """
    strokes: List[GestureStroke] = Field(..., min_length=1, max_length=10)

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