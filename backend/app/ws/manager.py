import json
from collections import defaultdict
from typing import Dict, List
from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Gestiona las conexiones WebSocket agrupadas por sala (room).

    Salas predefinidas:
        - "kitchen"  → pantalla de cocina
        - "cashier"  → caja / pantalla de cobro
        - "table_{id}" → tablet de una mesa específica (futuro)
    """

    def __init__(self):
        # room -> lista de conexiones activas
        self._rooms: Dict[str, List[WebSocket]] = defaultdict(list)

    async def connect(self, websocket: WebSocket, room: str) -> None:
        await websocket.accept()
        self._rooms[room].append(websocket)
        logger.info(f"[WS] Conectado a sala '{room}' | Total: {len(self._rooms[room])}")

    def disconnect(self, websocket: WebSocket, room: str) -> None:
        self._rooms[room].discard(websocket) if hasattr(self._rooms[room], "discard") else None
        try:
            self._rooms[room].remove(websocket)
        except ValueError:
            pass
        logger.info(f"[WS] Desconectado de sala '{room}' | Total: {len(self._rooms[room])}")

    async def broadcast_to_room(self, room: str, data: dict) -> None:
        """Envía un mensaje JSON a todos los clientes de una sala."""
        message = json.dumps(data, ensure_ascii=False, default=str)
        dead = []
        for ws in list(self._rooms[room]):
            try:
                await ws.send_text(message)
            except Exception as exc:
                logger.warning(f"[WS] Error enviando a sala '{room}': {exc}")
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, room)

    async def broadcast_all(self, data: dict) -> None:
        """Envía a todas las salas."""
        for room in list(self._rooms.keys()):
            await self.broadcast_to_room(room, data)

    def room_size(self, room: str) -> int:
        return len(self._rooms[room])


# Instancia global (singleton por proceso)
manager = ConnectionManager()
