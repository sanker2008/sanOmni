---
name: importing-sticker-pack-emojis
description: Use when importing emoji/sticker images into an IP sticker pack suite in sanOmni, given a source image directory, a platform screenshot showing emoji names, and a target pack name
---

# Importing Sticker Pack Emojis

## Overview

将本地表情图片批量导入 sanOmni 的 IP 表情包套件。整合文件复制、数据库写入、归档、平台信息和同步触发器为一个完整的自动化流程。

**核心原则：** 一次导入必须同时完成全部 6 个步骤，缺一不可。

## When to Use

- 用户提供了一个本地图片目录（源图片）
- 用户提供了平台截图（如微信表情开放平台），截图中显示了表情的编号和触发词名称
- 用户指定了要导入到的目标表情包套件名称
- 可能还会提供本地图片目录的截图用于文件名匹配

## Required Inputs

用户需要提供以下信息（直接告知或通过截图/图片）：

| 输入 | 说明 | 示例 |
|------|------|------|
| **数据根目录** | sanOmni 数据存储根路径 | `D:\san\sanomni` |
| **源图片目录** | 表情图片所在目录 | `C:\Users\sanke\Desktop\nn` |
| **平台截图** | 微信/其他平台表情列表截图 | 显示编号01-16及对应名称 |
| **目标套件名** | 要导入到的表情包套件全名 | `糯糯知时节春生夏` |
| **平台名称** | 发布平台名称 | `微信`（默认） |

如果用户未提供数据根目录，默认使用 `D:\san\sanomni`。

## Complete Import Workflow

**必须按顺序执行全部 6 步，缺一不可：**

### Step 1: 识别与匹配

1. 从平台截图中读取每个表情的**编号**和**触发词**（如：01 咬春纳福, 02 给您拜年...）
2. 列出源图片目录中的文件
3. 将图片文件名与表情编号/顺序一一对应
   - 文件名通常为 `Slice_XXXX_RY-CZ.jpg` 格式（PS 切片），按行列排序
   - 也可能是其他命名规则，需根据截图视觉对应

### Step 2: 查询数据库

```bash
# 查找目标 IP 和套件信息
sqlite3 <data_root>/data/database.sqlite "SELECT id, name, path FROM ip_assets;"
sqlite3 <data_root>/data/database.sqlite "SELECT id, ip_id, name, path FROM ip_sticker_packs;"
```

记录以下关键 ID：
- `ip_id` — IP 角色 ID
- `pack_id` — 表情包套件 ID  
- `ip_path` — IP 的 path 字段（如 `nuonuo`, `shengshushu`）
- `pack_path` — 套件的 path 字段（如 `chunshengxia`, `qiushoudong`）

### Step 3: 复制文件

对每个表情图片执行两次复制：

1. **sanIP 展示目录**：`<data_root>/sanIP/表情包分组/<套件名>/<编号 触发词>.jpg`
2. **归档目录**：`<data_root>/ip_archived/<ip_path>/emojis/<pack_path>/<ip_path>-<timestamp>-<idx>.jpg`

```
目录结构示例：
D:\san\sanomni\
├── sanIP\表情包分组\糯糯知时节春生夏\01 咬春纳福.jpg
└── ip_archived\nuonuo\emojis\chunshengxia\nuonuo-2026-06-16-225300-0000.jpg
```

### Step 4: 写入 ip_emojis 表

```sql
INSERT INTO ip_emojis (id, ip_id, pack_id, image_path, trigger_word, sort_order, created_at)
VALUES (<uuid>, <ip_id>, <pack_id>, <archived_absolute_path>, <trigger_word>, <sort_order>, <iso_timestamp>);
```

- `image_path` 使用归档目录的绝对路径，格式为 `D:\san\sanomni\ip_archived/<ip_path>/emojis/<pack_path>/<filename>`（注意使用混合斜杠风格以与现有数据一致：根路径用 `\`，子路径用 `/`）
- `sort_order` 从 1 开始递增
- `id` 使用标准 UUID v4

### Step 5: 写入 ip_images 表并关联

```sql
-- 归档到 IP 图库
INSERT INTO ip_images (
    id, filename, original_filename, ip_id, relative_path, absolute_path,
    status, file_size, width, height, file_hash, format,
    has_watermark, watermark_detected, watermark_removed,
    created_at, imported_at, archived_at
) VALUES (...);

