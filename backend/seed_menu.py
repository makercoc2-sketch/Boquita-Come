import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from app.db.base import engine
from app.db import init_models  # noqa - registra todos los modelos SQLAlchemy
from app.models.category import ProductCategory
from app.models.product import Product
from app.models.user import User, RoleType
from app.models.table import Table, TableStatus

async def seed():
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    # ─── 1. Usuarios por defecto ──────────────────────────────────────────────
    users_data = [
        {"name": "Administrador", "pin": "1234", "role": RoleType.ADMIN},
        {"name": "Sistemas", "pin": "0000", "role": RoleType.SISTEMAS},
        {"name": "Cajero Juan", "pin": "1111", "role": RoleType.CAJA},
        {"name": "Mozo Carlos", "pin": "2222", "role": RoleType.MOZO},
        {"name": "Chef Cocina", "pin": "3333", "role": RoleType.COCINA},
        {"name": "Barman Luis", "pin": "4444", "role": RoleType.BAR},
    ]

    # ─── 2. Mesas por defecto ─────────────────────────────────────────────────
    tables_data = [
        {"number": 1, "name": "Mesa 1", "capacity": 4},
        {"number": 2, "name": "Mesa 2", "capacity": 4},
        {"number": 3, "name": "Mesa 3", "capacity": 2},
        {"number": 4, "name": "Mesa 4", "capacity": 4},
        {"number": 5, "name": "Mesa 5", "capacity": 6},
        {"number": 6, "name": "Mesa 6", "capacity": 4},
        {"number": 7, "name": "Mesa 7", "capacity": 2},
        {"number": 8, "name": "Mesa 8", "capacity": 8},
        {"number": 9, "name": "Terraza 1", "capacity": 4},
        {"number": 10, "name": "Terraza 2", "capacity": 4},
        {"number": 11, "name": "VIP 1", "capacity": 6},
        {"number": 12, "name": "VIP 2", "capacity": 10},
    ]

    # ─── 3. Menú por defecto ──────────────────────────────────────────────────
    categories_data = [
        {"name": "Entradas", "color": "#10B981", "destination": "kitchen"},
        {"name": "Platos de Fondo", "color": "#EF4444", "destination": "kitchen"},
        {"name": "Sopas", "color": "#F59E0B", "destination": "kitchen"},
        {"name": "Ensaladas", "color": "#84CC16", "destination": "kitchen"},
        {"name": "Postres", "color": "#E11D48", "destination": "kitchen"},
        {"name": "Cervezas", "color": "#FBBF24", "destination": "bar"},
        {"name": "Tragos y Cócteles", "color": "#8B5CF6", "destination": "bar"},
        {"name": "Jugos y Refrescos", "color": "#06B6D4", "destination": "bar"},
        {"name": "Cafetería", "color": "#78350F", "destination": "bar"},
    ]

    products_data = {
        "Entradas": [
            ("Tequeños de Lomo Saltado", "15.00", "Porción de 6 unidades con salsa huancaína."),
            ("Papa a la Huancaína", "12.00", "Papas andinas bañadas en suave crema de ají amarillo."),
            ("Ceviche Clásico Medio", "25.00", "Pesca del día con limón, ají limo, camote y choclo."),
            ("Empanadas de Carne", "10.00", "2 empanadas horneadas con relleno jugoso."),
            ("Anticuchos de Corazón", "18.00", "2 palitos con papa dorada y ají carretillero."),
        ],
        "Platos de Fondo": [
            ("Lomo Saltado a lo Pobre", "35.00", "Con huevo frito, plátano y papas fritas crocantes."),
            ("Ají de Gallina", "28.00", "Clásico criollo acompañado de arroz y pecanas."),
            ("Arroz con Pollo", "25.00", "Con salsa criolla y papa a la huancaína."),
            ("Chaufa de Mariscos", "38.00", "Salteado en wok con sabores orientales."),
            ("Fetuccini a la Huancaína con Lomo", "40.00", "Pasta al dente coronada con jugoso lomo saltado."),
            ("Pollo a la Brasa (1/4)", "22.00", "Con papas fritas y ensalada clásica."),
            ("Tacu Tacu con Seco", "32.00", "Frijol y arroz dorados con asado de res tierno."),
        ],
        "Sopas": [
            ("Menestrón", "18.00", "Sopa contundente con carne de res y albahaca."),
            ("Caldo de Gallina", "20.00", "Con fideo, huevo duro y cebolla china."),
            ("Sopa a la Minuta", "16.00", "Sopa casera con carne molida y cabello de ángel."),
            ("Parihuela", "30.00", "Concentrado de mariscos y pescado del día."),
            ("Sancochado", "28.00", "Caldo tradicional con cortes de res y verduras."),
        ],
        "Ensaladas": [
            ("Ensalada César con Pollo", "22.00", "Lechuga romana, crutones, parmesano y pollo grillado."),
            ("Ensalada Fresca de Jardín", "15.00", "Verduras de estación con aliño ligero de limón."),
            ("Ensalada Rusa", "14.00", "Remolacha, papa, zanahoria y mayonesa casera."),
        ],
        "Postres": [
            ("Suspiro a la Limeña", "12.00", "Manjar blanco con merengue al oporto y canela."),
            ("Crema Volteada", "10.00", "Suave postre tradicional con caramelo."),
            ("Torta de Chocolate", "14.00", "Bizcocho húmedo relleno y cubierto de fudge."),
            ("Picarones", "10.00", "4 aros de masa con miel de higo y chancaca."),
            ("Arroz con Leche y Mazamorra", "12.00", "Clásico limeño combinado."),
        ],
        "Cervezas": [
            ("Cerveza Pilsen Callao 620ml", "10.00", "Bien helada."),
            ("Cerveza Cusqueña Dorada 620ml", "12.00", "Trigo, dorada o negra."),
            ("Cerveza Cristal 620ml", "10.00", "Rubia clásica."),
            ("Stella Artois 330ml", "15.00", "Cerveza premium importada."),
            ("Cerveza Artesanal IPA", "18.00", "Intenso aroma a lúpulo."),
        ],
        "Tragos y Cócteles": [
            ("Pisco Sour Catedral", "25.00", "Doble pisco sour tradicional en copa grande."),
            ("Chilcano Clásico", "20.00", "Pisco, ginger ale y unas gotas de limón y amargo."),
            ("Piña Colada", "22.00", "Ron, crema de coco y jugo de piña."),
            ("Mojito Clásico", "20.00", "Ron, hierbabuena fresca, azúcar y soda."),
            ("Algarrobina", "22.00", "Cóctel dulce con pisco, leche y extracto de algarrobina."),
            ("Margarita", "24.00", "Tequila, triple sec y limón con borde salado."),
        ],
        "Jugos y Refrescos": [
            ("Chicha Morada Jarra 1L", "15.00", "Maíz morado con piña, canela y clavo."),
            ("Limonada Frozen Jarra 1L", "14.00", "Refrescante limonada licuada con hielo."),
            ("Jugo de Papaya", "8.00", "Puro o con leche."),
            ("Jugo Surtido", "10.00", "Mix de frutas de estación."),
            ("Gaseosa Inka Kola 500ml", "6.00", "Regular o Zero."),
            ("Gaseosa Coca Cola 500ml", "6.00", "Regular o Zero."),
            ("Agua Mineral", "4.00", "Con o sin gas."),
        ],
        "Cafetería": [
            ("Café Americano", "6.00", "Café pasado gota a gota."),
            ("Capuccino", "9.00", "Espresso con leche espumada y canela."),
            ("Espresso", "5.00", "Intenso y puro."),
            ("Infusión de Manzanilla", "5.00", "Té caliente relajante."),
            ("Chocolate Caliente", "8.00", "Chocolate de taza tradicional peruano."),
        ]
    }

    async with async_session() as session:
        # Seed Usuarios
        res_u = await session.execute(select(User))
        existing_users = {u.pin: u for u in res_u.scalars().all()}
        user_count = 0
        for udata in users_data:
            if udata["pin"] not in existing_users:
                user = User(**udata)
                session.add(user)
                user_count += 1

        # Seed Mesas
        res_t = await session.execute(select(Table))
        existing_tables = {t.number: t for t in res_t.scalars().all()}
        table_count = 0
        for tdata in tables_data:
            if tdata["number"] not in existing_tables:
                tbl = Table(
                    number=tdata["number"],
                    name=tdata["name"],
                    capacity=tdata["capacity"],
                    status=TableStatus.FREE
                )
                session.add(tbl)
                table_count += 1

        # Seed Categorías
        result = await session.execute(select(ProductCategory))
        existing_categories = {cat.name: cat for cat in result.scalars().all()}
        for data in categories_data:
            if data["name"] not in existing_categories:
                cat = ProductCategory(
                    name=data["name"],
                    color=data["color"],
                    destination=data["destination"]
                )
                session.add(cat)
                existing_categories[data["name"]] = cat
        
        await session.flush()

        # Seed Productos
        result_prods = await session.execute(select(Product))
        existing_products = {p.name: p for p in result_prods.scalars().all()}
        prod_count = 0
        for cat_name, prods in products_data.items():
            cat = existing_categories[cat_name]
            for p_name, p_price, p_desc in prods:
                if p_name not in existing_products:
                    prod = Product(
                        category_id=cat.id,
                        name=p_name,
                        price=p_price,
                        description=p_desc,
                        is_available=True
                    )
                    session.add(prod)
                    prod_count += 1
        
        await session.commit()
        print(f"[OK] {user_count} usuarios, {table_count} mesas, {len(categories_data)} categorias y {prod_count} productos cargados.")

if __name__ == "__main__":
    asyncio.run(seed())
