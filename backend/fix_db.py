import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from app.models.order import Order, OrderStatus
from app.models.table import Table

async def main():
    engine = create_async_engine("sqlite+aiosqlite:///./boquita_come.db")
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Get tables
        tables_res = await session.execute(select(Table))
        tables = tables_res.scalars().all()
        
        for t in tables:
            result = await session.execute(
                select(Order).where(
                    Order.table_id == t.id, 
                    Order.status.in_([OrderStatus.OPEN, OrderStatus.SENT])
                ).order_by(Order.id.asc())
            )
            orders = result.scalars().all()
            
            if len(orders) > 1:
                print(f"Table {t.id} has {len(orders)} active orders.")
                # keep first, cancel rest
                for o in orders[1:]:
                    print(f" -> Canceling duplicate Order ID: {o.id}")
                    o.status = OrderStatus.CANCELLED
                
        await session.commit()
        print("Database cleanup complete.")

if __name__ == "__main__":
    asyncio.run(main())
