from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, delete, update
from sqlalchemy.orm import joinedload
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone

from app.db.base import get_db
from app.models.expense import Expense, ExpenseType
from app.models.order import Order, OrderStatus, OrderItem, KitchenTicket
from app.models.split_bill import SplitBill
from app.models.table import Table, TableStatus
from app.models.user import User

router = APIRouter(prefix="/finances", tags=["Finances"])

def normalize_payment_method(method_raw: Any) -> str:
    if not method_raw:
        return "Efectivo"
    m = str(method_raw).strip().lower()
    if "yape" in m or "plin" in m or "billetera" in m:
        return "Yape / Plin"
    if "pos" in m or "tarjeta" in m or "card" in m or "visa" in m or "master" in m:
        return "POS / Tarjeta"
    if "efectivo" in m or "cash" in m:
        return "Efectivo"
    if "transferencia" in m or "banco" in m:
        return "Transferencia"
    return str(method_raw).strip().capitalize()

# ─── Schemas ──────────────────────────────────────────────────────────────────

class ExpenseCreate(BaseModel):
    expense_type: ExpenseType
    description: str
    amount: float
    expense_date: Optional[datetime] = None
    created_by_id: Optional[int] = None

class ExpenseOut(BaseModel):
    id: int
    expense_type: str
    description: str
    amount: float
    expense_date: datetime
    created_at: datetime
    created_by_id: Optional[int]
    
    model_config = {"from_attributes": True}

class FinanceSummary(BaseModel):
    total_incomes: float
    total_expenses: float
    net_profit: float
    # for charts
    income_by_day: dict
    expense_by_day: dict
    payment_methods: Optional[dict] = None

class OrderItemSummary(BaseModel):
    name: str
    quantity: int
    price: float
    subtotal: float

class PaidOrderOut(BaseModel):
    id: int
    table_id: int
    table_number: Optional[int] = None
    table_name: Optional[str] = None
    is_delivery: bool = False
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    waiter_name: Optional[str] = None
    payment_method: str = "Efectivo"
    total: float
    items_count: int
    items_summary: List[OrderItemSummary] = []
    paid_at: datetime
    
# ─── Helper para obtener Rango de Fechas ──────────────────────────────────────
# date_filter = "today", "week", "month", "all"

