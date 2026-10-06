"""
Router: Comandas / Pedidos (Orders)

Endpoints:
  POST /orders/                      → abrir nueva orden en una mesa
  GET  /orders/{id}                  → obtener orden con todos sus ítems
  POST /orders/{id}/items            → agregar ítems a una orden abierta
  POST /orders/{id}/send-kitchen     → enviar ítems nuevos a cocina (genera KitchenTicket)
  POST /orders/{id}/close            → cerrar / marcar como PAID
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm.attributes import flag_modified

from app.db.base import get_db
from app.models.order import Order, OrderItem, KitchenTicket, OrderStatus, ItemStatus
from app.models.table import Table, TableStatus
from app.models.product import Product
from app.models.user import User
from app.ws.manager import manager

router = APIRouter(prefix="/orders", tags=["Orders"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ModifierSnapshot(BaseModel):
    group: str
    option: str
    price_delta: float = 0.0


class OrderItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(1, gt=0)
    modifiers: List[ModifierSnapshot] = []
    notes: Optional[str] = None


class OrderCreate(BaseModel):
    table_id: int
    user_id: Optional[int] = None
    guest_count: Optional[int] = None
    notes: Optional[str] = None


class DeliveryOrderCreate(BaseModel):
    user_id: Optional[int] = None
    customer_name: str
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    notes: Optional[str] = None


class OrderClose(BaseModel):
    payment_method: str = Field(..., description="Efectivo, Tarjeta, Yape, etc.")


class OrderItemOut(BaseModel):
    id: int
    product_id: int
    quantity: int
    price_at_time: float
    modifiers: Optional[list]
    notes: Optional[str]
    status: ItemStatus
    sent_to_kitchen_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}

class ItemStatusUpdate(BaseModel):
    status: ItemStatus


class OrderItemUpdate(BaseModel):
    notes: Optional[str] = None


class SendKitchenPayload(BaseModel):
    user_id: Optional[int] = None


class OrderPatch(BaseModel):
    user_id: Optional[int] = None
    guest_count: Optional[int] = None
    notes: Optional[str] = None


class KitchenTicketOut(BaseModel):
    id: int
    ticket_number: int
    user_id: Optional[int] = None
    items_snapshot: list
    created_at: datetime

    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    id: int
    table_id: int
    user_id: Optional[int]
    status: OrderStatus
    guest_count: Optional[int]
    notes: Optional[str]
    extra: Optional[dict]
    subtotal: float
    created_at: datetime
    items: List[OrderItemOut]
    kitchen_tickets: List[KitchenTicketOut]

    model_config = {"from_attributes": True}



# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def create_order(payload: OrderCreate, db: AsyncSession = Depends(get_db)):
    """Abre una nueva comanda para una mesa."""
    table = await db.get(Table, payload.table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Mesa no encontrada.")

    # Verificar que no tenga una orden OPEN ya
    existing = await db.execute(
        select(Order).where(
            Order.table_id == payload.table_id,
            Order.status.in_([OrderStatus.OPEN, OrderStatus.SENT]),
        )
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La mesa ya tiene una orden activa.",
        )

    order = Order(
        table_id=payload.table_id,
        user_id=payload.user_id,
        guest_count=payload.guest_count,
        notes=payload.notes,
    )
    db.add(order)
    table.status = TableStatus.OCCUPIED
    await db.flush()
    await db.refresh(order)

    # Broadcast table status change so TableMap updates in real-time
    await manager.broadcast_to_room("global", {
        "event": "table_updated",
        "table": {"id": table.id, "number": table.number, "status": table.status.value},
    })

    return order


# ── VIRTUAL_DELIVERY_TABLE_NUMBER — mesa número 0 reservada para delivery ───────
DELIVERY_TABLE_NUMBER = 0


@router.post("/delivery", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def create_delivery_order(payload: DeliveryOrderCreate, db: AsyncSession = Depends(get_db)):
    """Crea una orden de tipo DELIVERY usando la mesa virtual (número 0)."""
    # Obtener la mesa virtual de delivery
    result = await db.execute(
        select(Table).where(Table.number == DELIVERY_TABLE_NUMBER)
    )
    delivery_table = result.scalars().first()
    if not delivery_table:
        raise HTTPException(status_code=500, detail="Mesa virtual de delivery no configurada. Contacta al administrador.")

    order = Order(
        table_id=delivery_table.id,
        user_id=payload.user_id,
        notes=payload.notes,
        extra={
            "order_type": "delivery",
            "customer_name": payload.customer_name,
            "customer_phone": payload.customer_phone or "",
            "customer_address": payload.customer_address or "",
        },
    )
    db.add(order)
    await db.flush()
    await db.refresh(order)

    # Notificar via WebSocket (no cambia estado de mesa real)
    await manager.broadcast_to_room("global", {
        "event": "new_delivery_order",
        "order_id": order.id,
        "customer_name": payload.customer_name,
    })

    return order


@router.get("/delivery/active", response_model=List[OrderOut])
async def get_active_delivery_orders(db: AsyncSession = Depends(get_db)):
    """Devuelve todas las órdenes de delivery activas (OPEN o SENT)."""
    result = await db.execute(
        select(Table).where(Table.number == DELIVERY_TABLE_NUMBER)
    )
    delivery_table = result.scalars().first()
    if not delivery_table:
        return []

    from sqlalchemy.orm import selectinload
    orders_result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.product),
            selectinload(Order.kitchen_tickets),
            selectinload(Order.user),
        )
        .where(
            Order.table_id == delivery_table.id,
            Order.status.in_([OrderStatus.OPEN, OrderStatus.SENT]),
        )
        .order_by(Order.id.desc())
    )
    return orders_result.scalars().all()



@router.get("/active/{table_id}", response_model=OrderOut)
async def get_active_order(table_id: int, db: AsyncSession = Depends(get_db)):

    """Devuelve la orden activa (OPEN o SENT) de una mesa."""
    result = await db.execute(
        select(Order).where(
            Order.table_id == table_id,
            Order.status.in_([OrderStatus.OPEN, OrderStatus.SENT]),
        ).order_by(Order.id.desc())
    )
    order = result.scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Mesa sin orden activa.")
    return order



@router.get("/{order_id}", response_model=OrderOut)
async def get_order(order_id: int, db: AsyncSession = Depends(get_db)):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada.")
    return order


@router.get("/kitchen-tickets/active", response_model=List[dict])
async def get_active_kitchen_tickets(db: AsyncSession = Depends(get_db)):
    """Retorna todos los tickets de cocina de órdenes que siguen activas (OPEN o SENT)."""
    # Joined load with Order, User and Table to construct the ticket payload
    from sqlalchemy.orm import joinedload
    query = (
        select(KitchenTicket)
        .join(Order, Order.id == KitchenTicket.order_id)
        .options(
            joinedload(KitchenTicket.user),
            joinedload(KitchenTicket.order).joinedload(Order.user),
        )
        .where(Order.status.in_([OrderStatus.OPEN, OrderStatus.SENT]))
        .order_by(KitchenTicket.created_at.desc())
    )
    result = await db.execute(query)
    tickets = result.scalars().all()

    # Recolectar status actualizados de todos los items
    item_ids = []
    for t in tickets:
        snapshot = t.items_snapshot if isinstance(t.items_snapshot, list) else []
        for it in snapshot:
            if isinstance(it, dict) and "order_item_id" in it:
                item_ids.append(it["order_item_id"])

    item_status_map = {}
    if item_ids:
        status_query = select(OrderItem.id, OrderItem.status).where(OrderItem.id.in_(item_ids))
        status_res = await db.execute(status_query)
        for i_id, i_status in status_res.all():
            item_status_map[i_id] = i_status.value

    payloads = []
    for t in tickets:
        table = await db.get(Table, t.order.table_id)
        # Prioridad absoluta al mozo que emitió este ticket específico
        waiter_obj = t.user or (t.order.user if t.order else None)
        waiter_id = t.user_id or (t.order.user_id if t.order else None)
        waiter_name = waiter_obj.name if waiter_obj else None
        
        # Inyectar el estatus más reciente
        updated_items = []
        snapshot = t.items_snapshot if isinstance(t.items_snapshot, list) else []
        for it in snapshot:
            if isinstance(it, dict):
                updated_it = dict(it)
                item_id = updated_it.get("order_item_id")
                updated_it["status"] = item_status_map.get(item_id, "PENDING") if item_id else "PENDING"
                updated_items.append(updated_it)

        # Delivery info
        order_extra = t.order.extra if t.order and isinstance(t.order.extra, dict) else {}
        is_delivery = order_extra.get("order_type") == "delivery"

        payloads.append({
            "ticket_id": t.id,
            "order_id": t.order.id,
            "table_id": table.id if table else None,
            "table_number": table.number if table else None,
            "ticket_number": t.ticket_number,
            "waiter_id": waiter_id,
            "waiter_name": waiter_name,
            "is_delivery": is_delivery,
            "delivery_info": {
                "customer_name": order_extra.get("customer_name", ""),
                "customer_phone": order_extra.get("customer_phone", ""),
                "customer_address": order_extra.get("customer_address", ""),
            } if is_delivery else None,
            "items": updated_items,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })
    return payloads



@router.get("/kitchen-tickets/today", response_model=List[dict])
async def get_today_kitchen_tickets(db: AsyncSession = Depends(get_db)):
    """Retorna los tickets de cocina generados hoy (historial), independientemente del estado de la orden."""
    from sqlalchemy.orm import joinedload
    from datetime import datetime, timedelta
    
    # Obtenemos la fecha de hoy a las 00:00:00
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    query = (
        select(KitchenTicket)
        .join(Order, Order.id == KitchenTicket.order_id)
        .options(
            joinedload(KitchenTicket.user),
            joinedload(KitchenTicket.order).joinedload(Order.user),
        )
        .where(KitchenTicket.created_at >= today_start)
        .order_by(KitchenTicket.created_at.desc())
    )
    result = await db.execute(query)
    tickets = result.scalars().all()

    # Recolectar status actualizados de todos los items
    item_ids = []
    for t in tickets:
        snapshot = t.items_snapshot if isinstance(t.items_snapshot, list) else []
        for it in snapshot:
            if isinstance(it, dict) and "order_item_id" in it:
                item_ids.append(it["order_item_id"])

    item_status_map = {}
    if item_ids:
        status_query = select(OrderItem.id, OrderItem.status).where(OrderItem.id.in_(item_ids))
        status_res = await db.execute(status_query)
        for i_id, i_status in status_res.all():
            item_status_map[i_id] = i_status.value

    payloads = []
    for t in tickets:
        table = await db.get(Table, t.order.table_id)
        waiter_obj = t.user or (t.order.user if t.order else None)
        waiter_id = t.user_id or (t.order.user_id if t.order else None)
        waiter_name = waiter_obj.name if waiter_obj else None
        
        updated_items = []
        snapshot = t.items_snapshot if isinstance(t.items_snapshot, list) else []
        for it in snapshot:
            if isinstance(it, dict):
                updated_it = dict(it)
                item_id = updated_it.get("order_item_id")
                updated_it["status"] = item_status_map.get(item_id, "PENDING") if item_id else "PENDING"
                updated_items.append(updated_it)

        # Delivery info
        order_extra = t.order.extra if t.order and isinstance(t.order.extra, dict) else {}
        is_delivery = order_extra.get("order_type") == "delivery"

        payloads.append({
            "ticket_id": t.id,
            "order_id": t.order.id,
            "table_id": table.id if table else None,
            "table_number": table.number if table else None,
            "ticket_number": t.ticket_number,
            "waiter_id": waiter_id,
            "waiter_name": waiter_name,
            "is_delivery": is_delivery,
            "delivery_info": {
                "customer_name": order_extra.get("customer_name", ""),
                "customer_phone": order_extra.get("customer_phone", ""),
                "customer_address": order_extra.get("customer_address", ""),
            } if is_delivery else None,
            "items": updated_items,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })
    return payloads



@router.post("/{order_id}/items", response_model=OrderOut)
async def add_items(
    order_id: int,
    items: List[OrderItemCreate],
    db: AsyncSession = Depends(get_db),
):
    """
    Agrega ítems a una orden abierta en cualquier momento (sistema Add-on).
    Los ítems nuevos tienen sent_to_kitchen_at=None hasta el próximo envío a cocina.
    """
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada.")
    if order.status not in (OrderStatus.OPEN, OrderStatus.SENT):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No se pueden añadir ítems a una orden en estado {order.status}.",
        )

    for item_data in items:
        product = await db.get(Product, item_data.product_id)
        if not product:
            raise HTTPException(
                status_code=404,
                detail=f"Producto {item_data.product_id} no encontrado.",
            )
        if not product.is_available:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"El producto '{product.name}' no está disponible.",
            )

        order_item = OrderItem(
            order_id=order.id,
            product_id=product.id,
            quantity=item_data.quantity,
            price_at_time=product.price,
            modifiers=[m.model_dump() for m in item_data.modifiers],
            notes=item_data.notes,
            sent_to_kitchen_at=None,  # pendiente de envío
        )
        db.add(order_item)

    # Reabrir la orden si estaba en SENT y asegurar que la mesa figure como OCCUPIED
    order.status = OrderStatus.OPEN
    table = await db.get(Table, order.table_id)
    if table and table.status == TableStatus.FREE:
        table.status = TableStatus.OCCUPIED
        await manager.broadcast_to_room("global", {
            "event": "table_updated",
            "table": {"id": table.id, "number": table.number, "status": table.status.value},
        })
    await db.flush()
    await db.refresh(order)
    return order



@router.patch("/{order_id}", response_model=OrderOut)
async def update_order_details(order_id: int, payload: OrderPatch, db: AsyncSession = Depends(get_db)):
    """Permite actualizar datos de la orden, por ejemplo el mozo asignado (user_id)."""
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada.")
    if payload.user_id is not None:
        order.user_id = payload.user_id
    if payload.guest_count is not None:
        order.guest_count = payload.guest_count
    if payload.notes is not None:
        order.notes = payload.notes
    await db.flush()
    await db.refresh(order)
    return order


@router.post("/{order_id}/send-kitchen", response_model=KitchenTicketOut)
async def send_to_kitchen(
    order_id: int,
    payload: Optional[SendKitchenPayload] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Genera un KitchenTicket con los ítems que aún NO han sido enviados a cocina.
    Marca esos ítems como enviados (sent_to_kitchen_at = now).
    Transmite el ticket por WebSocket a la pantalla de cocina.
    """
    from sqlalchemy.orm import selectinload
    query = (
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.product),
            selectinload(Order.kitchen_tickets),
            selectinload(Order.user),
        )
        .where(Order.id == order_id)
    )
    res = await db.execute(query)
    order = res.scalars().first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada.")

    # Filtrar solo ítems nuevos (no enviados aún)
    new_items = [item for item in order.items if item.sent_to_kitchen_at is None]
    if not new_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay ítems nuevos para enviar a cocina.",
        )

    now = datetime.now(timezone.utc)

    # Identificar el mozo/usuario que envía el pedido a cocina
    sender_id = (payload.user_id if payload and payload.user_id else None) or order.user_id
    waiter_name = None
    waiter_id = sender_id

    if sender_id:
        user_obj = await db.get(User, sender_id)
        if user_obj:
            waiter_name = user_obj.name
            waiter_id = user_obj.id
            sender_role_str = str(user_obj.role.value if hasattr(user_obj.role, "value") else user_obj.role).lower()
            mozo_roles = ["mozo", "caja"]
            # Si la orden no tenía usuario o si el que envía es un mozo, asignamos la comanda a dicho mozo
            if not order.user_id or (sender_role_str in mozo_roles):
                order.user_id = user_obj.id
    elif order and order.user_id:
        user_obj = await db.get(User, order.user_id)
        if user_obj:
            waiter_name = user_obj.name
            waiter_id = user_obj.id

    # Descifrar los destinos buscando las categorías
    category_ids = {item.product.category_id for item in new_items if item.product and item.product.category_id}
    from app.models.category import ProductCategory
    if category_ids:
        categories_result = await db.execute(select(ProductCategory).where(ProductCategory.id.in_(category_ids)))
        category_map = {c.id: c.destination for c in categories_result.scalars()}
    else:
        category_map = {}

    # Construir snapshot del ticket
    snapshot = []
    for item in new_items:
        dest = category_map.get(item.product.category_id, "kitchen") if item.product else "kitchen"
        snapshot.append({
            "order_item_id": item.id,
            "product": item.product.name if item.product else f"Prod#{item.product_id}",
            "qty": item.quantity,
            "notes": item.notes,
            "modifiers": item.modifiers or [],
            "destination": dest,
            "status": item.status.value,
        })
        item.sent_to_kitchen_at = now

    # Número de ticket correlativo para esta orden
    ticket_number = len(order.kitchen_tickets) + 1

    ticket = KitchenTicket(
        order_id=order.id,
        ticket_number=ticket_number,
        items_snapshot=snapshot,
        user_id=waiter_id,
    )
    db.add(ticket)
    order.status = OrderStatus.SENT
    await db.flush()
    await db.refresh(ticket)

    # ── WebSocket → pantallas de cocina y bar ────────────────────────────
    table = await db.get(Table, order.table_id)
    if table and table.status == TableStatus.FREE:
        table.status = TableStatus.OCCUPIED
        await manager.broadcast_to_room("global", {
            "event": "table_updated",
            "table": {"id": table.id, "number": table.number, "status": table.status.value},
        })

    # Delivery info from order.extra
    order_extra = order.extra if isinstance(order.extra, dict) else {}
    is_delivery = order_extra.get("order_type") == "delivery"

    ws_payload = {
        "event": "new_ticket",
        "ticket": {
            "ticket_id": ticket.id,
            "order_id": order.id,
            "table_id": table.id if table else None,
            "table_number": table.number if table else None,
            "ticket_number": ticket.ticket_number,
            "waiter_id": waiter_id,
            "waiter_name": waiter_name,
            "is_delivery": is_delivery,
            "delivery_info": {
                "customer_name": order_extra.get("customer_name", ""),
                "customer_phone": order_extra.get("customer_phone", ""),
                "customer_address": order_extra.get("customer_address", ""),
            } if is_delivery else None,
            "items": snapshot,
            "created_at": now.isoformat(),
        },
    }
    await manager.broadcast_to_room("kitchen", ws_payload)
    await manager.broadcast_to_room("bar", ws_payload)
    await manager.broadcast_to_room("global", ws_payload)


    return ticket