-- 建立 IP 关联
INSERT INTO ip_image_relations (ip_image_id, ip_id, is_primary) VALUES (...);
```

关键字段说明：
- `id` 格式：`ipimg_<12位hex>`（使用 `secrets.token_hex(6)`）
- `status`：`'archived'`
- `file_hash`：SHA-256 哈希
- `format`：`'JPEG'` 或 `'PNG'`（根据实际格式）
- `relative_path`：`ip_archived\<ip_path>\emojis\<pack_path>\<filename>`
- `absolute_path`：完整绝对路径

### Step 6: 添加平台信息并触发更新

```sql
-- 添加平台发布信息（如果不存在）
INSERT INTO ip_sticker_pack_platforms (
    id, pack_id, platform_name, pack_name_on_platform,
    emoji_size_spec, status, publish_url, downloads_count, updated_at
) VALUES (<uuid>, <pack_id>, '微信', <套件名>, '240x240', 'Published', '', 0, <iso_timestamp>);

-- 触发 IP 和套件的更新记录（这会自动写入 sync_changelog）
UPDATE ip_assets SET updated_at = <iso_timestamp> WHERE id = <ip_id>;
UPDATE ip_sticker_packs SET updated_at = <iso_timestamp> WHERE id = <pack_id>;
```

微信表情规格默认 `240x240`，其他平台视情况调整。

## Implementation Script Template

将全部 6 步合并为一个 Python 脚本执行（放在 `scratch/` 目录中）：

```python
import os, shutil, sqlite3, uuid, secrets, hashlib
from datetime import datetime, timezone

# ===== 配置区域（每次导入修改此处） =====
SOURCE_DIR = r"C:\Users\sanke\Desktop\nn"       # 源图片目录
DATA_ROOT = r"D:\san\sanomni"                    # 数据根目录
DB_PATH = os.path.join(DATA_ROOT, "data", "database.sqlite")

IP_ID = "eeddee2b-6c18-4d5f-a7ef-d633a4881461"  # 从数据库查询得到
PACK_ID = "29d0804a-..."                          # 从数据库查询得到
IP_PATH = "nuonuo"                                # IP 的 path
PACK_PATH = "chunshengxia"                        # 套件的 path
PACK_NAME = "糯糯知时节春生夏"                      # 套件显示名
PLATFORM = "微信"                                  # 平台名称

# 表情映射：(展示名, 源文件名, 触发词)
EMOJI_MAPPING = [
    ("01 咬春纳福", "Slice_0001_R1-C1.jpg", "咬春纳福"),
    # ... 从截图中读取所有表情
]
# ===== 配置结束 =====

sanip_dir = os.path.join(DATA_ROOT, "sanIP", "表情包分组", PACK_NAME)
archived_dir = os.path.join(DATA_ROOT, "ip_archived", IP_PATH, "emojis", PACK_PATH)
os.makedirs(sanip_dir, exist_ok=True)
os.makedirs(archived_dir, exist_ok=True)

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()
now_str = datetime.now().strftime("%Y-%m-%d-%H%M%S")
now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

