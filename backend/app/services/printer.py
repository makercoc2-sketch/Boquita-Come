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
    logger.warning("[Printer] python-escpos no instalado.")

try:
    import win32print
    WIN32PRINT_AVAILABLE = True
except ImportError:
    WIN32PRINT_AVAILABLE = False
    logger.warning("[Printer] win32print no instalado.")


class PrinterService:
    """Servicio de impresión térmica ESC/POS vía Windows Spooler (Epson APD) o USB directo."""

    def __init__(self):
        self._printer = None

    def get_windows_printer_name(self) -> Optional[str]:
        """Detecta automáticamente la impresora térmica en la lista de impresoras de Windows."""
        if not WIN32PRINT_AVAILABLE:
            return None
        try:
            printers = [p[2] for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
            
            # 1. Si se configuró un nombre específico en settings
            if getattr(settings, "PRINTER_NAME", ""):
                for p in printers:
                    if settings.PRINTER_NAME.lower() in p.lower():
                        return p

            # 2. Autodetección de nombres habituales de Epson TM-T20II o tickets
            for p in printers:
                pl = p.lower()
                if any(k in pl for k in ["tm-t20", "t20ii", "t20", "epson", "receipt", "pos", "ticket", "termic", "termica"]):
                    return p
            return None
        except Exception as e:
            logger.warning(f"[Printer] Error listando impresoras de Windows: {e}")
            return None

    def _send_to_win32_printer(self, printer_name: str, lines: list[str]) -> bool:
        """Envía comandos ESC/POS en crudo (RAW) a la cola de impresión de Windows."""
        try:
            # Inicialización ESC/POS: ESC @
            init_cmd = b'\x1b@'
            # Texto codificado en CP850 para que acepte tildes y caracteres en español
            text = "\n".join(lines) + "\n\n\n\n"
            encoded_text = text.encode("cp850", errors="replace")
            # Corte de papel ESC/POS: GS V 66 0
            cut_cmd = b'\x1dV\x42\x00'
            # Apertura de cajón de dinero: ESC p 0 25 250
            drawer_cmd = b'\x1bp\x00\x19\xfa'

            raw_data = init_cmd + drawer_cmd + encoded_text + cut_cmd

            hPrinter = win32print.OpenPrinter(printer_name)
            try:
                hJob = win32print.StartDocPrinter(hPrinter, 1, ("Ticket Boquita Come POS", None, "RAW"))
                try:
                    win32print.StartPagePrinter(hPrinter)
                    win32print.WritePrinter(hPrinter, raw_data)
                    win32print.EndPagePrinter(hPrinter)
                finally:
                    win32print.EndDocPrinter(hPrinter)
            finally:
                win32print.ClosePrinter(hPrinter)

            logger.info(f"[Printer] Ticket impreso exitosamente via Windows Spooler en '{printer_name}'")
            return True
        except Exception as exc:
            logger.error(f"[Printer] Error enviando a Windows Spooler ('{printer_name}'): {exc}")
            return False

    def _get_printer(self):
        """Lazy-init de la conexión USB vía python-escpos."""
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
                logger.info("[Printer] Impresora USB conectada correctamente vía python-escpos.")
            except Exception as exc:
                logger.debug(f"[Printer] No se pudo abrir conexión USB directa python-escpos: {exc}")
                self._printer = None
        return self._printer

    def _format_ticket(self, ticket_data: dict) -> list[str]:
        """Genera el contenido del ticket de cocina."""
        lines = []
        is_delivery = ticket_data.get("is_delivery", False)
        deliv_info = ticket_data.get("delivery_info") or {}

        lines.append("================================")
        lines.append(f"  {settings.BUSINESS_NAME.upper()}")
        if is_delivery:
            lines.append("  *** PEDIDO DELIVERY ***")
            lines.append(f"  CLIENTE: {deliv_info.get('customer_name', 'Cliente')}")
            if deliv_info.get('customer_phone'):
                lines.append(f"  TEL:     {deliv_info.get('customer_phone')}")
            if deliv_info.get('customer_address'):
                lines.append(f"  DIR:     {deliv_info.get('customer_address')}")
        else:
            lines.append(f"  TICKET DE COCINA #{ticket_data.get('ticket_number', '?')}")
            lines.append(f"  MESA: {ticket_data.get('table_number', '?')}")

        if ticket_data.get("waiter_name"):
            lines.append(f"  ATENDIÓ: {ticket_data.get('waiter_name')}")
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
        is_delivery = billing_data.get("is_delivery", False)
        deliv_info = billing_data.get("delivery_info") or {}

        lines.append("================================")
        lines.append(f"  {billing_data.get('razon_social_emisor','')}")
        lines.append(f"  RUC: {billing_data.get('ruc_emisor','')}")
        lines.append(f"  {billing_data.get('direccion_emisor','')}")
        if billing_data.get('telefono_emisor'):
            lines.append(f"  Tel: {billing_data.get('telefono_emisor')}")
        lines.append("================================")
        tipo = "BOLETA" if billing_data.get("tipo_doc") == "03" else "FACTURA"
        lines.append(f"  {tipo} ELECTRÓNICA")
        lines.append(f"  {billing_data.get('serie','')}-{billing_data.get('correlativo','')}")
        lines.append(f"  Fecha: {billing_data.get('fecha_emision','')}")
        lines.append("--------------------------------")
        if is_delivery:
            lines.append("  MODO: DELIVERY")
            lines.append(f"  CLIENTE: {deliv_info.get('customer_name', 'Cliente')}")
            if deliv_info.get('customer_phone'):
                lines.append(f"  TEL:     {deliv_info.get('customer_phone')}")
            if deliv_info.get('customer_address'):
                lines.append(f"  DIR:     {deliv_info.get('customer_address')}")
        else:
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
        footer = billing_data.get('mensaje_pie') or "¡Gracias por su visita!"
        lines.append(f"  {footer}")
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
        # 1. Intentar a través de la cola de impresión de Windows (Epson APD / Win32 Spooler)
        win_printer = self.get_windows_printer_name()
        if win_printer:
            logger.info(f"[Printer] Usando impresora detectada en Windows: '{win_printer}'")
            if self._send_to_win32_printer(win_printer, lines):
                return True

        # 2. Intentar vía python-escpos USB directo
        printer = self._get_printer()
        if printer is not None:
            try:
                content = "\n".join(lines)
                printer.set(align="left", font="a", bold=False, underline=0, width=1, height=1)
                printer.text(content)
                printer.cut()
                logger.info("[Printer] Ticket impreso correctamente vía USB directo.")
                return True
            except Exception as exc:
                logger.error(f"[Printer] Error al imprimir vía USB: {exc}")
                self._printer = None

        # 3. Modo simulado si no hay impresora física lista
        logger.warning("[Printer] No se detectó impresora física lista. Ticket simulado en consola:")
        logger.info("[Printer MOCK] ─────────────────")
        for line in lines:
            logger.info(f"[Printer MOCK] {line}")
        logger.info("[Printer MOCK] ─────────────────")
        return False


# Singleton global
printer_service = PrinterService()
