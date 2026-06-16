from typing import TypeVar, Generic, List, Optional
from pydantic import BaseModel
from fastapi import Query

T = TypeVar('T')

class PaginationParams:
    def __init__(
        self,
        skip: int = Query(0, ge=0, description="Number of items to skip"),
        limit: int = Query(100, ge=1, le=1000, description="Number of items to return")
    ):
        self.skip = skip
        self.limit = limit

class PaginatedResponse(BaseModel, Generic[T]):
    total: int
    skip: int
    limit: int
    data: List[T]
    
def paginate(query, skip: int = 0, limit: int = 100):
    """Apply pagination to a SQLAlchemy query"""
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": items
    }