"""
Router: Impresión (Printing)

Endpoints:
  POST /print/kitchen-ticket  → imprime ticket de cocina en la ticketera USB
  POST /print/receipt         → imprime recibo del cliente
  GET  /print/status          → verifica si la impresora está disponible
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services.printer import printer_service

router = APIRouter(prefix="/print", tags=["Printing"])


class KitchenTicketPrintRequest(BaseModel):
    ticket_id: int
    order_id: int
    table_number: Optional[int] = None
    ticket_number: int = 1
    created_at: str = ""
    items: list = []


class ReceiptPrintRequest(BaseModel):
    """Acepta el mismo schema que BillingDocument."""
    tipo_doc: str = "03"
    serie: str = "B001"
    correlativo: str = "00000001"
    fecha_emision: str = ""
    ruc_emisor: str = ""
    razon_social_emisor: str = ""
    direccion_emisor: str = ""
    igv_porcentaje: float = 10.5
    op_gravadas: float = 0.0
    igv: float = 0.0
    total: float = 0.0
    items: list = []
    order_id: int = 0
    table_number: Optional[int] = None


@router.post("/kitchen-ticket", status_code=200)
async def print_kitchen_ticket(payload: KitchenTicketPrintRequest):
    """Envía un ticket de cocina a la impresora USB."""
    success = printer_service.print_kitchen_ticket(payload.model_dump())
    if not success:
        raise HTTPException(
            status_code=503,
            detail="No se pudo imprimir. Verifique que la impresora esté conectada.",
        )
    return {"ok": True, "message": "Ticket de cocina impreso correctamente."}


@router.post("/receipt", status_code=200)
async def print_receipt(payload: ReceiptPrintRequest):
    """Imprime el recibo final del cliente."""
    success = printer_service.print_receipt(payload.model_dump())
    if not success:
        raise HTTPException(
            status_code=503,
            detail="No se pudo imprimir el recibo.",
        )
    return {"ok": True, "message": "Recibo impreso correctamente."}


@router.get("/status")
async def printer_status():
    """Verifica si la impresora USB está disponible."""
    from app.services.printer import ESCPOS_AVAILABLE
    return {
        "escpos_installed": ESCPOS_AVAILABLE,
        "printer_connected": ESCPOS_AVAILABLE and printer_service._get_printer() is not None,
    }