@router.patch("/items/{item_id}/status", response_model=OrderItemOut)
async def update_item_status(item_id: int, payload: ItemStatusUpdate, db: AsyncSession = Depends(get_db)):
    """Actualiza el estado de un ítem (ej. PREPARING, COMPLETED, DELIVERED) y notifica."""
    item = await db.get(OrderItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado.")

    item.status = payload.status
    await db.flush()
    await db.refresh(item)

    order = await db.get(Order, item.order_id)
    table = await db.get(Table, order.table_id) if order else None
    product = await db.get(Product, item.product_id) if item else None

    ws_payload = {
        "event": "item_status_changed",
        "item_id": item.id,
        "product_name": product.name if product else f"Ítem #{item.id}",
        "quantity": item.quantity,
        "status": item.status.value,
        "order_id": item.order_id,
        "table_id": order.table_id if order else None,
        "table_number": table.number if table else None,
        "waiter_id": order.user_id if order else None,
    }
    await manager.broadcast_to_room("kitchen", ws_payload)
    await manager.broadcast_to_room("bar", ws_payload)
    await manager.broadcast_to_room("global", ws_payload)
    
    # Notificar únicamente al mozo dueño del pedido original
    if order and order.user_id:
        room_name = f"waiter_{order.user_id}"
        await manager.broadcast_to_room(room_name, ws_payload)
    else:
        # Fallback al canal general si no hay dueño
        await manager.broadcast_to_room("waiter", ws_payload)


    
    # Si cambió a COMPLETED o DELIVERED, avisar a los meseros que "escuchan" a la mesa
    if payload.status in (ItemStatus.COMPLETED, ItemStatus.DELIVERED):
        # We broadcast the whole order or just the item update
        # frontend currently relies on reloading order or similar on general events
        pass

    return item


@router.put("/items/{item_id}", response_model=OrderItemOut)
async def update_order_item(
    item_id: int,
    payload: OrderItemUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Actualiza las observaciones (notas, cremas, para llevar) de un ítem ya pedido y notifica en tiempo real."""
    item = await db.get(OrderItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado.")

    if payload.notes is not None:
        item.notes = payload.notes

    # Actualizar también el snapshot en los tickets de cocina correspondientes
    tickets_res = await db.execute(
        select(KitchenTicket).where(KitchenTicket.order_id == item.order_id)
    )
    tickets = tickets_res.scalars().all()
    for t in tickets:
        snapshot = list(t.items_snapshot) if isinstance(t.items_snapshot, list) else []
        modified = False
        new_snapshot = []
        for it in snapshot:
            if isinstance(it, dict) and it.get("order_item_id") == item.id:
                it = dict(it)
                it["notes"] = item.notes
                it["is_edited"] = True
                modified = True
            new_snapshot.append(it)
        if modified:
            t.items_snapshot = new_snapshot
            flag_modified(t, "items_snapshot")

    await db.flush()
    await db.refresh(item)

    order = await db.get(Order, item.order_id)

    ws_payload = {
        "event": "item_updated",
        "item_id": item.id,
        "notes": item.notes,
        "is_edited": True,
        "order_id": item.order_id,
        "table_id": order.table_id if order else None,
    }
    await manager.broadcast_to_room("kitchen", ws_payload)
    await manager.broadcast_to_room("bar", ws_payload)
    await manager.broadcast_to_room("global", ws_payload)

    if order and order.user_id:
        await manager.broadcast_to_room(f"waiter_{order.user_id}", ws_payload)

    return item


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_order_item(
    item_id: int,
    user_role: Optional[str] = "Mozo",
    db: AsyncSession = Depends(get_db),
):
    """
    Elimina/cancela un ítem de la comanda.
    - Si está en ESPERA (PENDING): cualquier rol puede eliminarlo.
    - Si está EN PREPARACIÓN (PREPARING) o posterior: solo Cajero (Caja), Admin o Sistemas pueden eliminarlo.
    """
    item = await db.get(OrderItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado.")

    role_clean = (user_role or "Mozo").lower().strip()
    privileged_roles = ["caja", "cajero", "cashier", "administrador", "admin", "sistemas", "system"]

    if item.status in (ItemStatus.PREPARING, ItemStatus.COMPLETED, ItemStatus.DELIVERED):
        if role_clean not in privileged_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="El plato ya está en preparación en cocina. Solo un Cajero o Administrador puede cancelarlo.",
            )

    order = await db.get(Order, item.order_id)

    # Remover del snapshot de tickets de cocina
    tickets_res = await db.execute(
        select(KitchenTicket).where(KitchenTicket.order_id == item.order_id)
    )
    tickets = tickets_res.scalars().all()
    for t in tickets:
        snapshot = list(t.items_snapshot) if isinstance(t.items_snapshot, list) else []
        new_snapshot = [it for it in snapshot if isinstance(it, dict) and it.get("order_item_id") != item.id]
        t.items_snapshot = new_snapshot
        flag_modified(t, "items_snapshot")

    await db.delete(item)
    await db.flush()

    ws_payload = {
        "event": "item_deleted",
        "item_id": item_id,
        "order_id": order.id if order else None,
        "table_id": order.table_id if order else None,
    }
    await manager.broadcast_to_room("kitchen", ws_payload)
    await manager.broadcast_to_room("bar", ws_payload)
    await manager.broadcast_to_room("global", ws_payload)
    
    if order and order.user_id:
        await manager.broadcast_to_room(f"waiter_{order.user_id}", ws_payload)

    return None


@router.post("/{order_id}/close", response_model=OrderOut)
async def close_order(order_id: int, payload: OrderClose, db: AsyncSession = Depends(get_db)):
    """Cierra y marca la orden como PAID. Libera la mesa y todas las mesas unidas."""
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada.")

    order.status = OrderStatus.PAID
    
    # Store payment method in the extra JSON field
    from typing import cast, Any
    extra_data = cast(dict[str, Any], order.extra) if isinstance(order.extra, dict) else {}
    extra_data["payment_method"] = payload.payment_method
    order.extra = extra_data
    
    # Marcar como PAID cualquier otra orden activa que hubiese quedado huérfana en la misma mesa
    from sqlalchemy import update as sa_update
    await db.execute(
        sa_update(Order)
        .where(
            Order.table_id == order.table_id,
            Order.status.in_([OrderStatus.OPEN, OrderStatus.SENT])
        )
        .values(status=OrderStatus.PAID)
    )

    table = await db.get(Table, order.table_id)
    freed_tables = []
    if table:
        table.status = TableStatus.FREE
        table.merged_into = None
        freed_tables.append(table)

    # Liberar mesas secundarias que estuvieran unidas
    from sqlalchemy import select as sa_select
    from app.models.table import Table as TableModel
    result = await db.execute(
        sa_select(TableModel).where(TableModel.merged_into == table.id)
    )
    for sec in result.scalars().all():
        sec.merged_into = None
        sec.status = TableStatus.FREE
        freed_tables.append(sec)

    await db.flush()
    await db.refresh(order)

    # Broadcast table updates for all freed tables
    for t in freed_tables:
        await manager.broadcast_to_room("global", {
            "event": "table_updated",
            "table": {"id": t.id, "number": t.number, "status": t.status.value},
        })

    return order


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_order(order_id: int, db: AsyncSession = Depends(get_db)):
    """Cancela una orden activa y libera la mesa(s) asociada(s)."""
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada.")

    # Marcar como CANCELLED todas las órdenes activas de la mesa
    from sqlalchemy import update as sa_update
    await db.execute(
        sa_update(Order)
        .where(
            Order.table_id == order.table_id,
            Order.status.in_([OrderStatus.OPEN, OrderStatus.SENT])
        )
        .values(status=OrderStatus.CANCELLED)
    )
    
    # Liberar la mesa principal
    table = await db.get(Table, order.table_id)

    freed_tables = []
    if table:
        table.status = TableStatus.FREE
        table.merged_into = None
        freed_tables.append(table)
    
    # Liberar posibles mesas secundarias
    from sqlalchemy import select as sa_select
    from app.models.table import Table as TableModel
    result = await db.execute(
        sa_select(TableModel).where(TableModel.merged_into == order.table_id)
    )
    for sec in result.scalars().all():
        sec.merged_into = None
        sec.status = TableStatus.FREE
        freed_tables.append(sec)

    await db.flush()

    # Broadcast table updates for all freed tables
    for t in freed_tables:
        await manager.broadcast_to_room("global", {
            "event": "table_updated",
            "table": {"id": t.id, "number": t.number, "status": t.status.value},
        })

