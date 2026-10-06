from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import joinedload
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta

from app.db.base import get_db
from app.models.expense import Expense, ExpenseType
from app.models.order import Order, OrderStatus
from app.models.user import User

router = APIRouter(prefix="/finances", tags=["Finances"])

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

class OrderIncomeOut(BaseModel):
    id: int
    table_id: int
    total: float
    updated_at: datetime
    
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

    from app.routers.dashboard import normalize_payment_method

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
