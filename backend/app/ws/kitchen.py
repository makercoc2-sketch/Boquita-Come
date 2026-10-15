from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.ws.manager import manager
import logging

router = APIRouter(tags=["WebSocket"])
logger = logging.getLogger(__name__)


@router.websocket("/ws/kitchen")
async def kitchen_ws(websocket: WebSocket):
    """
    Pantalla de cocina. Recibe los tickets de cocina en tiempo real.
    """
    await manager.connect(websocket, room="kitchen")
    try:
        while True:
            # Mantiene la conexión viva; responde a pings del cliente
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
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
            if data == "ping":
                await websocket.send_text("pong")
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
            if data == "ping":
                await websocket.send_text("pong")
            logger.debug(f"[ws/waiter] ping recibido: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket, room=room)


@router.websocket("/ws/global")
async def global_ws(websocket: WebSocket):
    """
    Canal de notificaciones globales. Recibe eventos que afectan a todos los perfiles.
    """
    await manager.connect(websocket, room="global")
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
            logger.debug(f"[ws/global] ping recibido: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket, room="global")

@router.websocket("/ws/cashier")
async def cashier_ws(websocket: WebSocket):
    """
    Pantalla de caja. Recibe notificaciones cuando una mesa pasa a 'Por Pagar'.
    """
    await manager.connect(websocket, room="cashier")
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
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
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, room=room)
