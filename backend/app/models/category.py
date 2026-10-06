import sqlalchemy as sa
from app.db.base import Base


class ProductCategory(Base):
    """Categorías de productos (Entradas, Fondos, Bebidas, etc.)"""
    __tablename__ = "product_categories"

    id = sa.Column(sa.Integer, primary_key=True, autoincrement=True)
    name = sa.Column(sa.String(100), nullable=False, unique=True)
    color = sa.Column(sa.String(7), nullable=False, default="#6366F1")  # hex color
    sort_order = sa.Column(sa.Integer, nullable=False, default=0)
    is_active = sa.Column(sa.Boolean, nullable=False, default=True)
    destination = sa.Column(sa.String(20), nullable=False, default="kitchen") # 'kitchen' or 'bar'

    # Relaciones
    products = sa.orm.relationship("Product", back_populates="category", lazy="selectin")

    def __repr__(self) -> str:
        return f"<ProductCategory id={self.id} name={self.name!r}>"
