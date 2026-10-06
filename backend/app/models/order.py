import enum
import sqlalchemy as sa
from sqlalchemy import JSON
from app.db.base import Base


class OrderStatus(str, enum.Enum):
    OPEN = "OPEN"        # Cuenta abierta, se pueden añadir ítems
    SENT = "SENT"        # Todo fue enviado a cocina, esperando pago
    PAID = "PAID"        # Pagada y cerrada
    CANCELLED = "CANCELLED"


class ItemStatus(str, enum.Enum):
    PENDING = "PENDING"      # Pendiente de preparación (rojo)
    PREPARING = "PREPARING"  # En proceso por el chef (amarillo)
    COMPLETED = "COMPLETED"  # Terminado, listo para recoger (verde)
    DELIVERED = "DELIVERED"  # Entregado al cliente


class Order(Base):
    """
    Comanda / cuenta de una mesa.
    Una mesa puede tener una sola Order activa (status OPEN o SENT).
    JSONB `extra` para datos flexibles (comensales, notas globales, etc.)
    """
    __tablename__ = "orders"

    id = sa.Column(sa.Integer, primary_key=True, autoincrement=True)
    table_id = sa.Column(
        sa.Integer,
        sa.ForeignKey("tables.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    user_id = sa.Column(
        sa.Integer,
        sa.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    status = sa.Column(
        sa.Enum(OrderStatus, name="order_status_enum"),
        nullable=False,
        default=OrderStatus.OPEN,
    )
    guest_count = sa.Column(sa.Integer, nullable=True)
    notes = sa.Column(sa.Text, nullable=True)
    extra = sa.Column(JSON, nullable=True)       # flexibilidad futura

    created_at = sa.Column(sa.DateTime(timezone=True), server_default=sa.func.now())
    updated_at = sa.Column(
        sa.DateTime(timezone=True),
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )

    # Relaciones
    table = sa.orm.relationship("Table", back_populates="orders")
    user = sa.orm.relationship("User", lazy="selectin")
    items = sa.orm.relationship(
        "OrderItem", back_populates="order", cascade="all, delete-orphan", lazy="selectin"
    )
    kitchen_tickets = sa.orm.relationship(
        "KitchenTicket", back_populates="order", cascade="all, delete-orphan", lazy="selectin"
    )
    split_bills = sa.orm.relationship(
        "SplitBill", back_populates="order", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def subtotal(self) -> float:
        return sum(float(item.price_at_time) * item.quantity for item in self.items)

    def __repr__(self) -> str:
        return f"<Order id={self.id} table_id={self.table_id} status={self.status}>"


class OrderItem(Base):
    """
    Ítem dentro de una comanda.
    `modifiers` guarda en JSONB las opciones seleccionadas (snapshot al momento de pedir).
    `sent_to_kitchen_at` es None mientras no haya sido enviado → permite saber
    qué ítems son nuevos para el siguiente ticket de cocina.
    """
    __tablename__ = "order_items"

    id = sa.Column(sa.Integer, primary_key=True, autoincrement=True)
    order_id = sa.Column(
        sa.Integer,
        sa.ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id = sa.Column(
        sa.Integer,
        sa.ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
    )
    quantity = sa.Column(sa.Integer, nullable=False, default=1)
    # Precio unitario al momento del pedido (snapshot)
    price_at_time = sa.Column(sa.Numeric(10, 2), nullable=False)
    # Snapshot de modificadores elegidos:
    # [{"group": "Término", "option": "Medio", "price_delta": 0}]
    modifiers = sa.Column(JSON, nullable=True, default=list)
    notes = sa.Column(sa.String(300), nullable=True)   # "sin cebolla", etc.
    status = sa.Column(
        sa.Enum(ItemStatus, name="item_status_enum"),
        nullable=False,
        default=ItemStatus.PENDING,
    )
    sent_to_kitchen_at = sa.Column(sa.DateTime(timezone=True), nullable=True)
    created_at = sa.Column(sa.DateTime(timezone=True), server_default=sa.func.now())

    # Relaciones
    order = sa.orm.relationship("Order", back_populates="items")
    product = sa.orm.relationship("Product", lazy="selectin")

    @property
    def total(self) -> float:
        mod_delta = sum(m.get("price_delta", 0) for m in (self.modifiers or []))
        return (float(self.price_at_time) + mod_delta) * self.quantity

    def __repr__(self) -> str:
        return f"<OrderItem id={self.id} product_id={self.product_id} qty={self.quantity}>"


class KitchenTicket(Base):
    """
    Ticket enviado a cocina cada vez que el mesero presiona 'Enviar a Cocina'.
    Guarda un snapshot JSONB de los ítems nuevos (solo los no enviados anteriormente).
    """
    __tablename__ = "kitchen_tickets"

    id = sa.Column(sa.Integer, primary_key=True, autoincrement=True)
    order_id = sa.Column(
        sa.Integer,
        sa.ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ticket_number = sa.Column(sa.Integer, nullable=False, default=1)
    # Snapshot: [{"product": "Lomo Saltado", "qty": 2, "notes": "sin cebolla", "modifiers": [...]}]
    items_snapshot = sa.Column(JSON, nullable=False)
    printed_at = sa.Column(sa.DateTime(timezone=True), nullable=True)
    created_at = sa.Column(sa.DateTime(timezone=True), server_default=sa.func.now())

    # Relaciones
    order = sa.orm.relationship("Order", back_populates="kitchen_tickets")

    def __repr__(self) -> str:
        return f"<KitchenTicket id={self.id} order_id={self.order_id} ticket_number={self.ticket_number}>"