def get_date_range(filter: str):
    from datetime import timezone
    now_local = datetime.now()
    if filter == "today":
        start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now_local.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif filter == "week":
        start = (now_local - timedelta(days=now_local.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        end = (start + timedelta(days=6)).replace(hour=23, minute=59, second=59, microsecond=999999)
    elif filter == "month":
        start = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = now_local.replace(hour=23, minute=59, second=59, microsecond=999999)
    else:
        start = datetime(2000, 1, 1)
        end = datetime(2100, 1, 1)
        
    local_tz = now_local.astimezone().tzinfo
    start_utc = start.replace(tzinfo=local_tz).astimezone(timezone.utc)
    # Give end_utc some leeway for SQLite or extreme boundaries
    end_utc = end.replace(tzinfo=local_tz).astimezone(timezone.utc)
    
    return start_utc, end_utc

# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=FinanceSummary)
async def get_finances_summary(
    date_filter: str = Query("month", description="today, week, month, all"),
    db: AsyncSession = Depends(get_db)
):
    start_date, end_date = get_date_range(date_filter)
    
    # 1. Ingresos
    query_orders = select(Order).options(joinedload(Order.items)).where(
        and_(
            Order.status == OrderStatus.PAID,
            Order.updated_at >= start_date,
            Order.updated_at <= end_date
        )
    )
    result_orders = await db.execute(query_orders)
    orders = result_orders.scalars().unique().all()
    
    total_incomes = 0.0
    from typing import Dict
    income_by_day: Dict[str, float] = {}
    payment_methods: Dict[str, float] = {
        "Efectivo": 0.0,
        "Yape / Plin": 0.0,
        "POS / Tarjeta": 0.0
    }
    
    from datetime import datetime
    now_local = datetime.now()
    local_tz = now_local.astimezone().tzinfo

    for o in orders:
        order_total = sum(float(i.price_at_time * i.quantity) for i in o.items)
        total_incomes += order_total

        # Método de pago
        pm_raw = o.extra.get("payment_method") if isinstance(o.extra, dict) else None
        pm_norm = normalize_payment_method(pm_raw)
        payment_methods[pm_norm] = payment_methods.get(pm_norm, 0.0) + order_total

        # Adaptar la fecha grabada a local para que las barras agrupen correctamente
        aware_dt = o.updated_at if o.updated_at.tzinfo else o.updated_at.replace(tzinfo=local_tz)
        day_str = aware_dt.astimezone(local_tz).strftime("%Y-%m-%d")
        income_by_day[day_str] = income_by_day.get(day_str, 0.0) + order_total

    # 2. Egresos
    query_expenses = select(Expense).where(
        and_(
            Expense.expense_date >= start_date,
            Expense.expense_date <= end_date
        )
    )
    result_expenses = await db.execute(query_expenses)
    expenses = result_expenses.scalars().all()
    
    total_expenses = 0.0
    expense_by_day: Dict[str, float] = {}
    
    for e in expenses:
        amt = float(e.amount)
        total_expenses += amt
        aware_dte = e.expense_date if e.expense_date.tzinfo else e.expense_date.replace(tzinfo=local_tz)
        day_str = aware_dte.astimezone(local_tz).strftime("%Y-%m-%d")
        expense_by_day[day_str] = expense_by_day.get(day_str, 0.0) + amt

    net_profit = total_incomes - total_expenses
    
    return FinanceSummary(
        total_incomes=total_incomes,
        total_expenses=total_expenses,
        net_profit=net_profit,
        income_by_day=income_by_day,
        expense_by_day=expense_by_day,
        payment_methods=payment_methods
    )

@router.get("/expenses", response_model=List[ExpenseOut])
async def list_expenses(
    date_filter: str = Query("month", description="today, week, month, all"),
    db: AsyncSession = Depends(get_db)
):
    start_date, end_date = get_date_range(date_filter)
    query = select(Expense).where(
        and_(
            Expense.expense_date >= start_date,
            Expense.expense_date <= end_date
        )
    ).order_by(Expense.expense_date.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/expenses", response_model=ExpenseOut)
async def create_expense(payload: ExpenseCreate, db: AsyncSession = Depends(get_db)):
    if not payload.expense_date:
        payload.expense_date = datetime.now()
        
    expense = Expense(
        expense_type=payload.expense_type,
        description=payload.description,
        amount=payload.amount,
        expense_date=payload.expense_date,
        created_by_id=payload.created_by_id
    )
    db.add(expense)
    await db.commit()
    await db.refresh(expense)
    return expense

@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(expense_id: int, db: AsyncSession = Depends(get_db)):
    expense = await db.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Gasto no encontrado.")
    await db.delete(expense)
    await db.commit()


# ─── Ventas Cobradas (Mesas / Delivery Pagadas) ───────────────────────────────

@router.get("/orders", response_model=List[PaidOrderOut])
async def list_paid_orders(
    date_filter: str = Query("month", description="today, week, month, all"),
    db: AsyncSession = Depends(get_db)
):
    """Retorna el listado de órdenes cobradas (PAID) para el rango de fechas seleccionado."""
    start_date, end_date = get_date_range(date_filter)
    
    query = (
        select(Order)
        .options(
            joinedload(Order.items).joinedload(OrderItem.product),
            joinedload(Order.table),
            joinedload(Order.user),
        )
        .where(
            and_(
                Order.status == OrderStatus.PAID,
                Order.updated_at >= start_date,
                Order.updated_at <= end_date
            )
        )
        .order_by(Order.updated_at.desc())
    )
    result = await db.execute(query)
    orders = result.scalars().unique().all()
    
    output = []
    for o in orders:
        extra = o.extra if isinstance(o.extra, dict) else {}
        is_delivery = extra.get("order_type") == "delivery" or (o.table and o.table.number == 0)
        customer_name = extra.get("customer_name") if is_delivery else None
        customer_phone = extra.get("customer_phone") if is_delivery else None
        pm_raw = extra.get("payment_method")
        pm_norm = normalize_payment_method(pm_raw)
        
        items_summary = []
        total = 0.0
        total_items_qty = 0
        for it in (o.items or []):
            qty = it.quantity or 1
            price = float(it.price_at_time or 0)
            sub = price * qty
            total += sub
            total_items_qty += qty
            p_name = it.product.name if it.product else f"Producto #{it.product_id}"
            items_summary.append(OrderItemSummary(
                name=p_name,
                quantity=qty,
                price=price,
                subtotal=round(sub, 2)
            ))
            
        output.append(PaidOrderOut(
            id=o.id,
            table_id=o.table_id,
            table_number=o.table.number if o.table else None,
            table_name=o.table.name if o.table else None,
            is_delivery=is_delivery,
            customer_name=customer_name,
            customer_phone=customer_phone,
            waiter_name=o.user.name if o.user else None,
            payment_method=pm_norm,
            total=round(total, 2),
            items_count=total_items_qty,
            items_summary=items_summary,
            paid_at=o.updated_at
        ))
    return output


@router.delete("/orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_paid_order(order_id: int, db: AsyncSession = Depends(get_db)):
    """Elimina permanentemente una orden cobrada (anulación/limpieza de venta individual)."""
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada.")
    
    # Eliminar explícitamente dependencias por seguridad
    await db.execute(delete(SplitBill).where(SplitBill.order_id == order_id))
    await db.execute(delete(KitchenTicket).where(KitchenTicket.order_id == order_id))
    await db.execute(delete(OrderItem).where(OrderItem.order_id == order_id))
    await db.delete(order)
    await db.commit()


@router.post("/reset-test-data")
async def reset_test_data(
    include_expenses: bool = Query(False, description="Si es True, también elimina los gastos registrados"),
    db: AsyncSession = Depends(get_db)
):
    """
    Elimina todas las órdenes, consumos y tickets de prueba acumulados.
    Deja el sistema en S/ 0.00 para iniciar operaciones reales.
    NO elimina productos, categorías, usuarios, mesas ni configuraciones.
    """
    # 1. Eliminar dependencias de orders
    await db.execute(delete(SplitBill))
    await db.execute(delete(KitchenTicket))
    await db.execute(delete(OrderItem))
    
    # 2. Eliminar todas las órdenes
    orders_del = await db.execute(delete(Order))
    deleted_orders_count = orders_del.rowcount or 0

    # 3. Liberar todas las mesas físicas
    await db.execute(
        update(Table)
        .values(status=TableStatus.FREE, merged_into=None)
    )

    # 4. Si se solicitó, limpiar también gastos
    deleted_expenses_count = 0
    if include_expenses:
        exp_del = await db.execute(delete(Expense))
        deleted_expenses_count = exp_del.rowcount or 0

    await db.commit()

    return {
        "status": "ok",
        "message": "Datos de prueba eliminados exitosamente.",
        "deleted_orders": deleted_orders_count,
        "deleted_expenses": deleted_expenses_count,
    }

