import os
import shutil
import sqlite3
import uuid
from datetime import datetime

source_dir = r"C:\Users\sanke\Desktop\nn"
sanip_dir = r"D:\san\sanomni\sanIP\表情包分组\糯糯知时节春生夏"
archived_dir = r"D:\san\sanomni\ip_archived\nuonuo\emojis\chunshengxia"
db_path = r"D:\san\sanomni\data\database.sqlite"

os.makedirs(sanip_dir, exist_ok=True)
os.makedirs(archived_dir, exist_ok=True)

emoji_mapping = [
    ("01 咬春纳福", "Slice_0001_R1-C1.jpg", "咬春纳福"),
    ("02 给您拜年", "Slice_0002_R1-C2.jpg", "给您拜年"),
    ("03 红包拿来", "Slice_0003_R1-C3.jpg", "红包拿来"),
    ("04 招财进宝", "Slice_0004_R1-C4.jpg", "招财进宝"),
    ("05 团团圆圆", "Slice_0005_R2-C1.jpg", "团团圆圆"),
    ("06 喜闹元宵", "Slice_0006_R2-C2.jpg", "喜闹元宵"),
    ("07 鸿运当头", "Slice_0007_R2-C3.jpg", "鸿运当头"),
    ("08 貌美如花", "Slice_0008_R2-C4.jpg", "貌美如花"),
    ("09 春日踏青", "Slice_0009_R3-C1.jpg", "春日踏青"),
    ("10 不动烟火", "Slice_0010_R3-C2.jpg", "不动烟火"),
    ("11 清明时节", "Slice_0011_R3-C3.jpg", "清明时节"),
    ("12 软糯青团", "Slice_0012_R3-C4.jpg", "软糯青团"),
    ("13 乘风破浪", "Slice_0013_R4-C1.jpg", "乘风破浪"),
    ("14 端午安康", "Slice_0014_R4-C2.jpg", "端午安康"),
    ("15 夏日炎炎", "Slice_0015_R4-C3.jpg", "夏日炎炎"),
    ("16 晒晒霉气", "Slice_0033_R1-C1.jpg", "晒晒霉气")
]

ip_id = 'eeddee2b-6c18-4d5f-a7ef-d633a4881461'
pack_id = '29d0804a-40e8-483f-8816-126b504f8f8e'

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

now_str = datetime.now().strftime("%Y-%m-%d-%H%M%S")

for idx, (display_name, filename, trigger_word) in enumerate(emoji_mapping):
    src_file = os.path.join(source_dir, filename)
    if not os.path.exists(src_file):
        print(f"Warning: {src_file} does not exist!")
        continue
    
    # 1. Copy to sanIP directory
    sanip_file = os.path.join(sanip_dir, f"{display_name}.jpg")
    shutil.copy2(src_file, sanip_file)
    print(f"Copied to {sanip_file}")
    
    # 2. Copy to ip_archived directory
    archived_filename = f"nuonuo-{now_str}-{idx:04d}.jpg"
    archived_file = os.path.join(archived_dir, archived_filename)
    shutil.copy2(src_file, archived_file)
    
    # 3. Insert into database
    # path in DB uses forward slashes mostly
    db_image_path = f"D:\\san\\sanomni\\ip_archived/nuonuo/emojis/chunshengxia/{archived_filename}"
    emoji_id = str(uuid.uuid4())
    sort_order = idx + 1
    created_at = datetime.utcnow().isoformat() + "Z"
    
    cursor.execute("""
        INSERT INTO ip_emojis (id, ip_id, pack_id, image_path, trigger_word, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (emoji_id, ip_id, pack_id, db_image_path, trigger_word, sort_order, created_at))
    print(f"Inserted DB record for {trigger_word}")

conn.commit()
conn.close()
print("Done!")
