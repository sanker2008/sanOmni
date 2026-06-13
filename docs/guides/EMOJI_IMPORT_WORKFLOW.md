# sanOmni 表情包本地批量导入标准流程 (SOP)

由于绕过 Tauri 客户端直接使用 Python 脚本修改底层 SQLite 数据库容易出现关联遗漏和状态不一致的情况，特记录此完整的标准导入流程（Standard Operating Procedure）。后续如果再次需要处理本地大批量的表情包映射导入，请**严格按照此文档中的步骤**进行，确保不会遗漏任何表关联以及同步逻辑。

## 1. 明确关联对象与变量定义
在执行任何操作前，必须确认以下核心标识符：
- **目标 IP ID (`ip_id`)**：表情所属的 IP 形象 ID。
- **目标套件 ID (`pack_id`)**：表情归属的“表情包套件” ID。
- **本地素材路径 (`source_dir`)**：原始图（例如 `Slice_xxx.jpg`）所在的目录。
- **系统存档路径 (`target_dir`)**：Tauri 设定下的标准存放目录，如 `D:\san\sanomni\ip_archived\{ip_name}\emojis\{pack_name}`。

## 2. 建立精准的映射字典 (Mapping)
根据视觉特征，确定无序的素材图如何对应到目标表情，要求提取对应的排序与触发词：
```python
mapping = {
    # 原始文件名: "排序号 触发词.后缀"
    "Slice_0027_R3-C3.jpg": "01 语塞.jpg",
    "Slice_0026_R3-C2.jpg": "02 快上菜.jpg",
    # ...
}
```

## 3. 数据库表联级插入规范 (核心防错区)
向数据库插入数据时，**必须且至少涵盖以下 3 张表**，遗漏任何一张都会导致前端显示异常。

### 3.1 写入 `ip_images` (图像基础表)
- **踩坑点 1 (大小写敏感)**：`status` 字段必须是**小写的 `"archived"`**。SQLite 区分大小写，若写成大写 `"ARCHIVED"` 会导致客户端在加载图库时被过滤。
- **踩坑点 2 (字段对齐)**：确保和客户端当前的 schema 完全一致（含 `imported_at`, `archived_at` 等）。
```python
cursor.execute("""
    INSERT INTO ip_images (
        id, filename, original_filename, ip_id,
        relative_path, absolute_path, status, file_size, format,
        has_watermark, watermark_detected, watermark_removed,
        created_at, imported_at, archived_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'archived', ?, ?, 0, 0, 0, ?, ?, ?)
""", (...))
```

### 3.2 写入 `ip_emojis` (表情业务表)
将 `trigger_word`（触发词）和 `sort_order`（序号）与图像绑定，以确保套件内渲染正确：
```python
cursor.execute("""
    INSERT INTO ip_emojis (
        id, ip_id, pack_id, image_path, trigger_word, sort_order, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
""", (...))
```

### 3.3 写入 `ip_image_relations` (IP 资产关联表)
- **踩坑点 3 (图库关联遗漏)**：即便 `ip_images` 表里有 `ip_id`，如果不在关系表 `ip_image_relations` 中建立绑定关系，Tauri 前端的 `get_ip_archived_images` 接口依然不会将其纳为该 IP 的归档图库。
```python
cursor.execute("""
    INSERT INTO ip_image_relations (ip_image_id, ip_id, is_primary)
    VALUES (?, ?, 0)
""", (ip_image_id, ip_id))
```

## 4. 同步引擎对齐 (Sync Engine)
sanOmni 具有多端同步引擎，如果直接通过 Python 连接 SQLite 操作，Tauri 主程序运行时的**SQLite Trigger 可能未被加载或未被跨进程触发**。
为了确保导入的表情能够被云端同步：
1. **优先方案**：通过调用 Tauri 提供给前端的 `ipImageApi.addEmojis` API 进行导入。
2. **脚本方案（本次使用）**：在 Python 脚本执行完成后，**必须生成 `sync_changelog` 日志**，或者确保数据库级触发器 (Trigger) 是持久化挂载的，让它自动捕获 `INSERT`。

```python
# 补全同步日志的代码示例：
data_json = f'{{"id":"{emoji_id}","ip_id":"{ip_id}", ... }}'
cursor.execute("INSERT INTO sync_changelog (table_name, record_id, operation, data_json) VALUES ('ip_emojis', ?, 'INSERT', ?)", (emoji_id, data_json))
```

## 总结自查 Checklist
- [x] 拷贝后的图片路径是否符合格式？
- [x] `ip_images.status` 是否是小写的 `"archived"`？
- [x] 是否已向 `ip_image_relations` 添加了 `ip_image_id` 与 `ip_id` 的关联？
- [x] 新增的数据是否触发了 `sync_changelog` 同步增量日志？
