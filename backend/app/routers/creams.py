"""
Router: Cremas y Salsas con Diminutivos (Creams)

Endpoints:
  GET    /creams/       → Obtener lista de cremas activas
  POST   /creams/       → Crear nueva crema
  PUT    /creams/{id}   → Actualizar crema
  DELETE /creams/{id}   → Eliminar/Desactivar crema
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel, Field

from app.db.base import get_db
from app.models.cream import Cream

router = APIRouter(prefix="/creams", tags=["Creams"])

# ─── Schemas ──────────────────────────────────────────────────────────────────

class CreamCreate(BaseModel):
    name: str = Field(..., min_length=1, description="Nombre completo de la crema")
    abbreviation: str = Field(..., min_length=1, description="Diminutivo/abreviatura ej: /my")

class CreamUpdate(BaseModel):
    name: Optional[str] = None
    abbreviation: Optional[str] = None
    is_active: Optional[bool] = None

class CreamOut(BaseModel):
    id: int
    name: str
    abbreviation: str
    is_active: bool

    model_config = {"from_attributes": True}


DEFAULT_CREAMS = [
    {"name": "Mayonesa", "abbreviation": "/my"},
    {"name": "Ketchup", "abbreviation": "/kt"},
    {"name": "Mostaza", "abbreviation": "/mz"},
    {"name": "Ají", "abbreviation": "/aj"},
    {"name": "Tártara", "abbreviation": "/tt"},
    {"name": "Golf", "abbreviation": "/gf"},
]

# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[CreamOut])
async def list_creams(db: AsyncSession = Depends(get_db)):
    """Obtiene todas las cremas activas. Si no hay ninguna, genera las predeterminadas."""
    query = select(Cream).where(Cream.is_active == True).order_by(Cream.id.asc())
    result = await db.execute(query)
    creams = result.scalars().all()

    if not creams:
        for item in DEFAULT_CREAMS:
            c = Cream(name=item["name"], abbreviation=item["abbreviation"])
            db.add(c)
        await db.commit()
        
        result = await db.execute(query)
        creams = result.scalars().all()

    return creams


@router.post("/", response_model=CreamOut, status_code=status.HTTP_201_CREATED)
async def create_cream(payload: CreamCreate, db: AsyncSession = Depends(get_db)):
    """Crea una nueva crema con su diminutivo."""
    abbr = payload.abbreviation.strip()
    if not abbr.startswith("/"):
        abbr = f"/{abbr}"

    cream = Cream(
        name=payload.name.strip(),
        abbreviation=abbr,
        is_active=True,
    )
    db.add(cream)
    await db.commit()
    await db.refresh(cream)
    return cream


@router.put("/{cream_id}", response_model=CreamOut)
async def update_cream(cream_id: int, payload: CreamUpdate, db: AsyncSession = Depends(get_db)):
    """Actualiza una crema existente."""
    cream = await db.get(Cream, cream_id)
    if not cream:
        raise HTTPException(status_code=404, detail="Crema no encontrada.")

    if payload.name is not None:
        cream.name = payload.name.strip()
    if payload.abbreviation is not None:
        abbr = payload.abbreviation.strip()
        if not abbr.startswith("/"):
            abbr = f"/{abbr}"
        cream.abbreviation = abbr
    if payload.is_active is not None:
        cream.is_active = payload.is_active

    await db.commit()
    await db.refresh(cream)
    return cream


@router.delete("/{cream_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cream(cream_id: int, db: AsyncSession = Depends(get_db)):
    """Desactiva una crema."""
    cream = await db.get(Cream, cream_id)
    if not cream:
        raise HTTPException(status_code=404, detail="Crema no encontrada.")

    cream.is_active = False
    await db.commit()
    return None
