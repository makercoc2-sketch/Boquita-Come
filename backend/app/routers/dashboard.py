from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import joinedload
from typing import Dict, List, Any
from datetime import datetime, timezone
import os
from pydantic import BaseModel
try:
    import google.generativeai as genai
except ImportError:
    genai = None

from app.core.config import settings
from app.db.base import get_db
from app.models.order import Order, OrderStatus, OrderItem
from app.models.product import Product
from app.models.table import Table, TableStatus
from app.models.category import ProductCategory
from app.models.user import User
from app.models.expense import Expense
from app.routers.finances import get_date_range

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

class ChatRequest(BaseModel):
    message: str


def normalize_payment_method(method_raw: Any) -> str:
    if not method_raw:
        return "Efectivo"
    m = str(method_raw).strip().lower()
    if "+" in m or "mixto" in m:
        return "Pago Mixto"
    if "yape" in m or "plin" in m or "billetera" in m:
        return "Yape / Plin"
    if "pos" in m or "tarjeta" in m or "card" in m or "visa" in m or "master" in m:
        return "POS / Tarjeta"
    if "efectivo" in m or "cash" in m:
        return "Efectivo"
    if "transferencia" in m or "banco" in m:
        return "Transferencia"
    return str(method_raw).strip().capitalize()


@router.get("/stats", response_model=Dict[str, Any])
async def get_dashboard_stats(
    date_filter: str = Query("month", description="today, week, month, all"),
    db: AsyncSession = Depends(get_db)
):
    start_date, end_date = get_date_range(date_filter)
    
    # Cargamos todas las órdenes pagadas con sus ítems, producto de los ítems y usuario (mozo)
    query_orders = select(Order).options(
        joinedload(Order.items).joinedload(OrderItem.product),
        joinedload(Order.user)
    ).where(
        and_(
            Order.status == OrderStatus.PAID,
            Order.updated_at >= start_date,
            Order.updated_at <= end_date
        )
    )
    result_orders = await db.execute(query_orders)
    orders = result_orders.scalars().unique().all()

    total_revenue = 0.0
    total_orders = len(orders)
    
    sales_by_day = {}
    waiter_stats = {}
    product_stats = {}
    recent_notes = set()

    payment_methods = {
        "Efectivo": 0.0,
        "Yape / Plin": 0.0,
        "POS / Tarjeta": 0.0
    }

    local_tz = datetime.now().astimezone().tzinfo

    for o in orders:
        order_total = sum(float(i.price_at_time * i.quantity) for i in o.items)
        total_revenue += order_total

        # Método de pago (cuadre de caja)
        extra = o.extra if isinstance(o.extra, dict) else {}
        order_payments = extra.get("payments")
        if order_payments and isinstance(order_payments, list) and len(order_payments) > 0:
            for p in order_payments:
                p_method = p.get("method") or "Efectivo"
                p_norm = normalize_payment_method(p_method)
                p_amt = float(p.get("amount", 0.0))
                payment_methods[p_norm] = payment_methods.get(p_norm, 0.0) + p_amt
        else:
            pm_raw = extra.get("payment_method")
            pm_norm = normalize_payment_method(pm_raw)
            payment_methods[pm_norm] = payment_methods.get(pm_norm, 0.0) + order_total

        # Por Día
        aware_dt = o.updated_at if o.updated_at.tzinfo else o.updated_at.replace(tzinfo=local_tz)
        day_str = aware_dt.astimezone(local_tz).strftime("%Y-%m-%d")
        sales_by_day[day_str] = sales_by_day.get(day_str, 0.0) + order_total

        # Por Mozo
        waiter_name = o.user.name if o.user else "Sin Asignar"
        if waiter_name not in waiter_stats:
            waiter_stats[waiter_name] = {"revenue": 0.0, "orders": 0}
        waiter_stats[waiter_name]["revenue"] += order_total
        waiter_stats[waiter_name]["orders"] += 1

        # Por Producto
        for item in o.items:
            prod_name = item.product.name if item.product else f"ID {item.product_id}"
            if item.notes:
                nc = item.notes.strip().lower()
                if nc:
                    recent_notes.add(f"{prod_name}: {nc}")
                    
            if prod_name not in product_stats:
                product_stats[prod_name] = {"qty": 0, "revenue": 0.0}
            product_stats[prod_name]["qty"] += item.quantity
            product_stats[prod_name]["revenue"] += float(item.price_at_time * item.quantity)

    # Ordenar y limitar listas de Top
    top_waiters = sorted(
        [{"name": k, **v} for k, v in waiter_stats.items()],
        key=lambda x: x["revenue"], reverse=True
    )
    
    top_products_qty = sorted(
        [{"name": k, **v} for k, v in product_stats.items()],
        key=lambda x: x["qty"], reverse=True
    )[:10]

    top_products_revenue = sorted(
        [{"name": k, **v} for k, v in product_stats.items()],
        key=lambda x: x["revenue"], reverse=True
    )[:10]

    daily_sales = sorted([{"date": k, "revenue": v} for k, v in sales_by_day.items()], key=lambda x: x["date"])

    return {
        "summary": {
            "total_revenue": total_revenue,
            "total_orders": total_orders,
            "avg_ticket": total_revenue / total_orders if total_orders > 0 else 0,
            "payment_methods": payment_methods
        },
        "daily_sales": daily_sales,
        "top_waiters": top_waiters,
        "top_products_qty": top_products_qty,
        "top_products_revenue": top_products_revenue,
        "recent_notes": list(recent_notes)
    }


