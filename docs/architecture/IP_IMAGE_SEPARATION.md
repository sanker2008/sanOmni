# IP 图片表分离重构

## 概述

将 IP 形象管理域（sanIPBox）的图片从 Prompt 模板域（sanPromptBox）的 `images` 表中分离出来，创建独立的 `ip_images` 表。

## 变更日期

2026-05-26

## 问题背景

之前的设计中，`images` 表同时存储两个功能域的图片：
- `image_type = 'prompt'`：Prompt 模板域的图片
- `image_type = 'ip'`：IP 形象域的图片

这导致了以下问题：
1. **数据模型混乱**：两个独立的功能域共享同一张表，但它们的元数据需求不同
2. **字段冗余**：IP 图片不需要 `vendor_id`、`model_id`、`prompt` 等 Prompt 专属字段
3. **关联表混淆**：`image_ip_relations` 表用于关联 Prompt 图片和 IP 形象，容易与 IP 图片本身混淆
4. **未来拆分困难**：两个域可能在未来拆分为独立应用，共享表会增加拆分难度

## 解决方案

### 1. 数据库结构变更

#### 新增表：`ip_images`

```sql
CREATE TABLE IF NOT EXISTS ip_images (
    id                  TEXT PRIMARY KEY,
    filename            TEXT NOT NULL,
    original_filename   TEXT NOT NULL,
    ip_id               TEXT NOT NULL,              -- 关联的 IP 形象 ID
    relative_path       TEXT NOT NULL,
    absolute_path       TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'inbox',
    file_size           INTEGER,
    width               INTEGER,
    height              INTEGER,
    file_hash           TEXT,
    format              TEXT,
    has_watermark       INTEGER DEFAULT 0,
    watermark_platform  TEXT,
    watermark_detected  INTEGER DEFAULT 0,
    watermark_removed   INTEGER DEFAULT 0,
    created_at          TEXT NOT NULL,
    imported_at         TEXT NOT NULL,
    archived_at         TEXT,
    FOREIGN KEY (ip_id) REFERENCES ip_assets(id) ON DELETE CASCADE
);
```

**与 `images` 表的区别：**
- 移除了 `storage_vendor_id`、`storage_model_id`、`primary_model_id`（Prompt 专属）
- 移除了 `prompt`、`negative_prompt`（Prompt 专属）
- 添加了 `ip_id` 字段直接关联 IP 形象
- 移除了 `image_type` 字段（不再需要区分类型）

#### 新增表：`ip_image_tag_relations`

