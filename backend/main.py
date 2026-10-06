from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.core.config import settings
from app.db.base import engine, Base
from app.db import init_models  # noqa: F401 – registra todos los modelos en Base

from app.routers import tables, orders, billing, printing, menu, auth, finances, dashboard, creams, backup, settings as settings_router
from app.ws.kitchen import router as ws_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
)
logger = logging.getLogger(__name__)


# ─── Lifespan (startup / shutdown) ──────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Boquita Come POS – Iniciando servidor...")
    logger.info(f"   DB: {settings.DATABASE_URL.split('@')[-1]}")
    logger.info(f"   CORS origins: {settings.CORS_ORIGINS}")
    
    # Asegurar que todas las tablas existan en SQLite al iniciar
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("✅ Tablas de la base de datos verificadas/creadas.")
    
    yield
    logger.info("🛑 Servidor detenido. Cerrando conexiones...")
    await engine.dispose()


# ─── App Factory ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="Boquita Come – POS API",
    description=(
        "Sistema de gestión de restaurante. "
        "Mesas, Comandas, Cocina en tiempo real, Impresión USB y Facturación electrónica Perú."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── CORS ────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────
# Registrar routers tanto en raíz como bajo el prefijo /api para soportar
# tanto el modo desarrollo (Vite) como la SPA compilada en producción.
api_routers = [
    tables.router,
    orders.router,
    billing.router,
    printing.router,
    menu.router,      # CRUD Carta (categorías + productos)
    auth.router,      # Auth y usuarios
    finances.router,
    dashboard.router,
    creams.router,
    backup.router,    # Respaldo (importar/exportar BD)
    settings_router.router,  # Configuración del negocio y recibos
]

for r in api_routers:
    app.include_router(r)
    app.include_router(r, prefix="/api")

app.include_router(ws_router)    # WebSocket endpoints (/ws/kitchen, /ws/cashier, etc.)


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
async def health():
    return {"status": "ok", "service": "boquita-come-pos"}


# ─── Servir Frontend SPA (Vite Production dist) ──────────────────────────────
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi import HTTPException

frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
assets_dir = os.path.join(frontend_dist, "assets")

if os.path.exists(assets_dir):
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa(full_path: str):
    # Excluir rutas del backend / API si no existieran
    if full_path.startswith("api/") or full_path in ["docs", "redoc", "openapi.json", "api"]:
        raise HTTPException(status_code=404, detail="Not Found")

    target_file = os.path.join(frontend_dist, full_path)
    if full_path and os.path.exists(target_file) and os.path.isfile(target_file):
        return FileResponse(target_file)

    index_html = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_html):
        return FileResponse(index_html)

    return {"status": "ok", "service": "boquita-come-pos", "message": "Backend activo. Compila el frontend para ver la interfaz aquí."}


# ─── Entry point (dev) ────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.SERVER_HOST,
        port=settings.SERVER_PORT,
        reload=True,
        log_level="info",
    )
