"""
Servicio de impresión térmica USB.

Usa python-escpos para comunicarse con la ticketera conectada por USB a la PC principal.
El vendor_id y product_id se configuran en .env y se resuelven desde settings.

Instalación del driver libusb en Windows:
  1. Instalar Zadig (https://zadig.akeo.ie/)
  2. Seleccionar la impresora → instalar WinUSB driver
  3. python -m pip install python-escpos

En Linux (Raspberry Pi / Ubuntu):
  sudo usermod -aG lp $USER && sudo usermod -aG dialout $USER
"""

import logging
from typing import Optional
from app.core.config import settings

logger = logging.getLogger(__name__)

# Intentamos importar escpos; si no está instalado en el entorno de dev no falla
try:
    from escpos.printer import Usb as UsbPrinter
    ESCPOS_AVAILABLE = True
except ImportError:
    ESCPOS_AVAILABLE = False
    logger.warning("[Printer] python-escpos no instalado. Impresión simulada en consola.")


class PrinterService:
    """Servicio de impresión térmica ESC/POS vía USB."""

    def __init__(self):
        self._printer = None

    def _get_printer(self):
        """Lazy-init de la conexión USB."""
        if not ESCPOS_AVAILABLE:
            return None
        if self._printer is None:
            try:
                self._printer = UsbPrinter(
                    settings.PRINTER_VENDOR_ID,
                    settings.PRINTER_PRODUCT_ID,
                    timeout=0,
                    in_ep=0x82,
                    out_ep=0x01,
                )
                logger.info("[Printer] Impresora USB conectada correctamente.")
            except Exception as exc:
                logger.error(f"[Printer] Error conectando impresora: {exc}")
                self._printer = None
        return self._printer

    def _format_ticket(self, ticket_data: dict) -> list[str]:
        """Genera el contenido del ticket de cocina."""
        lines = []
        lines.append("================================")
        lines.append(f"  {settings.BUSINESS_NAME.upper()}")
        lines.append(f"  TICKET DE COCINA #{ticket_data.get('ticket_number', '?')}")
        lines.append(f"  MESA: {ticket_data.get('table_number', '?')}")
        if ticket_data.get("waiter_name"):
            lines.append(f"  MOZO: {ticket_data.get('waiter_name')}")
        lines.append("================================")
        lines.append(f"  Orden: #{ticket_data.get('order_id', '?')}")
        lines.append(f"  Hora:  {ticket_data.get('created_at', '')[:19]}")
        lines.append("--------------------------------")
        for item in ticket_data.get("items", []):
            lines.append(f"  {item['qty']}x  {item['product']}")
            if item.get("notes"):
                lines.append(f"       >> {item['notes']}")
            for mod in item.get("modifiers", []):
                lines.append(f"       - {mod.get('group','')}: {mod.get('option','')}")
        lines.append("================================\n\n\n")
        return lines

    def _format_receipt(self, billing_data: dict) -> list[str]:
        """Genera el recibo final para el cliente."""
        lines = []
        lines.append("================================")
        lines.append(f"  {billing_data.get('razon_social_emisor','')}")
        lines.append(f"  RUC: {billing_data.get('ruc_emisor','')}")
        lines.append(f"  {billing_data.get('direccion_emisor','')}")
        lines.append("================================")
        tipo = "BOLETA" if billing_data.get("tipo_doc") == "03" else "FACTURA"
        lines.append(f"  {tipo} ELECTRÓNICA")
        lines.append(f"  {billing_data.get('serie','')}-{billing_data.get('correlativo','')}")
        lines.append(f"  Fecha: {billing_data.get('fecha_emision','')}")
        lines.append("--------------------------------")
        lines.append(f"  Mesa: {billing_data.get('table_number','')}")
        lines.append("--------------------------------")
        for item in billing_data.get("items", []):
            name = item['descripcion'][:22]
            lines.append(f"  {item['cantidad']}x {name}")
            lines.append(f"      S/ {item['subtotal']:.2f}")
        lines.append("================================")
        lines.append(f"  OP. GRAVADAS: S/ {billing_data.get('op_gravadas',0):.2f}")
        igv_pct = billing_data.get("igv_porcentaje", 10.5)
        lines.append(f"  IGV ({igv_pct}%):   S/ {billing_data.get('igv',0):.2f}")
        lines.append(f"  TOTAL:        S/ {billing_data.get('total',0):.2f}")
        lines.append("================================")
        lines.append("  ¡Gracias por su visita!")
        lines.append("\n\n\n")
        return lines

    def print_kitchen_ticket(self, ticket_data: dict) -> bool:
        """Imprime un ticket de cocina."""
        lines = self._format_ticket(ticket_data)
        return self._send_to_printer(lines)

    def print_receipt(self, billing_data: dict) -> bool:
        """Imprime el recibo del cliente."""
        lines = self._format_receipt(billing_data)
        return self._send_to_printer(lines)

    def _send_to_printer(self, lines: list[str]) -> bool:
        printer = self._get_printer()
        content = "\n".join(lines)

        if printer is None:
            # Modo simulado (desarrollo sin impresora)
            logger.info("[Printer MOCK] ─────────────────")
            for line in lines:
                logger.info(f"[Printer MOCK] {line}")
            logger.info("[Printer MOCK] ─────────────────")
            return True

        try:
            printer.set(align="left", font="a", bold=False, underline=0, width=1, height=1)
            printer.text(content)
            printer.cut()
            logger.info("[Printer] Ticket impreso correctamente.")
            return True
        except Exception as exc:
            logger.error(f"[Printer] Error al imprimir: {exc}")
            self._printer = None  # Reset para reintentar en el próximo ciclo
            return False


# Singleton global
printer_service = PrinterService()
