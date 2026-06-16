import os
import shutil
import sqlite3
import uuid
import secrets
import hashlib
from datetime import datetime

source_dir = r"C:\Users\sanke\Desktop\nn"
sanip_dir = r"D:\san\sanomni\sanIP\表情包分组\糯糯知时节秋收冬"
archived_dir = r"D:\san\sanomni\ip_archived\nuonuo\emojis\qiushoudong"
db_path = r"D:\san\sanomni\data\database.sqlite"

os.makedirs(sanip_dir, exist_ok=True)
os.makedirs(archived_dir, exist_ok=True)

emoji_mapping = [
    ("01 乞巧祈福", "Slice_0017_R1-C1.jpg", "乞巧祈福"),
    ("02 甜甜蜜蜜", "Slice_0018_R1-C2.jpg", "甜甜蜜蜜"),
    ("03 百无禁忌", "Slice_0019_R1-C3.jpg", "百无禁忌"),
    ("04 花好月圆", "Slice_0020_R1-C4.jpg", "花好月圆"),
    ("05 月圆人圆", "Slice_0021_R2-C1.jpg", "月圆人圆"),
    ("06 步步高升", "Slice_0022_R2-C2.jpg", "步步高升"),
    ("07 加衣保暖", "Slice_0023_R2-C3.jpg", "加衣保暖"),
    ("08 厄运退散", "Slice_0024_R2-C4.jpg", "厄运退散"),
    ("09 冬至大吉", "Slice_0025_R3-C1.jpg", "冬至大吉"),
    ("10 腊八粥香", "Slice_0026_R3-C2.jpg", "腊八粥香"),
    ("11 甜言蜜语", "Slice_0027_R3-C3.jpg", "甜言蜜语"),
    ("12 除旧布新", "Slice_0028_R3-C4.jpg", "除旧布新"),
    ("13 守岁纳福", "Slice_0029_R4-C1.jpg", "守岁纳福"),
    ("14 辞旧迎新", "Slice_0030_R4-C2.jpg", "辞旧迎新"),
    ("15 柿柿如意", "Slice_0031_R4-C3.jpg", "柿柿如意"),
    ("16 五福临门", "Slice_0034_R1-C2.jpg", "五福临门")
]

ip_id = 'eeddee2b-6c18-4d5f-a7ef-d633a4881461'
pack_id = 'be737ee2-a618-48e3-9d4e-11efe97877c4'

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

now_str = datetime.now().strftime("%Y-%m-%d-%H%M%S")
# Need timezone-aware or UTC ISO for the db
try:
    now_iso = datetime.now(datetime.UTC).isoformat().replace("+00:00", "Z")
except Exception:
    now_iso = datetime.utcnow().isoformat() + "Z"

for idx, (display_name, filename, trigger_word) in enumerate(emoji_mapping):
    src_file = os.path.join(source_dir, filename)
    if not os.path.exists(src_file):
        print(f"Warning: {src_file} does not exist!")
        continue
    
    # 1. Copy to sanIP directory
    sanip_file = os.path.join(sanip_dir, f"{display_name}.jpg")
    shutil.copy2(src_file, sanip_file)
    
    # 2. Copy to ip_archived directory
    archived_filename = f"nuonuo-{now_str}-{idx:04d}.jpg"
    archived_file = os.path.join(archived_dir, archived_filename)
    shutil.copy2(src_file, archived_file)
    
    file_size = os.path.getsize(archived_file)
    
    # Calculate SHA256
    sha256 = hashlib.sha256()
    with open(archived_file, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha256.update(chunk)
    file_hash = sha256.hexdigest()
    
    # 3. Insert into ip_emojis
    db_image_path = f"D:\\san\\sanomni\\ip_archived/nuonuo/emojis/qiushoudong/{archived_filename}"
    emoji_id = str(uuid.uuid4())
    sort_order = idx + 1
    
    cursor.execute("""
        INSERT INTO ip_emojis (id, ip_id, pack_id, image_path, trigger_word, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (emoji_id, ip_id, pack_id, db_image_path, trigger_word, sort_order, now_iso))
    
    # 4. Insert into ip_images
    ip_img_id = f"ipimg_{secrets.token_hex(6)}"
    relative_path = f"ip_archived\\nuonuo\\emojis\\qiushoudong\\{archived_filename}"
    abs_path = os.path.abspath(archived_file)
    original_filename = f"{trigger_word}.jpg"
    
    cursor.execute("""
        INSERT INTO ip_images (
            id, filename, original_filename, ip_id, relative_path, absolute_path, 
            status, file_size, width, height, file_hash, format, 
            has_watermark, watermark_detected, watermark_removed, 
            created_at, imported_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        ip_img_id, archived_filename, original_filename, ip_id, relative_path, abs_path,
        'archived', file_size, 0, 0, file_hash, 'JPEG',
        0, 0, 0,
        now_iso, now_iso, now_iso
    ))
    
    cursor.execute("""
        INSERT INTO ip_image_relations (ip_image_id, ip_id, is_primary)
        VALUES (?, ?, ?)
    """, (ip_img_id, ip_id, 0))

# 5. Add Platform Info
platform_id = str(uuid.uuid4())
cursor.execute("SELECT id FROM ip_sticker_pack_platforms WHERE pack_id = ? AND platform_name = '微信'", (pack_id,))
if not cursor.fetchone():
    cursor.execute("""
        INSERT INTO ip_sticker_pack_platforms (
            id, pack_id, platform_name, pack_name_on_platform, 
            emoji_size_spec, status, publish_url, downloads_count, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        platform_id, pack_id, '微信', '糯糯知时节秋收冬', 
        '240x240', 'Published', '', 0, now_iso
    ))

# 6. Trigger Updates
cursor.execute("UPDATE ip_assets SET updated_at = ? WHERE id = ?", (now_iso, ip_id))
cursor.execute("UPDATE ip_sticker_packs SET updated_at = ? WHERE id = ?", (now_iso, pack_id))

conn.commit()
conn.close()
print("Autumn/Winter emojis successfully imported, archived, and platform info added.")