for idx, (display_name, filename, trigger_word) in enumerate(EMOJI_MAPPING):
    src = os.path.join(SOURCE_DIR, filename)
    if not os.path.exists(src):
        print(f"WARNING: {src} not found, skipping"); continue

    # Step 3: 复制文件
    shutil.copy2(src, os.path.join(sanip_dir, f"{display_name}.jpg"))
    arch_fn = f"{IP_PATH}-{now_str}-{idx:04d}.jpg"
    arch_path = os.path.join(archived_dir, arch_fn)
    shutil.copy2(src, arch_path)

    file_size = os.path.getsize(arch_path)
    sha = hashlib.sha256()
    with open(arch_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""): sha.update(chunk)
    file_hash = sha.hexdigest()
    ext = os.path.splitext(filename)[1].lower()
    fmt = "PNG" if ext == ".png" else "JPEG"

    # Step 4: ip_emojis
    db_img_path = f"{DATA_ROOT}\\ip_archived/{IP_PATH}/emojis/{PACK_PATH}/{arch_fn}"
    cursor.execute("""INSERT INTO ip_emojis (id, ip_id, pack_id, image_path, trigger_word, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (str(uuid.uuid4()), IP_ID, PACK_ID, db_img_path, trigger_word, idx + 1, now_iso))

    # Step 5: ip_images + ip_image_relations
    ip_img_id = f"ipimg_{secrets.token_hex(6)}"
    rel_path = f"ip_archived\\{IP_PATH}\\emojis\\{PACK_PATH}\\{arch_fn}"
    cursor.execute("""INSERT INTO ip_images (id, filename, original_filename, ip_id, relative_path, absolute_path,
        status, file_size, width, height, file_hash, format, has_watermark, watermark_detected, watermark_removed,
        created_at, imported_at, archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (ip_img_id, arch_fn, f"{trigger_word}.jpg", IP_ID, rel_path, os.path.abspath(arch_path),
         "archived", file_size, 0, 0, file_hash, fmt, 0, 0, 0, now_iso, now_iso, now_iso))
    cursor.execute("INSERT INTO ip_image_relations (ip_image_id, ip_id, is_primary) VALUES (?, ?, ?)",
        (ip_img_id, IP_ID, 0))

# Step 6: 平台信息 + 更新触发
cursor.execute("SELECT id FROM ip_sticker_pack_platforms WHERE pack_id=? AND platform_name=?", (PACK_ID, PLATFORM))
if not cursor.fetchone():
    cursor.execute("""INSERT INTO ip_sticker_pack_platforms (id, pack_id, platform_name, pack_name_on_platform,
        emoji_size_spec, status, publish_url, downloads_count, updated_at) VALUES (?,?,?,?,?,?,?,?,?)""",
        (str(uuid.uuid4()), PACK_ID, PLATFORM, PACK_NAME, "240x240", "Published", "", 0, now_iso))

cursor.execute("UPDATE ip_assets SET updated_at=? WHERE id=?", (now_iso, IP_ID))
cursor.execute("UPDATE ip_sticker_packs SET updated_at=? WHERE id=?", (now_iso, PACK_ID))
conn.commit(); conn.close()
print(f"Done! Imported {len(EMOJI_MAPPING)} emojis to '{PACK_NAME}' on {PLATFORM}")
```

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| 只写了 ip_emojis，没归档到 ip_images | 必须同时写入 ip_emojis 和 ip_images |
| 忘记添加 ip_image_relations | 每写一条 ip_images 必须写对应的 ip_image_relations |
| 没添加平台信息 | 必须写入 ip_sticker_pack_platforms |
| 没触发更新记录 | 必须 UPDATE ip_assets 和 ip_sticker_packs 的 updated_at |
| 只复制到了一个目录 | 必须同时复制到 sanIP/表情包分组 和 ip_archived |
| image_path 路径风格不一致 | 根路径 `\`，子路径 `/`，与现有数据保持一致 |

## Database Schema Quick Reference

```
ip_emojis: id, ip_id, pack_id, image_path, trigger_word, sort_order, created_at
ip_images: id, filename, original_filename, ip_id, relative_path, absolute_path, status, file_size, width, height, file_hash, format, has_watermark, watermark_platform, watermark_detected, watermark_removed, created_at, imported_at, archived_at
ip_image_relations: ip_image_id, ip_id, is_primary
ip_sticker_packs: id, ip_id, name, path, description, created_at, updated_at, cover_path, banner_path, icon_path, reward_guide_path, reward_thanks_path
ip_sticker_pack_platforms: id, pack_id, platform_name, pack_name_on_platform, emoji_size_spec, status, publish_url, downloads_count, updated_at
ip_assets: id, name, path, avatar_path, inspiration, description, created_at, updated_at
```

所有表均有 sync trigger，INSERT/UPDATE/DELETE 会自动写入 `sync_changelog`。
