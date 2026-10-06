"""
Router: Facturación (Billing)

Exporta la venta final a JSON compatible con proveedores de Facturación Electrónica (PSE) Perú.
IGV: 10.5% según Ley 2026 (Decreto Supremo que modifica el Texto Único Ordenado de la Ley del IGV).

Formato de salida compatible con SUNAT / PSE (boleta o factura electrónica tipo UBL 2.1).

Endpoints:
  GET  /billing/{order_id}/preview  → previsualización sin guardar
  POST /billing/{order_id}/export   → genera JSON final de venta
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pydantic import BaseModel
from typing import List, Optional

from app.db.base import get_db
from app.models.order import Order, OrderStatus
from app.core.config import settings

router = APIRouter(prefix="/billing", tags=["Billing"])


# ─── Schemas de salida PSE-compatible ────────────────────────────────────────

class BillingItem(BaseModel):
    codigo_producto: str
    descripcion: str
    unidad_medida: str = "NIU"        # Unidad (SUNAT catálogo 6)
    cantidad: int
    precio_unitario: float
    descuento: float = 0.0
    subtotal: float


class BillingDocument(BaseModel):
    # Cabecera del comprobante
    tipo_doc: str               # "01"=Factura, "03"=Boleta
    serie: str                  # Ej: "B001"
    correlativo: str            # Ej: "00000042"
    fecha_emision: str          # ISO 8601
    moneda: str = "PEN"

    # Datos del emisor
    ruc_emisor: str
    razon_social_emisor: str
    direccion_emisor: str
    telefono_emisor: Optional[str] = ""
    mensaje_pie: Optional[str] = "¡Gracias por su visita!"

    # Datos del receptor (cliente)
    tipo_doc_receptor: Optional[str] = "1"  # 1=DNI, 6=RUC
    num_doc_receptor: Optional[str] = None
    razon_social_receptor: Optional[str] = "CLIENTE FINAL"

    # Totales
    igv_porcentaje: float
    op_gravadas: float          # Base imponible
    igv: float                  # Monto IGV
    total: float

    # Detalle
    items: List[BillingItem]

    # Referencia interna
    order_id: int
    table_number: Optional[int] = None
    is_delivery: bool = False
    delivery_info: Optional[dict] = None



# ─── Lógica de cálculo ────────────────────────────────────────────────────────

def _calc_igv(base: Decimal, igv_pct: Decimal) -> tuple[Decimal, Decimal]:
    """
    Retorna (base_imponible, igv_monto).
    El precio ya INCLUYE IGV (precio de venta final al consumidor).
    Base = total / (1 + igv_pct/100)
    """
    factor = 1 + igv_pct / 100
    base_imponible = (base / factor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    igv_monto = (base - base_imponible).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return base_imponible, igv_monto


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/{order_id}/preview", response_model=BillingDocument)
async def preview_billing(
    order_id: int,
    tipo_doc: str = "03",   # 03=Boleta por defecto
    db: AsyncSession = Depends(get_db),
):
    """Previsualiza el documento de pago sin persistir nada."""
    return await _build_document(order_id, tipo_doc, db)


@router.post("/{order_id}/export", response_model=BillingDocument)
async def export_billing(
    order_id: int,
    tipo_doc: str = "03",
    num_doc_receptor: Optional[str] = None,
    tipo_doc_receptor: str = "1",
    razon_social_receptor: str = "CLIENTE FINAL",
    db: AsyncSession = Depends(get_db),
):
    """
    Genera el JSON final de la venta lista para enviarse al PSE (proveedor de
    servicios electrónicos: Nubefact, Facturalo Perú, etc.).
    En producción: aquí se haría el POST al endpoint del PSE.
    """
    doc = await _build_document(order_id, tipo_doc, db)
    doc.num_doc_receptor = num_doc_receptor
    doc.tipo_doc_receptor = tipo_doc_receptor
    doc.razon_social_receptor = razon_social_receptor
    return doc


# ─── Helper ───────────────────────────────────────────────────────────────────

async def _build_document(order_id: int, tipo_doc: str, db: AsyncSession) -> BillingDocument:
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada.")
    if order.status not in (OrderStatus.SENT, OrderStatus.PAID):
        raise HTTPException(
            status_code=400,
            detail="La orden debe estar enviada o pagada para facturar.",
        )

    # Cargar datos configurados del negocio desde la base de datos
    from app.models.setting import SystemSetting
    result_s = await db.execute(select(SystemSetting).limit(1))
    db_setting = result_s.scalar_one_or_none()

    business_name = db_setting.business_name if db_setting else settings.BUSINESS_NAME
    business_ruc = db_setting.business_ruc if db_setting else settings.BUSINESS_RUC
    business_address = db_setting.business_address if db_setting else settings.BUSINESS_ADDRESS
    business_phone = db_setting.business_phone if db_setting else ""
    igv_val = db_setting.igv_percentage if db_setting else settings.IGV_PERCENTAGE
    receipt_footer = (db_setting.receipt_footer if db_setting and db_setting.receipt_footer else "¡Gracias por su visita!")

    igv_pct = Decimal(str(igv_val))
    total_decimal = Decimal("0.00")
    billing_items: List[BillingItem] = []

    for item in order.items:
        # Precio con modificadores
        mod_delta = sum(
            Decimal(str(m.get("price_delta", 0))) for m in (item.modifiers or [])
        )
        unit_price = Decimal(str(item.price_at_time)) + mod_delta
        subtotal = (unit_price * item.quantity).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        total_decimal += subtotal

        product_name = (
            item.product.name if item.product else f"Producto #{item.product_id}"
        )
        billing_items.append(BillingItem(
            codigo_producto=str(item.product_id),
            descripcion=product_name,
            cantidad=item.quantity,
            precio_unitario=float(unit_price),
            subtotal=float(subtotal),
        ))

    base_imponible, igv_monto = _calc_igv(total_decimal, igv_pct)

    now = datetime.now(timezone.utc)
    # Correlativo simple basado en order_id (en producción usar secuencia persistida)
    correlativo = str(order_id).zfill(8)

    table = await db.get(__import__("app.models.table", fromlist=["Table"]).Table, order.table_id)
    order_extra = order.extra if isinstance(order.extra, dict) else {}
    is_delivery = order_extra.get("order_type") == "delivery"
    customer_name = order_extra.get("customer_name") if is_delivery else "CLIENTE FINAL"

    return BillingDocument(
        tipo_doc=tipo_doc,
        serie="B001" if tipo_doc == "03" else "F001",
        correlativo=correlativo,
        fecha_emision=now.strftime("%Y-%m-%d"),
        ruc_emisor=business_ruc,
        razon_social_emisor=business_name,
        direccion_emisor=business_address,
        telefono_emisor=business_phone,
        mensaje_pie=receipt_footer,
        razon_social_receptor=customer_name or "CLIENTE FINAL",
        igv_porcentaje=float(igv_pct),
        op_gravadas=float(base_imponible),
        igv=float(igv_monto),
        total=float(total_decimal),
        items=billing_items,
        order_id=order_id,
        table_number=table.number if table and not is_delivery else None,
        is_delivery=is_delivery,
        delivery_info={
            "customer_name": order_extra.get("customer_name", ""),
            "customer_phone": order_extra.get("customer_phone", ""),
            "customer_address": order_extra.get("customer_address", ""),
        } if is_delivery else None,
    )