```sql
CREATE TABLE IF NOT EXISTS ip_image_tag_relations (
    ip_image_id  TEXT NOT NULL,
    tag_id       TEXT NOT NULL,
    PRIMARY KEY (ip_image_id, tag_id),
    FOREIGN KEY (ip_image_id) REFERENCES ip_images(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

#### 移除表：`image_ip_relations`

这个表原本用于关联 `images` 表中的图片和 IP 形象，现在不再需要。

#### 更新表：`images`

```sql
-- 移除 image_type 列（通过数据迁移后不再需要）
-- 所有 image_type = 'ip' 的记录已迁移到 ip_images 表
```

### 2. 数据迁移

在 `database/mod.rs` 中添加了 `migrate_ip_images()` 函数：

1. 检查是否存在旧的 `image_type` 列
2. 将所有 `image_type = 'ip'` 的记录迁移到 `ip_images` 表
3. 迁移相关的标签关联到 `ip_image_tag_relations` 表
4. 从 `images` 表中删除已迁移的记录
5. 删除 `image_ip_relations` 表

### 3. 代码结构变更

#### 新增文件

- **`src-tauri/src/commands/ip_images.rs`**：IP 图片管理命令
  - `import_ip_image`：导入 IP 图片
  - `get_ip_inbox_images`：获取 IP 收件箱图片
  - `get_ip_archived_images`：获取 IP 归档图片
  - `update_ip_image`：更新 IP 图片元数据
  - `delete_ip_image`：删除 IP 图片
  - `archive_ip_images`：归档 IP 图片

#### 更新文件

- **`src-tauri/src/models/mod.rs`**：
  - 移除 `Image` 结构体中的 `image_type` 字段
  - 新增 `IpImage` 结构体

- **`src-tauri/src/commands/images.rs`**：
  - 移除 `get_ip_inbox_images` 命令
  - 移除 `get_ip_archived_images` 命令
  - 移除所有 `image_type` 相关逻辑
  - 移除 `fetch_image_ips()` 辅助函数

- **`src-tauri/src/commands/ip_assets.rs`**：
  - 移除 `get_ip_characters_for_image` 命令
  - 移除 `set_ip_characters_for_image` 命令
  - 移除所有 `image_ip_relations` 相关代码

- **`src-tauri/src/commands/scanner.rs`**：
  - 移除 `cleanup_ip_inbox_directory` 命令
  - 移除 `scan_ip_archived_directory` 命令
  - 这些功能将在后续重新实现为 IP 图片专用的扫描器

- **`src-tauri/src/lib.rs`**：
  - 注册新的 IP 图片命令
  - 移除旧的 IP 相关命令

### 4. 前端适配（待完成）

前端需要更新以下部分：

1. **服务层（`src/services/tauri.ts`）**：
   - 更新 IP 图片相关的 API 调用
   - 使用新的命令名称（如 `import_ip_image` 而不是 `import_image` with `image_type: 'ip'`）

2. **状态管理（`src/stores/index.ts`）**：
   - 创建独立的 `useIpImageStore`（如果需要）
   - 或在现有的 IP store 中管理 IP 图片

3. **组件更新**：
   - `IpInboxView.tsx`：使用新的 IP 图片 API
   - `IpArchivedView.tsx`：使用新的 IP 图片 API
   - `IPManagementView.tsx`：更新图片选择和显示逻辑

## 数据域清晰划分

### Prompt 模板域（sanPromptBox）

**核心表：**
- `images`：Prompt 图片（带 vendor/model 元数据）
- `vendors`：AI 服务提供商
- `models`：AI 模型
- `image_model_relations`：图片-模型关联
- `prompt_groups`：Prompt 模板分组
- `image_prompt_group_relations`：图片-分组关联

**特点：**
- 图片与 AI 模型强关联
- 包含 prompt 和 negative_prompt 元数据
- 支持多模型关联

### IP 形象域（sanIPBox）

**核心表：**
- `ip_images`：IP 图片（带 IP 形象关联）
- `ip_assets`：IP 形象基础信息
- `ip_character_sheets`：IP 设定图（三视图等）
- `ip_emojis`：IP 表情包图片
- `ip_creations`：IP 创作图片
- `ip_sticker_packs`：表情包套件
- `ip_relations`：IP 形象关系

**特点：**
- 图片与 IP 形象强关联
- 不包含 AI 模型元数据
- 支持多种 IP 资产类型（设定图、表情、创作等）

### 共享资源

**共享表：**
- `tags`：标签（两个域共享）
- `image_tag_relations`：Prompt 图片标签关联
- `ip_image_tag_relations`：IP 图片标签关联

## 迁移影响

### 自动迁移

- 数据库初始化时自动执行迁移
- 旧数据会自动迁移到新表
- 迁移完成后删除旧的关联表

### 兼容性

- **向后兼容**：旧的数据库会自动升级
- **前端需要更新**：前端代码需要适配新的 API

### 回滚

如果需要回滚到旧版本：
1. 备份当前数据库
2. 使用旧版本的应用
3. 注意：新版本创建的 IP 图片数据会丢失

## 后续工作

1. **前端适配**：更新前端代码以使用新的 IP 图片 API
2. **扫描器重构**：为 IP 图片创建独立的扫描器命令
3. **文档更新**：更新相关技术文档和用户文档
4. **测试**：全面测试两个域的图片管理功能

## 优势

1. **清晰的数据模型**：两个域的数据完全分离，职责明确
2. **减少字段冗余**：每个表只包含必要的字段
3. **便于未来拆分**：如果需要将两个域拆分为独立应用，数据迁移会更简单
4. **提高可维护性**：代码和数据结构更清晰，易于理解和维护
5. **性能优化**：查询时不需要过滤 `image_type`，索引更高效

## 注意事项

1. **数据迁移是单向的**：一旦迁移完成，无法自动回滚到旧结构
2. **前端必须更新**：前端代码必须适配新的 API，否则 IP 图片功能会失效
3. **备份重要**：升级前建议备份数据库文件
