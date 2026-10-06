import sqlalchemy as sa
from sqlalchemy import JSON
from app.db.base import Base


class SplitBill(Base):
    """
    Cuenta dividida ("cuenta separada") dentro de una Order.
    Permite que un grupo de comensales pague partes diferentes de la cuenta.

    `item_ids` → array JSONB de OrderItem.id que pertenecen a esta división.
    `label`    → nombre/etiqueta, ej: "Persona A", "Mesa derecha".
    """
    __tablename__ = "split_bills"

    id = sa.Column(sa.Integer, primary_key=True, autoincrement=True)
    order_id = sa.Column(
        sa.Integer,
        sa.ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label = sa.Column(sa.String(100), nullable=False, default="Parte 1")
    # IDs de OrderItem asignados a esta persona/grupo
    item_ids = sa.Column(JSON, nullable=False, default=list)
    # Subtotal calculado al momento de dividir (snapshot)
    subtotal = sa.Column(sa.Numeric(10, 2), nullable=True)
    is_paid = sa.Column(sa.Boolean, nullable=False, default=False)
    created_at = sa.Column(sa.DateTime(timezone=True), server_default=sa.func.now())

    # Relaciones
    order = sa.orm.relationship("Order", back_populates="split_bills")

    def __repr__(self) -> str:
        return f"<SplitBill id={self.id} order_id={self.order_id} label={self.label!r} paid={self.is_paid}>"
