import sqlalchemy as sa
from datetime import datetime, timezone
from app.db.base import Base


class SystemSetting(Base):
    """Configuración general del restaurante y datos del comprobante/recibo."""
    __tablename__ = "system_settings"

    id = sa.Column(sa.Integer, primary_key=True, autoincrement=True)
    business_name = sa.Column(sa.String(150), nullable=False, default="Boquita Come")
    business_ruc = sa.Column(sa.String(20), nullable=False, default="20123456789")
    business_address = sa.Column(sa.String(250), nullable=False, default="Av. Principal 123, Lima, Perú")
    business_phone = sa.Column(sa.String(50), nullable=True, default="")
    igv_percentage = sa.Column(sa.Float, nullable=False, default=10.5)
    receipt_footer = sa.Column(sa.String(250), nullable=True, default="¡Gracias por su visita!")
    printer_name = sa.Column(sa.String(100), nullable=True, default="")
    updated_at = sa.Column(
        sa.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )

    def __repr__(self) -> str:
        return f"<SystemSetting name={self.business_name!r} ruc={self.business_ruc!r}>"
