import sqlite3
import uuid
from datetime import datetime

db_path = r"D:\san\sanomni\data\database.sqlite"
pack_id = '29d0804a-40e8-483f-8816-126b504f8f8e'

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

now_iso = datetime.utcnow().isoformat() + "Z"
platform_id = str(uuid.uuid4())

cursor.execute("""
    INSERT INTO ip_sticker_pack_platforms (
        id, pack_id, platform_name, pack_name_on_platform, 
        emoji_size_spec, status, publish_url, downloads_count, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
""", (
    platform_id, pack_id, '微信', '糯糯知时节春生夏', 
    '240x240', 'Published', '', 0, now_iso
))

conn.commit()
conn.close()
print("Platform added successfully.")
