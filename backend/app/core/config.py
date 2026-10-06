from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./boquita_come.db"

    # Server
    SERVER_HOST: str = "0.0.0.0"
    SERVER_PORT: int = 8000

    # CORS – subredes LAN de las tablets
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://192.168.1.100:5173"]

    # Impresora USB
    PRINTER_VENDOR_ID: int = 0x04B8   # Epson por defecto
    PRINTER_PRODUCT_ID: int = 0x0202  # TM-T20II por defecto

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
