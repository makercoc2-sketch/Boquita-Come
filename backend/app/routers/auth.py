from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel

from app.db.base import get_db
from app.models.user import User, RoleType

router = APIRouter(prefix="/auth", tags=["Auth"])

class LoginRequest(BaseModel):
    pin: str

class UserCreate(BaseModel):
    name: str
    pin: str
    role: RoleType

class UserUpdate(BaseModel):
    name: Optional[str] = None
    pin: Optional[str] = None
    role: Optional[RoleType] = None
    is_active: Optional[bool] = None

class UserOut(BaseModel):
    id: int
    name: str
    role: str
    pin: str
    is_active: bool

    model_config = {"from_attributes": True}

@router.post("/login", response_model=UserOut)
async def login_by_pin(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.pin == payload.pin))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="PIN incorrecto o usuario no encontrado"
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario inactivo"
        )

    return user

@router.get("/users", response_model=List[UserOut])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User))
    return result.scalars().all()

@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    # Validar PIN único
    existing = await db.execute(select(User).where(User.pin == payload.pin))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un usuario con este PIN."
        )
    
    user = User(**payload.model_dump())
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user

@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: int, payload: UserUpdate, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    update_data = payload.model_dump(exclude_none=True)
    
    # Validar PIN si se está cambiando
    if "pin" in update_data and update_data["pin"] != user.pin:
        existing = await db.execute(select(User).where(User.pin == update_data["pin"]))
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe otro usuario con este PIN."
            )

    for field, value in update_data.items():
        setattr(user, field, value)

    await db.flush()
    await db.refresh(user)
    return user

@router.post("/users/seed")
async def seed_users(db: AsyncSession = Depends(get_db)):
    # Crear usuarios de prueba (Admin, Cocina, Bar, Mozo 1, Mozo 2)
    users = [
        {"name": "Admin Principal", "pin": "0000", "role": RoleType.ADMIN},
        {"name": "Chef Principal", "pin": "1111", "role": RoleType.COCINA},
        {"name": "Barman", "pin": "2222", "role": RoleType.BAR},
        {"name": "Mozo Juan", "pin": "3333", "role": RoleType.MOZO},
        {"name": "Mozo Maria", "pin": "4444", "role": RoleType.MOZO},
    ]

    for ud in users:
        res = await db.execute(select(User).where(User.pin == ud["pin"]))
        if not res.scalar_one_or_none():
            u = User(name=ud["name"], pin=ud["pin"], role=ud["role"])
            db.add(u)
    
    await db.commit()
    return {"msg": "Usuarios testeados/creados correctamente"}
