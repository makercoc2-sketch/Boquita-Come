import sqlalchemy as sa
from app.db.base import Base

class Cream(Base):
    """
    Modelo de Cremas / Salsas con diminutivos
    Ejemplo: name="Mayonesa", abbreviation="/my"
    """
    __tablename__ = "creams"

    id = sa.Column(sa.Integer, primary_key=True, autoincrement=True)
    name = sa.Column(sa.String(100), nullable=False)
    abbreviation = sa.Column(sa.String(20), nullable=False)
    is_active = sa.Column(sa.Boolean, default=True)
    created_at = sa.Column(sa.DateTime(timezone=True), server_default=sa.func.now())

    def __repr__(self) -> str:
        return f"<Cream id={self.id} name={self.name} abbreviation={self.abbreviation}>"
