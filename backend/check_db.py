import sqlite3

conn = sqlite3.connect('boquita_come.db')
cursor = conn.cursor()

cursor.execute("SELECT status, COUNT(*) FROM tables GROUP BY status;")
print("Tables:", cursor.fetchall())

cursor.execute("SELECT c.name, COUNT(p.id) FROM products p JOIN product_categories c ON p.category_id = c.id WHERE c.name LIKE '%entrada%' GROUP BY c.name;")
print("Entradas:", cursor.fetchall())
