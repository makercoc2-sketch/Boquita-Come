from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

from app.db.base import get_db
from app.models.setting import SystemSetting
from app.core.config import settings as default_settings
from app.services.printer import printer_service

router = APIRouter(prefix="/settings", tags=["Settings"])


class SettingUpdate(BaseModel):
    business_name: str = Field(..., min_length=1, max_length=150)
    business_ruc: str = Field(..., min_length=8, max_length=20)
    business_address: str = Field(..., min_length=1, max_length=250)
    business_phone: Optional[str] = ""
    igv_percentage: float = Field(..., ge=0, le=100)
    receipt_footer: Optional[str] = "¡Gracias por su visita!"
    printer_name: Optional[str] = ""


class SettingOut(BaseModel):
    id: int
    business_name: str
    business_ruc: str
    business_address: str
    business_phone: Optional[str] = ""
    igv_percentage: float
    receipt_footer: Optional[str] = ""
    printer_name: Optional[str] = ""
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


async def get_or_create_settings(db: AsyncSession) -> SystemSetting:
    """Obtiene la configuración existente o crea la inicial basada en el archivo de configuración."""
    result = await db.execute(select(SystemSetting).limit(1))
    setting = result.scalar_one_or_none()

    if not setting:
        setting = SystemSetting(
            business_name=default_settings.BUSINESS_NAME,
            business_ruc=default_settings.BUSINESS_RUC,
            business_address=default_settings.BUSINESS_ADDRESS,
            business_phone="",
            igv_percentage=float(default_settings.IGV_PERCENTAGE),
            receipt_footer="¡Gracias por su visita!",
            printer_name=getattr(default_settings, "PRINTER_NAME", "") or "",
        )
        db.add(setting)
        await db.commit()
        await db.refresh(setting)

    return setting


@router.get("/", response_model=SettingOut)
async def get_settings(db: AsyncSession = Depends(get_db)):
    """Obtiene los datos del negocio y configuración de comprobantes."""
    return await get_or_create_settings(db)


@router.put("/", response_model=SettingOut)
async def update_settings(payload: SettingUpdate, db: AsyncSession = Depends(get_db)):
    """Actualiza los datos del negocio, RUC, dirección, IGV y recibos."""
    setting = await get_or_create_settings(db)

    setting.business_name = payload.business_name.strip()
    setting.business_ruc = payload.business_ruc.strip()
    setting.business_address = payload.business_address.strip()
    setting.business_phone = (payload.business_phone or "").strip()
    setting.igv_percentage = payload.igv_percentage
    setting.receipt_footer = (payload.receipt_footer or "").strip()
    setting.printer_name = (payload.printer_name or "").strip()

    await db.commit()
    await db.refresh(setting)

    # Actualizar también settings en memoria
    default_settings.BUSINESS_NAME = setting.business_name
    default_settings.BUSINESS_RUC = setting.business_ruc
    default_settings.BUSINESS_ADDRESS = setting.business_address
    default_settings.IGV_PERCENTAGE = setting.igv_percentage
    default_settings.PRINTER_NAME = setting.printer_name

    return setting


@router.post("/test-print")
async def test_print(db: AsyncSession = Depends(get_db)):
    """Imprime un ticket de prueba con los datos actuales del negocio."""
    setting = await get_or_create_settings(db)

    lines = [
        "================================",
        f"  {setting.business_name.upper()}",
        f"  RUC: {setting.business_ruc}",
        f"  {setting.business_address}",
    ]
    if setting.business_phone:
        lines.append(f"  Tel: {setting.business_phone}")
    lines.extend([
        "================================",
        "      TICKET DE PRUEBA          ",
        "  CONFIGURACION ACTUALIZADA     ",
        f"  IGV Configurado: {setting.igv_percentage}%",
        "================================",
        f"  {setting.receipt_footer or '¡Gracias por su visita!'}",
        "================================",
    ])

    success = printer_service._send_to_printer(lines)
    if not success:
        raise HTTPException(
            status_code=503,
            detail="No se pudo imprimir. Verifique que la impresora esté encendida y conectada.",
        )
    return {"ok": True, "message": "Ticket de prueba impreso correctamente."}
