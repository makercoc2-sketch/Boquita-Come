from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_DEFAULT_DB = (_BACKEND_DIR / "boquita_come.db").as_posix()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    DATABASE_URL: str = f"sqlite+aiosqlite:///{_DEFAULT_DB}"

    # Server
    SERVER_HOST: str = "0.0.0.0"
    SERVER_PORT: int = 8000

    # CORS – subredes LAN de las tablets
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://192.168.1.100:5173"]

    # Impresora (Windows Spooler o USB directo)
    PRINTER_NAME: str = ""            # Si se deja vacío, autodetecta Epson / TM-T20 / Receipt
    PRINTER_VENDOR_ID: int = 0x04B8   # Epson (0x04B8)
    PRINTER_PRODUCT_ID: int = 0x0E15  # TM-T20II conectada (0x0E15)

    # Datos del negocio
    BUSINESS_NAME: str = "Boquita Come"
    BUSINESS_RUC: str = "20123456789"
    BUSINESS_ADDRESS: str = "Av. Principal 123, Lima, Perú"
    IGV_PERCENTAGE: float = 10.5

    # Seguridad
    SECRET_KEY: str = "changeme_super_secret_key"
    
    # AI Feature
    GEMINI_API_KEY: str = ""


settings = Settings()
