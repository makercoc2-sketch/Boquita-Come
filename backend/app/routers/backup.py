"""
Router: Copias de Seguridad (Backup / Restore)

Permite exportar e importar la base de datos completa para roles de Sistemas y Administrador.
- GET  /backup/export      → Descarga el archivo de base de datos SQLite (.db)
- GET  /backup/export-json → Descarga un volcado de datos estructurado (.json)
- POST /backup/import      → Restaura la base de datos desde un archivo (.db o .json)
"""

import os
import shutil
import sqlite3
import json
import tempfile
from datetime import datetime, timezone
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, delete

from app.core.config import settings
from app.db.base import get_db, engine, Base
from app.models.user import User, RoleType
from app.models.category import ProductCategory
from app.models.product import Product, ModifierGroup, ModifierOption
from app.models.table import Table
from app.models.order import Order, OrderItem, KitchenTicket
from app.models.split_bill import SplitBill
from app.models.expense import Expense
from app.models.cream import Cream

router = APIRouter(prefix="/backup", tags=["Backup"])


def get_sqlite_db_path() -> str:
    db_url = settings.DATABASE_URL
    if "sqlite" in db_url:
        path = db_url.split("///")[-1]
        return os.path.abspath(path)
    return os.path.abspath("./boquita_come.db")


@router.get("/export")
async def export_database_file(
    role: str = Query("Sistemas", description="Rol del usuario solicitante"),
    db: AsyncSession = Depends(get_db)
):
    """Descarga una copia completa de la base de datos (.db)"""
    role_clean = role.strip().lower() if role else ""
    if role_clean not in ["sistemas", "administrador"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado. Solo usuarios con rol 'Sistemas' o 'Administrador' pueden exportar respaldos."
        )

    db_path = get_sqlite_db_path()
    if not os.path.exists(db_path):
        raise HTTPException(
            status_code=status.HTTP_444_NOT_FOUND if hasattr(status, 'HTTP_444_NOT_FOUND') else 404,
            detail="No se encontró el archivo de base de datos en el servidor."
        )

    # Crear una copia limpia del archivo SQLite en un directorio temporal para no bloquear lecturas/escrituras
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    temp_dir = tempfile.gettempdir()
    backup_filename = f"boquita_come_backup_{timestamp}.db"
    temp_backup_path = os.path.join(temp_dir, backup_filename)

    try:
        # Usar la API de backup nativa de sqlite3 para garantizar consistencia del WAL
        src_conn = sqlite3.connect(db_path)
        dest_conn = sqlite3.connect(temp_backup_path)
        src_conn.backup(dest_conn)
        dest_conn.close()
        src_conn.close()
    except Exception as err:
        # Fallback a copia directa de archivo si falla sqlite3 backup
        shutil.copy2(db_path, temp_backup_path)

    return FileResponse(
        path=temp_backup_path,
        filename=backup_filename,
        media_type="application/octet-stream"
    )


