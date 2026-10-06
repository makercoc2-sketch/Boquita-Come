from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.ws.manager import manager
import logging

router = APIRouter(tags=["WebSocket"])
logger = logging.getLogger(__name__)


@router.websocket("/ws/kitchen")
async def kitchen_ws(websocket: WebSocket):
    """
    Pantalla de cocina. Recibe los tickets de cocina en tiempo real.

    Protocolo de mensajes (JSON):
    {
        "event": "new_ticket",
        "ticket": {
            "ticket_id": 42,
            "order_id": 10,
            "table_number": 3,
            "ticket_number": 2,
            "items": [
                {"product": "Lomo Saltado", "qty": 2, "notes": "sin cebolla",
                 "modifiers": [{"group": "Término", "option": "Medio"}]}
            ],
            "created_at": "2026-02-19T20:30:00"
        }
    }
    """
    await manager.connect(websocket, room="kitchen")
    try:
        while True:
            # Mantiene la conexión viva; acepta pings del cliente
            data = await websocket.receive_text()
            logger.debug(f"[ws/kitchen] ping recibido: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket, room="kitchen")


@router.websocket("/ws/bar")
async def bar_ws(websocket: WebSocket):
    """
    Pantalla de Bar. Recibe los tickets de bar en tiempo real.
    """
    await manager.connect(websocket, room="bar")
    try:
        while True:
            data = await websocket.receive_text()
            logger.debug(f"[ws/bar] ping recibido: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket, room="bar")

@router.websocket("/ws/waiter/{user_id}")
async def waiter_ws(websocket: WebSocket, user_id: int):
    """
    Pantalla de mozo conectada a su propia room.
    """
    room = f"waiter_{user_id}"
    await manager.connect(websocket, room=room)
    try:
        while True:
            data = await websocket.receive_text()
            logger.debug(f"[ws/waiter] ping recibido: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket, room=room)


@router.websocket("/ws/global")
async def global_ws(websocket: WebSocket):
    """
    Canal de notificaciones globales. Recibe eventos que afectan a todos los perfiles,
    como la llegada de un nuevo pedido.
    """
    await manager.connect(websocket, room="global")
    try:
        while True:
            data = await websocket.receive_text()
            logger.debug(f"[ws/global] ping recibido: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket, room="global")

@router.websocket("/ws/cashier")
async def cashier_ws(websocket: WebSocket):
    """
    Pantalla de caja. Recibe notificaciones cuando una mesa pasa a 'Por Pagar'.

    Protocolo de mensajes (JSON):
    {
        "event": "table_ready_to_pay",
        "table": {"id": 3, "number": 3, "order_id": 10, "total": 92.50}
    }
    """
    await manager.connect(websocket, room="cashier")
    try:
        while True:
            data = await websocket.receive_text()
            logger.debug(f"[ws/cashier] ping recibido: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket, room="cashier")


@router.websocket("/ws/table/{table_id}")
async def table_ws(websocket: WebSocket, table_id: int):
    """
    Canal privado por mesa (futuro: notificación de que su pedido está listo).
    """
    room = f"table_{table_id}"
    await manager.connect(websocket, room=room)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, room=room)
