"""
Router – Gestión de Carta (Categorías + Productos + Modificadores)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field
from typing import Optional, List
from decimal import Decimal

from app.db.base import get_db
from app.models.category import ProductCategory
from app.models.product import Product, ModifierGroup, ModifierOption

router = APIRouter(prefix="/menu", tags=["Menu / Carta"])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Auto Migration Helper
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async def _ensure_suggestions_column(db: AsyncSession):
    try:
        await db.execute(text("ALTER TABLE products ADD COLUMN suggestions TEXT;"))
        await db.commit()
    except Exception:
        pass


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Schemas
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ── Categorías ────────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str = Field(..., max_length=100)
    color: str = Field(default="#6366F1", max_length=7)
    sort_order: int = 0
    destination: str = Field("kitchen", max_length=20)


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    color: Optional[str] = Field(None, max_length=7)
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    destination: Optional[str] = Field(None, max_length=20)


class CategoryOut(BaseModel):
    id: int
    name: str
    color: str
    sort_order: int
    is_active: bool
    destination: str

    class Config:
        from_attributes = True


# ── Modificadores ─────────────────────────────────────────────────────────────

class ModifierOptionIn(BaseModel):
    name: str = Field(..., max_length=100)
    price_delta: Decimal = Decimal("0.00")
    is_default: bool = False


class ModifierOptionOut(BaseModel):
    id: int
    name: str
    price_delta: Decimal
    is_default: bool

    class Config:
        from_attributes = True


class ModifierGroupIn(BaseModel):
    name: str = Field(..., max_length=100)
    required: bool = False
    multi_select: bool = False
    sort_order: int = 0
    options: List[ModifierOptionIn] = []


class ModifierGroupOut(BaseModel):
    id: int
    name: str
    required: bool
    multi_select: bool
    sort_order: int
    options: List[ModifierOptionOut] = []

    class Config:
        from_attributes = True


# ── Productos ─────────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    category_id: Optional[int] = None
    name: str = Field(..., max_length=150)
    description: Optional[str] = None
    suggestions: Optional[str] = None
    price: Decimal
    image_url: Optional[str] = None
    is_available: bool = True
    modifier_groups: List[ModifierGroupIn] = []


class ProductUpdate(BaseModel):
    category_id: Optional[int] = None
    name: Optional[str] = Field(None, max_length=150)
    description: Optional[str] = None
    suggestions: Optional[str] = None
    price: Optional[Decimal] = None
    image_url: Optional[str] = None
    is_available: Optional[bool] = None


class ProductOut(BaseModel):
    id: int
    category_id: Optional[int]
    name: str
    description: Optional[str]
    suggestions: Optional[str] = None
    price: Decimal
    image_url: Optional[str]
    is_available: bool
    modifier_groups: List[ModifierGroupOut] = []

    class Config:
        from_attributes = True


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  CATEGORÍAS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/categories", response_model=List[CategoryOut])
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ProductCategory).order_by(ProductCategory.sort_order, ProductCategory.name)
    )
    return result.scalars().all()


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(body: CategoryCreate, db: AsyncSession = Depends(get_db)):
    cat = ProductCategory(**body.model_dump())
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    return cat


@router.patch("/categories/{cat_id}", response_model=CategoryOut)
async def update_category(cat_id: int, body: CategoryUpdate, db: AsyncSession = Depends(get_db)):
    cat = await db.get(ProductCategory, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cat, field, value)
    await db.flush()
    await db.refresh(cat)
    return cat


@router.delete("/categories/{cat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(cat_id: int, db: AsyncSession = Depends(get_db)):
    cat = await db.get(ProductCategory, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    await db.delete(cat)
    await db.flush()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PRODUCTOS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/products", response_model=List[ProductOut])
async def list_products(
    category_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    await _ensure_suggestions_column(db)
    stmt = select(Product).options(
        selectinload(Product.modifier_groups).selectinload(ModifierGroup.options)
    )
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
    stmt = stmt.order_by(Product.name)
    result = await db.execute(stmt)
    return result.scalars().unique().all()


@router.get("/products/{product_id}", response_model=ProductOut)
async def get_product(product_id: int, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Product)
        .options(selectinload(Product.modifier_groups).selectinload(ModifierGroup.options))
        .where(Product.id == product_id)
    )
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return product


@router.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(body: ProductCreate, db: AsyncSession = Depends(get_db)):
    data = body.model_dump(exclude={"modifier_groups"})
    product = Product(**data)
    db.add(product)
    await db.flush()

    # Crear grupos de modificadores y sus opciones
    for mg_data in body.modifier_groups:
        mg = ModifierGroup(
            product_id=product.id,
            name=mg_data.name,
            required=mg_data.required,
            multi_select=mg_data.multi_select,
            sort_order=mg_data.sort_order,
        )
        db.add(mg)
        await db.flush()
        for opt_data in mg_data.options:
            opt = ModifierOption(
                group_id=mg.id,
                name=opt_data.name,
                price_delta=opt_data.price_delta,
                is_default=opt_data.is_default,
            )
            db.add(opt)

    await db.flush()
    # Recargar con relaciones
    stmt = (
        select(Product)
        .options(selectinload(Product.modifier_groups).selectinload(ModifierGroup.options))
        .where(Product.id == product.id)
    )
    result = await db.execute(stmt)
    return result.scalar_one()


@router.patch("/products/{product_id}", response_model=ProductOut)
async def update_product(product_id: int, body: ProductUpdate, db: AsyncSession = Depends(get_db)):
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    await db.flush()
    # Recargar con relaciones
    stmt = (
        select(Product)
        .options(selectinload(Product.modifier_groups).selectinload(ModifierGroup.options))
        .where(Product.id == product_id)
    )
    result = await db.execute(stmt)
    return result.scalar_one()


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(product_id: int, db: AsyncSession = Depends(get_db)):
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    await db.delete(product)
    await db.flush()


@router.patch("/products/{product_id}/toggle-availability", response_model=ProductOut)
async def toggle_availability(product_id: int, db: AsyncSession = Depends(get_db)):
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    product.is_available = not product.is_available
    await db.flush()
    stmt = (
        select(Product)
        .options(selectinload(Product.modifier_groups).selectinload(ModifierGroup.options))
        .where(Product.id == product_id)
    )
    result = await db.execute(stmt)
    return result.scalar_one()