@router.post("/chat")
async def ask_dashboard_bot(req: ChatRequest, db: AsyncSession = Depends(get_db)):
    gemini_key = settings.GEMINI_API_KEY
    if not gemini_key:
        return {"reply": "❌ Aún no has configurado la inteligencia artificial. Por favor, consigue un API Key gratuita en aistudio.google.com y pégala en tu archivo `.env` del servidor en la variable `GEMINI_API_KEY`."}

    try:
        stats_today = await get_dashboard_stats("today", db)
        stats_month = await get_dashboard_stats("month", db)
        context = ""

        # ── 1. Estado actual de MESAS ──────────────────────────────────────
        all_tables = (await db.execute(select(Table).order_by(Table.number))).scalars().all()
        status_counts = {}
        for t in all_tables:
            status_counts[t.status.value if hasattr(t.status, 'value') else t.status] = \
                status_counts.get(t.status.value if hasattr(t.status, 'value') else t.status, 0) + 1

        context += "--- ESTADO ACTUAL DE MESAS ---\n"
        context += f"Total mesas: {len(all_tables)}\n"
        for s, c in status_counts.items():
            label = {"FREE": "Libres", "OCCUPIED": "Ocupadas", "RESERVED": "Reservadas", "TOPAY": "Por Pagar"}.get(s, s)
            context += f" - {label}: {c}\n"

        # Detalle de mesas con merge info
        merged_groups = {}
        for t in all_tables:
            if t.merged_into:
                merged_groups.setdefault(t.merged_into, []).append(t.number)
        if merged_groups:
            context += "Mesas unidas actualmente:\n"
            for primary_id, sec_numbers in merged_groups.items():
                primary = next((t for t in all_tables if t.id == primary_id), None)
                if primary:
                    context += f" - Mesa {primary.number} (principal) + Mesas {', '.join(str(n) for n in sec_numbers)} (secundarias)\n"

        # ── 2. Menú / Carta completa ───────────────────────────────────────
        categories = (await db.execute(
            select(ProductCategory).options(joinedload(ProductCategory.products)).order_by(ProductCategory.sort_order)
        )).scalars().unique().all()

        context += "\n--- CARTA / MENÚ COMPLETO ---\n"
        for cat in categories:
            available = [p for p in cat.products if p.is_available]
            unavailable = [p for p in cat.products if not p.is_available]
            context += f"\nCategoría: {cat.name} (destino: {cat.destination}) — {len(available)} disponible(s), {len(unavailable)} agotado(s)\n"
            for p in available:
                context += f"  ✅ {p.name} — S/ {p.price}\n"
            for p in unavailable:
                context += f"  ❌ {p.name} (AGOTADO) — S/ {p.price}\n"

        # ── 3. Órdenes activas (OPEN + SENT) ──────────────────────────────
        query_active = select(Order).options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.table),
            joinedload(Order.user)
        ).where(Order.status.in_([OrderStatus.OPEN, OrderStatus.SENT]))
        active_orders = (await db.execute(query_active)).scalars().unique().all()

        context += "\n--- MESAS ACTIVAS AHORA MISMO (PEDIDOS SIN PAGAR / EN COCINA) ---\n"
        if not active_orders:
            context += "Actualmente no hay mesas con pedidos activos.\n"
        else:
            for o in active_orders:
                t_label = f"Mesa {o.table.number}" if o.table else "Mesa rápida"
                mozo = o.user.name if o.user else "Sin asignar"
                order_status = o.status.value if hasattr(o.status, 'value') else o.status
                order_total = sum(float(i.price_at_time) * i.quantity for i in o.items)
                context += f"\n{t_label} (Orden #{o.id}, estado: {order_status}, mozo: {mozo}, total parcial: S/ {order_total:.2f}):\n"
                for i in o.items:
                    p_name = i.product.name if i.product else f"Producto {i.product_id}"
                    status_str = i.status.value if hasattr(i.status, 'value') else str(i.status)
                    note_str = f" [NOTA: {i.notes}]" if i.notes else ""
                    context += f"  - {i.quantity}x {p_name} (S/ {float(i.price_at_time):.2f} c/u) — {status_str}{note_str}\n"

        # ── 4. Personal / Usuarios ─────────────────────────────────────────
        users = (await db.execute(select(User).order_by(User.name))).scalars().all()
        context += "\n--- PERSONAL DEL RESTAURANTE ---\n"
        for u in users:
            estado = "Activo" if u.is_active else "Inactivo"
            role = u.role.value if hasattr(u.role, 'value') else u.role
            context += f" - {u.name} ({role}) — {estado}\n"

        # ── 5. Ventas y Cuadre de Caja de HOY ──────────────────────────────
        context += "\n--- VENTAS Y CUADRE DE CAJA DE HOY (PAGADAS) ---\n"
        context += f"Ingresos totales hoy: S/ {stats_today['summary']['total_revenue']:.2f}\n"
        context += f"Órdenes cerradas hoy: {stats_today['summary']['total_orders']}\n"
        context += f"Ticket promedio hoy: S/ {stats_today['summary']['avg_ticket']:.2f}\n"
        pm_today = stats_today['summary'].get('payment_methods', {})
        context += "Cuadre de caja por métodos de pago HOY:\n"
        for pm, amt in pm_today.items():
            context += f" - {pm}: S/ {amt:.2f}\n"

        # ── 6. Ventas y Cuadre de Caja ACUMULADO DEL MES ───────────────────
        context += f"\n--- VENTAS Y CUADRE DE CAJA ACUMULADO DE ESTE MES (PAGADAS) ---\n"
        context += f"Ingresos totales este mes: S/ {stats_month['summary']['total_revenue']:.2f}\n"
        context += f"Órdenes cerradas este mes: {stats_month['summary']['total_orders']}\n"
        context += f"Ticket promedio este mes: S/ {stats_month['summary']['avg_ticket']:.2f}\n"
        
        pm_summary = stats_month['summary'].get('payment_methods', {})
        if pm_summary:
            context += "Cuadre de caja por métodos de pago ESTE MES:\n"
            for pm, amt in pm_summary.items():
                context += f" - {pm}: S/ {amt:.2f}\n"

        context += "\nTop Mozos del mes:\n"
        for w in stats_month['top_waiters'][:5]:
            context += f" - {w['name']}: S/ {w['revenue']:.2f} ({w['orders']} órdenes)\n"
        context += "\nTop Productos del mes (por cantidad):\n"
        for p in stats_month['top_products_qty'][:15]:
            context += f" - {p['name']}: {p['qty']} uds. (S/ {p['revenue']:.2f})\n"

        if stats_month.get('recent_notes'):
            context += "\nNotas frecuentes de clientes este mes:\n"
            for note in stats_month['recent_notes'][:25]:
                context += f" - {note}\n"

        # ── 7. Gastos del mes ──────────────────────────────────────────────
        start_date, end_date = get_date_range("month")
        expenses = (await db.execute(
            select(Expense).where(
                and_(Expense.expense_date >= start_date, Expense.expense_date <= end_date)
            ).order_by(Expense.expense_date.desc())
        )).scalars().all()
        if expenses:
            total_expenses = sum(float(e.amount) for e in expenses)
            context += f"\n--- GASTOS DEL MES ---\n"
            context += f"Total gastos: S/ {total_expenses:.2f}\n"
            for e in expenses[:20]:
                tipo = e.expense_type.value if hasattr(e.expense_type, 'value') else e.expense_type
                context += f" - {e.description}: S/ {float(e.amount):.2f} ({tipo})\n"

    except Exception as e:
        context = f"No se pudo recuperar la información de la base de datos: {str(e)}"

    prompt = f"""
Eres un asistente experto y amigable para los administradores del restaurante "Boquita Come".
Tienes acceso a TODA la información en tiempo real del sistema POS:
- Estado de mesas (libres, ocupadas, reservadas, por pagar, mesas unidas)
- Carta completa con categorías, productos, precios y disponibilidad
- Pedidos activos en cocina/bar con detalle de ítems y estados
- Personal del restaurante con sus roles
- Ventas y cuadre de caja por métodos de pago (Efectivo, Yape/Plin, POS) TANTO DE HOY COMO DEL MES COMPLETO
- Gastos registrados del mes

Tienes acceso a los datos de ventas y cuadre de caja (Efectivo, Yape/Plin, POS) tanto DEL DÍA DE HOY como DEL MES COMPLETO.
Si el usuario pregunta por "hoy", responde con los datos de HOY. Si pregunta por "el mes" o "este mes", responde con los datos del MES.

Responde con datos concretos y numéricos cuando los tengas. Sé directo y profesional.

Datos del Sistema:
{context}

Pregunta del Administrador: {req.message}

Respuesta clara, concisa y profesional:
"""
    if not genai:
        return {"reply": "La librería google-generativeai no está instalada en el servidor."}

    try:
        genai.configure(api_key=gemini_key)
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content(prompt)
        return {"reply": response.text}
    except Exception as e:
        error_msg = str(e)
        if "Quota exceeded" in error_msg or "limit: 0" in error_msg or "429" in error_msg:
            return {"reply": "⚠️ El servidor de inteligencia artificial rechazó la solicitud porque tu API Key tiene un límite de cuota agotado (Límite: 0 peticiones gratuitas). Necesitas habilitar la facturación en Google Cloud para este proyecto o crear una nueva API Key en una cuenta estándar de aistudio.google.com.\n\nError técnico: 429 Quota Exceeded."}
        return {"reply": f"Error del servidor de IA (Modelo): {error_msg}"}
