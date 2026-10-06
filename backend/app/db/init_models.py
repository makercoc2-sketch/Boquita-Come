# Re-exporta Base y todos los modelos para que Alembic los detecte
from app.db.base import Base  # noqa: F401
from app.models.category import ProductCategory  # noqa: F401
from app.models.product import Product, ModifierGroup, ModifierOption  # noqa: F401
from app.models.table import Table  # noqa: F401
from app.models.order import Order, OrderItem, KitchenTicket  # noqa: F401
from app.models.split_bill import SplitBill  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.expense import Expense, ExpenseType  # noqa: F401
from app.models.cream import Cream  # noqa: F401
from app.models.setting import SystemSetting  # noqa: F401
