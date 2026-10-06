import enum
import sqlalchemy as sa
from app.db.base import Base


class TableStatus(str, enum.Enum):
    FREE = "FREE"          # Libre – verde
    OCCUPIED = "OCCUPIED"  # Ocupada – rojo
    RESERVED = "RESERVED"  # Reservada – amarillo
    TOPAY = "TOPAY"        # Por pagar – naranja


class Table(Base):
    """
    Mesa física del restaurante.

    Unión de mesas (merge):
        Cuando se unen mesas, las mesas secundarias apuntan su `merged_into`
        a la mesa principal.  Las secundarias quedan status=OCCUPIED y no
        se pueden asignar nuevas órdenes directamente.
    """
    __tablename__ = "tables"

    id = sa.Column(sa.Integer, primary_key=True, autoincrement=True)
    number = sa.Column(sa.Integer, nullable=False, unique=True)
    name = sa.Column(sa.String(50), nullable=True)       # Ej: "Terraza 3"
    capacity = sa.Column(sa.Integer, nullable=False, default=4)
    status = sa.Column(
        sa.Enum(TableStatus, name="table_status_enum"),
        nullable=False,
        default=TableStatus.FREE,
    )

    # Auto-referencia para merge de mesas:
    # merged_into = None  → mesa independiente o mesa principal del grupo
    # merged_into = <id>  → mesa secundaria unida a la mesa con ese id
    merged_into = sa.Column(
        sa.Integer,
        sa.ForeignKey("tables.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at = sa.Column(sa.DateTime(timezone=True), server_default=sa.func.now())

    # Relaciones
    merged_children = sa.orm.relationship(
        "Table",
        backref=sa.orm.backref("parent_table", remote_side="Table.id"),
        foreign_keys=[merged_into],
        lazy="selectin",
    )
    orders = sa.orm.relationship("Order", back_populates="table", lazy="dynamic")

    def __repr__(self) -> str:
        return f"<Table number={self.number} status={self.status} merged_into={self.merged_into}>"