@router.get("/export-json")
async def export_database_json(
    role: str = Query("Sistemas", description="Rol del usuario solicitante"),
    db: AsyncSession = Depends(get_db)
):
    """Descarga un volcado estructurado en formato JSON con todas las tablas"""
    role_clean = role.strip().lower() if role else ""
    if role_clean not in ["sistemas", "administrador"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado. Solo usuarios con rol 'Sistemas' o 'Administrador' pueden exportar respaldos."
        )

    # Recopilar todos los datos
    users = (await db.execute(select(User))).scalars().all()
    categories = (await db.execute(select(ProductCategory))).scalars().all()
    products = (await db.execute(select(Product))).scalars().all()
    creams = (await db.execute(select(Cream))).scalars().all()
    tables = (await db.execute(select(Table))).scalars().all()
    orders = (await db.execute(select(Order))).scalars().all()
    order_items = (await db.execute(select(OrderItem))).scalars().all()
    tickets = (await db.execute(select(KitchenTicket))).scalars().all()
    expenses = (await db.execute(select(Expense))).scalars().all()
    split_bills = (await db.execute(select(SplitBill))).scalars().all()

    data = {
        "system": "Boquita Come POS",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "tables_count": {
            "users": len(users),
            "categories": len(categories),
            "products": len(products),
            "creams": len(creams),
            "tables": len(tables),
            "orders": len(orders),
            "expenses": len(expenses)
        },
        "users": [{"id": u.id, "name": u.name, "role": u.role.value if hasattr(u.role, 'value') else u.role, "pin": u.pin, "is_active": u.is_active} for u in users],
        "categories": [{"id": c.id, "name": c.name, "destination": c.destination, "sort_order": c.sort_order} for c in categories],
        "products": [{"id": p.id, "category_id": p.category_id, "name": p.name, "price": float(p.price), "is_available": p.is_available, "modifiers": p.modifiers} for p in products],
        "creams": [{"id": cr.id, "name": cr.name, "is_available": cr.is_available} for cr in creams],
        "tables": [{"id": t.id, "number": t.number, "name": t.name, "capacity": t.capacity, "status": t.status.value if hasattr(t.status, 'value') else t.status} for t in tables],
        "orders": [{"id": o.id, "table_id": o.table_id, "user_id": o.user_id, "status": o.status.value if hasattr(o.status, 'value') else o.status, "notes": o.notes, "extra": o.extra, "created_at": o.created_at.isoformat() if o.created_at else None} for o in orders],
        "order_items": [{"id": oi.id, "order_id": oi.order_id, "product_id": oi.product_id, "quantity": oi.quantity, "price_at_time": float(oi.price_at_time), "notes": oi.notes, "status": oi.status.value if hasattr(oi.status, 'value') else oi.status} for oi in order_items],
        "kitchen_tickets": [{"id": kt.id, "order_id": kt.order_id, "ticket_number": kt.ticket_number, "items_snapshot": kt.items_snapshot} for kt in tickets],
        "expenses": [{"id": e.id, "expense_type": e.expense_type.value if hasattr(e.expense_type, 'value') else e.expense_type, "description": e.description, "amount": float(e.amount), "expense_date": e.expense_date.isoformat() if e.expense_date else None} for e in expenses],
        "split_bills": [{"id": sb.id, "order_id": sb.order_id, "label": sb.label, "item_ids": sb.item_ids, "subtotal": float(sb.subtotal) if sb.subtotal else 0.0, "is_paid": sb.is_paid} for sb in split_bills]
    }

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"boquita_come_backup_{timestamp}.json"
    temp_dir = tempfile.gettempdir()
    temp_json_path = os.path.join(temp_dir, filename)

    with open(temp_json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return FileResponse(
        path=temp_json_path,
        filename=filename,
        media_type="application/json"
    )


@router.post("/import")
async def import_database(
    file: UploadFile = File(...),
    role: str = Query("Sistemas", description="Rol del usuario solicitante"),
    db: AsyncSession = Depends(get_db)
):
    """Importa y restaura la base de datos desde un archivo (.db o .json)"""
    role_clean = role.strip().lower() if role else ""
    if role_clean not in ["sistemas", "administrador"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado. Solo usuarios con rol 'Sistemas' o 'Administrador' pueden importar respaldos."
        )

    if not file.filename:
        raise HTTPException(status_code=400, detail="No se proporcionó ningún archivo.")

    filename_lower = file.filename.lower()
    temp_dir = tempfile.gettempdir()
    uploaded_temp_path = os.path.join(temp_dir, f"upload_{file.filename}")

    # Guardar archivo subido temporalmente
    with open(uploaded_temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    db_path = get_sqlite_db_path()

    # Caso A: Archivo .db (Base de Datos SQLite Binaria)
    if filename_lower.endswith(".db") or filename_lower.endswith(".sqlite"):
        try:
            # Validar integridad SQLite
            check_conn = sqlite3.connect(uploaded_temp_path)
            cursor = check_conn.cursor()
            cursor.execute("SELECT count(*) FROM sqlite_master WHERE type='table';")
            table_count = cursor.fetchone()[0]
            check_conn.close()

            if table_count == 0:
                raise HTTPException(status_code=400, detail="El archivo .db no contiene tablas válidas.")

            # Cerrar la sesión actual SQLAlchemy y disponer el engine
            await db.rollback()
            await db.close()
            await engine.dispose()

            # Reemplazar el archivo de base de datos del sistema
            shutil.copy2(uploaded_temp_path, db_path)

            # Volver a verificar/crear metadata
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)

            return {
                "status": "success",
                "message": f"Base de datos SQLite restaurada con éxito desde {file.filename}. Tablas detectadas: {table_count}."
            }

        except Exception as e:
            if os.path.exists(uploaded_temp_path):
                os.remove(uploaded_temp_path)
            raise HTTPException(
                status_code=400,
                detail=f"Error al procesar el archivo .db: {str(e)}"
            )

    # Caso B: Archivo .json (Volcado Estructurado)
    elif filename_lower.endswith(".json"):
        try:
            with open(uploaded_temp_path, "r", encoding="utf-8") as f:
                content = json.load(f)

            if "tables_count" not in content or "users" not in content:
                raise HTTPException(status_code=400, detail="El archivo JSON no tiene la estructura de respaldo de Boquita Come.")

            # Limpiar datos existentes
            await db.execute(delete(SplitBill))
            await db.execute(delete(KitchenTicket))
            await db.execute(delete(OrderItem))
            await db.execute(delete(Order))
            await db.execute(delete(Expense))
            await db.execute(delete(Cream))
            await db.execute(delete(Product))
            await db.execute(delete(ProductCategory))
            await db.execute(delete(Table))
            await db.execute(delete(User))
            await db.flush()

            # Restaurar tablas principales
            for u in content.get("users", []):
                db.add(User(id=u["id"], name=u["name"], role=RoleType(u["role"]), pin=u["pin"], is_active=u.get("is_active", True)))

            for c in content.get("categories", []):
                db.add(ProductCategory(id=c["id"], name=c["name"], destination=c["destination"], sort_order=c["sort_order"]))

            for cr in content.get("creams", []):
                db.add(Cream(id=cr["id"], name=cr["name"], is_available=cr.get("is_available", True)))

            for t in content.get("tables", []):
                db.add(Table(id=t["id"], number=t["number"], name=t.get("name"), capacity=t.get("capacity", 4), status=t.get("status", "FREE")))

            await db.flush()

            for p in content.get("products", []):
                db.add(Product(id=p["id"], category_id=p["category_id"], name=p["name"], price=p["price"], is_available=p.get("is_available", True), modifiers=p.get("modifiers", [])))

            for e in content.get("expenses", []):
                exp_date = datetime.fromisoformat(e["expense_date"]) if e.get("expense_date") else datetime.now()
                db.add(Expense(id=e["id"], expense_type=e["expense_type"], description=e["description"], amount=e["amount"], expense_date=exp_date))

            await db.commit()

            return {
                "status": "success",
                "message": f"Respaldo JSON importado correctamente. Se restauraron {len(content.get('users', []))} usuarios, {len(content.get('products', []))} productos y {len(content.get('tables', []))} mesas."
            }

        except Exception as e:
            await db.rollback()
            raise HTTPException(
                status_code=400,
                detail=f"Error al importar archivo JSON: {str(e)}"
            )

    else:
        raise HTTPException(
            status_code=400,
            detail="Formato no soportado. Debes subir un archivo .db o .json de respaldo."
        )
