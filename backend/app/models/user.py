import enum
import sqlalchemy as sa
from app.db.base import Base

class RoleType(str, enum.Enum):
    ADMIN = "Administrador"
    SISTEMAS = "Sistemas"
    CAJA = "Caja"
    MOZO = "Mozo"
    COCINA = "Cocina"
    BAR = "Bar"

class User(Base):
    """
    Modelo de Usuario
    """
    __tablename__ = "users"

    id = sa.Column(sa.Integer, primary_key=True, autoincrement=True)
    name = sa.Column(sa.String(100), nullable=False)
    pin = sa.Column(sa.String(4), nullable=False, unique=True, index=True)
    role = sa.Column(
        sa.Enum(RoleType, name="role_type_enum"),
        nullable=False,
        default=RoleType.MOZO,
    )
    is_active = sa.Column(sa.Boolean, default=True)
    created_at = sa.Column(sa.DateTime(timezone=True), server_default=sa.func.now())

    def __repr__(self) -> str:
        return f"<User id={self.id} name={self.name} role={self.role}>"
