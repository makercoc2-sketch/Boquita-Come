"""Crea todas las tablas directamente con SQLAlchemy (sin Alembic)."""
import asyncio
from app.db.base import engine, Base
from app.db.init_models import *  # noqa – importa todos los modelos

async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[OK] Tablas creadas exitosamente en SQLite.")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
