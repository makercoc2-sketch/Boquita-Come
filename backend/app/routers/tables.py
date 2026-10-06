"""
Router: Mesas (Tables)

Endpoints:
  GET    /tables/          → listar todas las mesas
  POST   /tables/          → crear mesa
  GET    /tables/{id}      → detalle de una mesa
  PATCH  /tables/{id}      → actualizar (número, capacidad, estado)
  DELETE /tables/{id}      → eliminar mesa (solo si está FREE y sin órdenes activas)
  POST   /tables/merge     → unir mesas (merge)
  POST   /tables/unmerge/{id} → deshacer merge de una mesa principal
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

from app.db.base import get_db
from app.models.table import Table, TableStatus
from app.ws.manager import manager

router = APIRouter(prefix="/tables", tags=["Tables"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class TableCreate(BaseModel):
    number: int = Field(..., gt=0)
    name: Optional[str] = None
    capacity: int = Field(4, gt=0)


class TableUpdate(BaseModel):
    name: Optional[str] = None
    capacity: Optional[int] = Field(None, gt=0)
    status: Optional[TableStatus] = None


class MergeTablesRequest(BaseModel):
    primary_table_id: int = Field(..., description="Mesa principal (la que mantiene la orden)")
    secondary_table_ids: List[int] = Field(
        ..., min_length=1, description="Mesas a unir a la principal"
    )


class TableOut(BaseModel):
    id: int
    number: int
    name: Optional[str]
    capacity: int
    status: TableStatus
    merged_into: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[TableOut])
async def list_tables(db: AsyncSession = Depends(get_db)):
    """Retorna todas las mesas ordenadas por número, sincronizando automáticamente su estado con las órdenes activas."""
    result = await db.execute(select(Table).order_by(Table.number))
    tables = result.scalars().all()

    # Obtener todas las mesas con órdenes activas (OPEN o SENT) QUE TENGAN AL MENOS 1 ÍTEM
    from app.models.order import Order, OrderItem, OrderStatus
    active_orders_res = await db.execute(
        select(Order.table_id)
        .join(OrderItem, OrderItem.order_id == Order.id)
        .where(Order.status.in_([OrderStatus.OPEN, OrderStatus.SENT]))
        .distinct()
    )
    active_table_ids = set(active_orders_res.scalars().all())

    table_changed = False
    for table in tables:
        if table.id in active_table_ids:
            # Si tiene orden activa con consumos y figuraba como FREE, corregir a OCCUPIED
            if table.status == TableStatus.FREE:
                table.status = TableStatus.OCCUPIED
                table_changed = True
        else:
            # Si NO tiene orden activa con consumos y figura como OCCUPIED (sin estar unida ni reservada), corregir a FREE
            if table.status == TableStatus.OCCUPIED and not table.merged_into:
                table.status = TableStatus.FREE
                table_changed = True
            
            # Limpiar órdenes vacías huérfanas de mesas físicas (sin ítems) que hayan quedado abiertas
            # Excluimos la mesa virtual de delivery (number == 0) para que no borre órdenes delivery recién creadas
            if table.number != 0:
                empty_orders_res = await db.execute(
                    select(Order).where(
                        Order.table_id == table.id,
                        Order.status == OrderStatus.OPEN
                    )
                )
                for eo in empty_orders_res.scalars().all():
                    if not eo.items:
                        await db.delete(eo)
                        table_changed = True



    if table_changed:
        await db.commit()

    return tables



@router.post("/", response_model=TableOut, status_code=status.HTTP_201_CREATED)
async def create_table(payload: TableCreate, db: AsyncSession = Depends(get_db)):
    """Crea una nueva mesa."""
    existing = await db.execute(select(Table).where(Table.number == payload.number))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe una mesa con el número {payload.number}.",
        )
    table = Table(**payload.model_dump())
    db.add(table)
    await db.flush()
    await db.refresh(table)
    return table


@router.get("/{table_id}", response_model=TableOut)
async def get_table(table_id: int, db: AsyncSession = Depends(get_db)):
    table = await db.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Mesa no encontrada.")
    return table


@router.patch("/{table_id}", response_model=TableOut)
async def update_table(
    table_id: int, payload: TableUpdate, db: AsyncSession = Depends(get_db)
):
    table = await db.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Mesa no encontrada.")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(table, field, value)

    await db.flush()
    await db.refresh(table)

    # Cascade status to merged secondary tables
    affected_tables = [table]
    if payload.status is not None:
        result = await db.execute(
            select(Table).where(Table.merged_into == table.id)
        )
        for sec in result.scalars().all():
            sec.status = payload.status
            await db.flush()
            await db.refresh(sec)
            affected_tables.append(sec)

    # Broadcast table updates to all screens
    for t in affected_tables:
        await manager.broadcast_to_room("global", {
            "event": "table_updated",
            "table": {"id": t.id, "number": t.number, "status": t.status.value if hasattr(t.status, 'value') else t.status},
        })

    # Notificar a caja si pasa a TOPAY
    if payload.status == TableStatus.TOPAY:
        await manager.broadcast_to_room("cashier", {
            "event": "table_ready_to_pay",
            "table": {"id": table.id, "number": table.number, "status": table.status},
        })

    return table


@router.delete("/{table_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_table(table_id: int, db: AsyncSession = Depends(get_db)):
    table = await db.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Mesa no encontrada.")
    if table.status != TableStatus.FREE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Solo se puede eliminar una mesa en estado LIBRE.",
        )
    await db.delete(table)


# ─── Merge de Mesas ───────────────────────────────────────────────────────────

@router.post("/merge", response_model=List[TableOut], status_code=status.HTTP_200_OK)
async def merge_tables(payload: MergeTablesRequest, db: AsyncSession = Depends(get_db)):
    """
    Une varias mesas en un grupo.

    Lógica:
      1. Valida que la mesa principal exista y no sea ella misma secundaria de otra.
      2. Valida que las secundarias existan y estén LIBRES.
      3. Marca cada secundaria con merged_into = primary_table_id y status = OCCUPIED.
      4. Cambia la mesa principal a OCCUPIED si no lo estaba.
      5. Retorna el estado actualizado de todas las mesas involucradas.
    """
    if payload.primary_table_id in payload.secondary_table_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La mesa principal no puede estar en la lista de secundarias.",
        )

    # Cargar mesa principal
    primary = await db.get(Table, payload.primary_table_id)
    if not primary:
        raise HTTPException(status_code=404, detail=f"Mesa principal {payload.primary_table_id} no encontrada.")
    if primary.merged_into is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La mesa {primary.number} ya está unida a otra (id={primary.merged_into}). Primero deshaz el merge.",
        )

    # Cargar y validar mesas secundarias
    secondaries: List[Table] = []
    for sid in payload.secondary_table_ids:
        sec = await db.get(Table, sid)
        if not sec:
            raise HTTPException(status_code=404, detail=f"Mesa secundaria {sid} no encontrada.")
        if sec.status not in (TableStatus.FREE,):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"La mesa {sec.number} no está LIBRE (estado: {sec.status}). No se puede unir.",
            )
        if sec.merged_into is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"La mesa {sec.number} ya está unida a otra.",
            )
        secondaries.append(sec)

    # Aplicar merge
    primary.status = TableStatus.OCCUPIED
    for sec in secondaries:
        sec.merged_into = primary.id
        sec.status = TableStatus.OCCUPIED

    await db.flush()
    for t in [primary] + secondaries:
        await db.refresh(t)

    # Notificar WebSocket (global para que todos los mapas se actualicen)
    for t in [primary] + secondaries:
        await manager.broadcast_to_room("global", {
            "event": "table_updated",
            "table": {"id": t.id, "number": t.number, "status": t.status.value, "merged_into": t.merged_into},
        })
    await manager.broadcast_to_room("global", {
        "event": "tables_merged",
        "primary_table_id": primary.id,
        "secondary_table_ids": payload.secondary_table_ids,
    })

    return [primary] + secondaries


@router.post("/unmerge/{primary_table_id}", response_model=List[TableOut])
async def unmerge_tables(primary_table_id: int, db: AsyncSession = Depends(get_db)):
    """
    Deshace el merge: libera todas las mesas secundarias y las pone en FREE.
    La mesa principal mantiene su estado actual (puede tener una orden activa).
    """
    primary = await db.get(Table, primary_table_id)
    if not primary:
        raise HTTPException(status_code=404, detail="Mesa principal no encontrada.")

    result = await db.execute(
        select(Table).where(Table.merged_into == primary_table_id)
    )
    secondaries = result.scalars().all()

    if not secondaries:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta mesa no tiene mesas secundarias unidas.",
        )

    for sec in secondaries:
        sec.merged_into = None
        sec.status = TableStatus.FREE

    await db.flush()
    for t in [primary] + list(secondaries):
        await db.refresh(t)

    # Broadcast updates to all screens
    for t in [primary] + list(secondaries):
        await manager.broadcast_to_room("global", {
            "event": "table_updated",
            "table": {"id": t.id, "number": t.number, "status": t.status.value if hasattr(t.status, 'value') else t.status, "merged_into": t.merged_into},
        })
    await manager.broadcast_to_room("global", {
        "event": "tables_unmerged",
        "primary_table_id": primary.id,
    })

    return [primary] + list(secondaries)
