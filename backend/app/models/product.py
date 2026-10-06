import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from app.db.base import Base


class Product(Base):
    """Producto del menú."""
    __tablename__ = "products"

    id = sa.Column(sa.Integer, primary_key=True, autoincrement=True)
    category_id = sa.Column(
        sa.Integer,
        sa.ForeignKey("product_categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    name = sa.Column(sa.String(150), nullable=False)
    description = sa.Column(sa.Text, nullable=True)
    suggestions = sa.Column(sa.Text, nullable=True)
    price = sa.Column(sa.Numeric(10, 2), nullable=False)
    image_url = sa.Column(sa.String(500), nullable=True)
    is_available = sa.Column(sa.Boolean, nullable=False, default=True)
    created_at = sa.Column(sa.DateTime(timezone=True), server_default=sa.func.now())

    # Relaciones
    category = sa.orm.relationship("ProductCategory", back_populates="products")
    modifier_groups = sa.orm.relationship(
        "ModifierGroup", back_populates="product", cascade="all, delete-orphan", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Product id={self.id} name={self.name!r} price={self.price}>"


class ModifierGroup(Base):
    """
    Grupo de modificadores de un producto.
    Ej: "Término de la carne" (required=True, multi_select=False)
        "Extras"              (required=False, multi_select=True)
    """
    __tablename__ = "modifier_groups"

    id = sa.Column(sa.Integer, primary_key=True, autoincrement=True)
    product_id = sa.Column(
        sa.Integer,
        sa.ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    name = sa.Column(sa.String(100), nullable=False)
    required = sa.Column(sa.Boolean, nullable=False, default=False)
    multi_select = sa.Column(sa.Boolean, nullable=False, default=False)
    sort_order = sa.Column(sa.Integer, nullable=False, default=0)

    # Relaciones
    product = sa.orm.relationship("Product", back_populates="modifier_groups")
    options = sa.orm.relationship(
        "ModifierOption", back_populates="group", cascade="all, delete-orphan", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<ModifierGroup id={self.id} name={self.name!r}>"


class ModifierOption(Base):
    """
    Opción dentro de un grupo de modificadores.
    Ej: "Término: Medio", "Sin cebolla", "Extra queso (+S/ 2.00)"
    """
    __tablename__ = "modifier_options"

    id = sa.Column(sa.Integer, primary_key=True, autoincrement=True)
    group_id = sa.Column(
        sa.Integer,
        sa.ForeignKey("modifier_groups.id", ondelete="CASCADE"),
        nullable=False,
    )
    name = sa.Column(sa.String(100), nullable=False)
    # Delta de precio (puede ser negativo, ej: "sin extra" baja el precio)
    price_delta = sa.Column(sa.Numeric(10, 2), nullable=False, default=0.00)
    is_default = sa.Column(sa.Boolean, nullable=False, default=False)

    # Relaciones
    group = sa.orm.relationship("ModifierGroup", back_populates="options")

    def __repr__(self) -> str:
        return f"<ModifierOption id={self.id} name={self.name!r} delta={self.price_delta}>"
