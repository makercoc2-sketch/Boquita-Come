# Boquita Come – Sistema POS para Restaurante

Sistema de gestión para restaurante. Servidor local (LAN) con FastAPI + PostgreSQL + React + Tailwind + WebSockets.

---

## 🗂 Estructura del Proyecto

```
boquita-come/
├── backend/
│   ├── app/
│   │   ├── core/config.py          ← Settings (.env)
│   │   ├── db/base.py              ← Motor async SQLAlchemy
│   │   ├── models/                 ← Todos los modelos SQLAlchemy
│   │   │   ├── category.py         ← ProductCategory
│   │   │   ├── product.py          ← Product, ModifierGroup, ModifierOption
│   │   │   ├── table.py            ← Table (FREE/OCCUPIED/RESERVED/TOPAY)
│   │   │   ├── order.py            ← Order, OrderItem, KitchenTicket
│   │   │   └── split_bill.py       ← SplitBill
│   │   ├── routers/
│   │   │   ├── tables.py           ← CRUD + merge/unmerge
│   │   │   ├── orders.py           ← Comandas add-on + send-kitchen
│   │   │   ├── billing.py          ← Facturación PSE (IGV 10.5%)
│   │   │   └── printing.py         ← Impresión térmica USB
│   │   ├── services/printer.py     ← ESC/POS via python-escpos
│   │   └── ws/
│   │       ├── manager.py          ← ConnectionManager (broadcast por sala)
│   │       └── kitchen.py          ← WS endpoints /ws/kitchen, /ws/cashier
│   ├── alembic/env.py              ← Migraciones async
│   ├── alembic.ini
│   ├── main.py                     ← App FastAPI
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/client.js           ← Axios + helpers de endpoints
│   │   ├── hooks/useWebSocket.js   ← Hook WS con auto-reconexión
│   │   ├── pages/
│   │   │   ├── TableMap.jsx        ← Mapa de mesas dinámico
│   │   │   ├── KitchenDisplay.jsx  ← Pantalla de cocina (KDS)
│   │   │   └── OrderPanel.jsx      ← Panel de comanda
│   │   ├── components/TableCard.jsx
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
└── docker-compose.yml              ← PostgreSQL 16 + pgAdmin
```

---

## 🚀 Inicio Rápido

### 1. Base de Datos (Docker)
```bash
docker-compose up -d
# PostgreSQL escucha en localhost:5432
# pgAdmin en http://localhost:5050  (admin@boquita.com / admin)
```

### 2. Backend
```bash
cd backend

# Entorno virtual
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/Mac

pip install -r requirements.txt

# Variables de entorno
copy .env.example .env         # Editar DATABASE_URL si es necesario

# Migraciones
alembic upgrade head

# Servidor (accesible desde tablets en la LAN)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
# Accede en http://<IP-PC>:5173 desde cualquier tablet de la misma red
```

---

## 📌 Endpoints Clave

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/tables/` | Listar mesas |
| POST | `/tables/merge` | **Unir mesas** |
| POST | `/tables/unmerge/{id}` | Deshacer merge |
| POST | `/orders/` | Abrir comanda |
| POST | `/orders/{id}/items` | Agregar ítems (add-on) |
| POST | `/orders/{id}/send-kitchen` | Enviar a cocina → WS |
| GET | `/billing/{id}/preview` | Previsualizar factura |
| POST | `/billing/{id}/export` | Exportar PSE JSON (IGV 10.5%) |
| POST | `/print/kitchen-ticket` | Imprimir ticket USB |
| WS | `/ws/kitchen` | Canal en tiempo real – Cocina |
| WS | `/ws/cashier` | Canal en tiempo real – Caja |

Documentación interactiva: `http://localhost:8000/docs`

---

## ⚙️ Configurar Impresora USB (Windows)

1. Conectar la ticketera por USB
2. Instalar [Zadig](https://zadig.akeo.ie/) → seleccionar la impresora → instalar **WinUSB** driver
3. Obtener IDs:
   ```python
   import usb.core
   for dev in usb.core.find(find_all=True):
       print(f"Vendor: 0x{dev.idVendor:04X}  Product: 0x{dev.idProduct:04X}")
   ```
4. Actualizar `PRINTER_VENDOR_ID` y `PRINTER_PRODUCT_ID` en `.env`

> **Sin impresora:** El sistema funciona igual; los tickets se simulan en el log del servidor.

---

## 💡 Flujo de Trabajo

```
Mesero (tablet)              Servidor                  Cocina (pantalla)
──────────────────           ─────────────────         ──────────────────
1. Abre mesa         →  POST /orders/
2. Agrega ítems      →  POST /orders/{id}/items
3. Envía a cocina    →  POST /orders/{id}/send-kitchen
                              ↓ Genera KitchenTicket
                              ↓ Websocket broadcast     ← Ticket aparece
4. Agrega más ítems  →  POST /orders/{id}/items          en pantalla
5. Envía de nuevo    →  Solo ítems NUEVOS van a cocina
6. Cierra cuenta     →  POST /billing/{id}/export  (JSON PSE)
                         POST /print/receipt        (imprime ticket)
                         POST /orders/{id}/close
```

---

## 🧮 Cálculo IGV (10.5% – Ley 2026 Perú)

Los precios son **precio de venta final** (IGV incluido):
```
Base imponible = Total / 1.105
IGV            = Total − Base imponible
```

---

## 🛡️ Variables de Entorno Importantes

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | DSN async PostgreSQL |
| `CORS_ORIGINS` | IPs de las tablets (separadas por coma) |
| `PRINTER_VENDOR_ID` | ID USB del fabricante (hex) |
| `PRINTER_PRODUCT_ID` | ID USB del modelo (hex) |
| `IGV_PERCENTAGE` | Porcentaje IGV (default: 10.5) |
| `BUSINESS_RUC` | RUC del negocio para boletas |
