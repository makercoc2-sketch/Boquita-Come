import sqlite3
import sys

try:
    conn = sqlite3.connect('boquita_come.db', timeout=2) # fail fast
    c = conn.cursor()
    
    c.execute("SELECT id, status FROM orders WHERE table_id=1")
    all_table_1 = c.fetchall()
    print("Table 1 orders before:", all_table_1)
    
    # Update all OPEN/SENT duplicates to CANCELLED 
    c.execute("""
        UPDATE orders 
        SET status='CANCELLED' 
        WHERE table_id=1 
        AND status IN ('OPEN', 'SENT') 
        AND id != (SELECT MIN(id) FROM orders WHERE table_id=1 AND status IN ('OPEN', 'SENT'))
    """)
    conn.commit()
    
    c.execute("SELECT id, status FROM orders WHERE table_id=1 AND status IN ('OPEN', 'SENT')")
    active_now = c.fetchall()
    print("Table 1 active orders after:", active_now)
    print("DB Fix SUCCESS")
except Exception as e:
    print("ERROR:", e)
    sys.exit(1)
finally:
    if 'conn' in locals():
        conn.close()
