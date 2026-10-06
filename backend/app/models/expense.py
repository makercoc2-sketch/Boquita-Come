import enum
import sqlalchemy as sa
from app.db.base import Base

class ExpenseType(str, enum.Enum):
    FIJO = "FIJO"
    VARIABLE = "VARIABLE"

class Expense(Base):
    __tablename__ = "expenses"

    id = sa.Column(sa.Integer, primary_key=True, autoincrement=True)
    expense_type = sa.Column(
        sa.Enum(ExpenseType, name="expense_type_enum"),
        nullable=False
    )
    description = sa.Column(sa.String(255), nullable=False)
    amount = sa.Column(sa.Numeric(10, 2), nullable=False)
    expense_date = sa.Column(sa.DateTime(timezone=True), nullable=False)
    
    # Audit logic
    created_at = sa.Column(sa.DateTime(timezone=True), server_default=sa.func.now())
    created_by_id = sa.Column(
        sa.Integer,
        sa.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )

    user = sa.orm.relationship("User", lazy="selectin")
