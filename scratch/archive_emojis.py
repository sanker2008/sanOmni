import os
import sqlite3
import hashlib
import uuid
import secrets
from datetime import datetime

db_path = r"D:\san\sanomni\data\database.sqlite"
ip_id = 'eeddee2b-6c18-4d5f-a7ef-d633a4881461'
pack_id = '29d0804a-40e8-483f-8816-126b504f8f8e'

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get all inserted emojis for this pack
cursor.execute("SELECT id, image_path, trigger_word FROM ip_emojis WHERE pack_id = ?", (pack_id,))
emojis = cursor.fetchall()

now_iso = datetime.utcnow().isoformat() + "Z"

for emoji_id, image_path, trigger_word in emojis:
    # image_path is like D:\san\sanomni\ip_archived/nuonuo/emojis/chunshengxia/nuonuo-2026-06-16-144002-0000.jpg
    abs_path = image_path.replace("/", "\\")
    filename = os.path.basename(abs_path)
    relative_path = f"ip_archived\\nuonuo\\emojis\\chunshengxia\\{filename}"
    original_filename = f"{trigger_word}.jpg"
    
    if not os.path.exists(abs_path):
        continue
        
    file_size = os.path.getsize(abs_path)
    
    # Calculate SHA256
    sha256 = hashlib.sha256()
    with open(abs_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha256.update(chunk)
    file_hash = sha256.hexdigest()
    
    # Generate ID
    ip_img_id = f"ipimg_{secrets.token_hex(6)}"
    
    # Check if already inserted
    cursor.execute("SELECT id FROM ip_images WHERE absolute_path = ?", (abs_path,))
    if cursor.fetchone():
        continue
        
    cursor.execute("""
        INSERT INTO ip_images (
            id, filename, original_filename, ip_id, relative_path, absolute_path, 
            status, file_size, width, height, file_hash, format, 
            has_watermark, watermark_detected, watermark_removed, 
            created_at, imported_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        ip_img_id, filename, original_filename, ip_id, relative_path, abs_path,
        'archived', file_size, 0, 0, file_hash, 'JPEG',
        0, 0, 0,
        now_iso, now_iso, now_iso
    ))
    
    cursor.execute("""
        INSERT INTO ip_image_relations (ip_image_id, ip_id, is_primary)
        VALUES (?, ?, ?)
    """, (ip_img_id, ip_id, 0))

# Trigger updates
cursor.execute("UPDATE ip_assets SET updated_at = ? WHERE id = ?", (now_iso, ip_id))
cursor.execute("UPDATE ip_sticker_packs SET updated_at = ? WHERE id = ?", (now_iso, pack_id))

conn.commit()
conn.close()
print("Archiving complete and update records triggered.")
