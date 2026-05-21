# AI 图片管理系统 - 完整落地方案

> 用于管理 ChatGPT、Gemini、Midjourney 等平台生成的 AI 图片

---

## 一、技术选型

### 桌面应用 vs 网页应用

| 维度 | 桌面应用 (Tauri) | 网页应用 |
|------|-----------------|---------|
| 文件系统访问 | 直接读写本地文件 | 受限，需用户手动选择 |
| 批量重命名 | 直接操作文件系统 | 需下载后处理 |
| 文件夹监控 | 原生支持，可自动导入 | 无法实现 |
| 离线使用 | 完全离线可用 | 可做成 PWA |
| 跨平台 | Windows/Mac/Linux | 任意浏览器 |

**结论：推荐 Tauri 桌面应用**

### 技术栈

| 组件 | 选择 | 理由 |
|------|------|------|
| 框架 | Tauri 2.x | 体积小（~5MB vs Electron ~150MB）、性能好 |
| 前端 | React 18 + TypeScript | 生态成熟 |
| 样式 | Tailwind CSS | 快速开发 |
| 数据库 | SQLite | 轻量、本地优先 |
| 图片处理 | image 库 (Rust) | 生成缩略图速度快 |
| 文件监控 | notify 库 (Rust) | 跨平台文件系统监听 |
| 状态管理 | Zustand | 简洁高效 |
| 去水印 | LaMa 模型 (ONNX) | 本地运行，无需联网 |

---

## 二、目录结构

所有目录和文件名均使用**英文小写 + 连字符**，不使用中文、空格或特殊字符，确保兼容 Web 服务器、URL 路径和所有操作系统。

```
san-media-box/
├── inbox/                                # 收件箱 - 未处理的图片
│   ├── openai/                           # 按检测到的来源预分类
│   ├── google/
│   ├── midjourney/
│   ├── unknown/                          # 无法识别的来源
│   └── .inbox-metadata.json             # 收件箱元数据缓存
│
├── archived/                             # 已归档 - 正式存储
│   ├── openai/
│   │   ├── gpt-image-2/
│   │   ├── gpt-image-1/
│   │   └── dalle-3/
│   ├── google/
│   │   ├── nano-banana/                  # Gemini 2.5 Flash Image
│   │   ├── nano-banana-pro/              # Gemini 3 Flash Image
│   │   ├── imagen-3/                     # 专业 API（如使用）
│   │   └── imagen-4/
│   ├── midjourney/
│   │   ├── v6/
│   │   └── v5/
│   ├── stability-ai/
│   │   ├── sdxl/
│   │   └── sd-3/
│   └── black-forest-labs/
│       ├── flux-1/
│       └── flux-pro/
│
├── exports/                              # 导出目录（分享用）
│
├── thumbnails/                           # 缩略图缓存
│
└── data/
    └── database.sqlite                   # 主数据库
```

### 命名规范

| 类型 | 规则 | 示例 |
|------|------|------|
| 厂商目录 | 小写，连字符 | `openai`, `stability-ai` |
| 模型目录 | 小写，连字符 | `gpt-image-2`, `nano-banana` |
| 功能目录 | 简单英文 | `inbox`, `archived`, `exports` |
| 图片文件名 | 基于模板 | `openai-gpt-image-2-2024-01-15-001.png` |

### 文件命名模板

可用变量：

| 变量 | 示例输出 | 说明 |
|------|---------|------|
| `{vendor}` | `openai` | 厂商 ID |
| `{model}` | `gpt-image-2` | 主模型 ID |
| `{date}` | `2024-01-15` | 日期（YYYY-MM-DD） |
| `{timestamp}` | `20240115-143052` | 完整时间戳 |
| `{year}` | `2024` | 年份 |
| `{month}` | `01` | 月份 |
| `{day}` | `15` | 日期 |
| `{index}` | `001` | 3 位序号 |
| `{random}` | `a3f7k2` | 6 位随机字符串 |
| `{original}` | `download` | 清理后的原始文件名 |
| `{tags}` | `cat-cute-sunset` | 标签（连字符连接） |

预设模板：

| 模板名 | 模板 | 示例输出 |
|--------|------|---------|
| 简洁版 | `{vendor}-{model}-{date}-{index}` | `openai-gpt-image-2-2024-01-15-001.png` |
| 详细版 | `{vendor}-{model}-{timestamp}-{random}` | `openai-gpt-image-2-20240115-143052-a3f7k2.png` |
| 日期优先 | `{date}-{vendor}-{model}-{index}` | `2024-01-15-openai-gpt-image-2-001.png` |
| 带标签 | `{date}-{tags}-{index}` | `2024-01-15-cat-cute-sunset-001.png` |

---

## 三、数据库设计

### 实体关系

```
vendors 1──N models
models  N──M images (通过 image_model_relations)
images  N──M tags   (通过 image_tag_relations)
images  1──N processing_history
```

### 完整 Schema (SQLite)

```sql
-- 厂商表
CREATE TABLE vendors (
    id          TEXT PRIMARY KEY,          -- 'openai', 'google'
    name        TEXT NOT NULL,            -- 显示名称：'OpenAI'
    path        TEXT NOT NULL UNIQUE,     -- 目录名：'openai'
    icon        TEXT,                     -- 图标标识
    sort_order  INTEGER DEFAULT 0,         -- 显示顺序
    is_active   BOOLEAN DEFAULT 1,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- 模型表
CREATE TABLE models (
    id          TEXT PRIMARY KEY,          -- 'gpt-image-2', 'nano-banana'
    vendor_id   TEXT NOT NULL,
    name        TEXT NOT NULL,             -- 显示名称：'GPT Image 2'
    path        TEXT NOT NULL,             -- 目录名：'gpt-image-2'
    version     TEXT,                      -- '2', '3', 'v6'
    description TEXT,                      -- 额外描述
    sort_order  INTEGER DEFAULT 0,
    is_active   BOOLEAN DEFAULT 1,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- 图片表（核心）
CREATE TABLE images (
    id                  TEXT PRIMARY KEY,   -- 唯一 ID：'img_a3f7k2m9'
    filename            TEXT NOT NULL,      -- 当前文件名
    original_filename   TEXT NOT NULL,      -- 原始下载名

    -- 物理存储位置（单一路径）
    storage_vendor_id   TEXT NOT NULL,      -- 存储目录的厂商
    storage_model_id    TEXT NOT NULL,      -- 存储目录的模型
    relative_path       TEXT NOT NULL,      -- 'google/nano-banana/xxx.png'
    absolute_path       TEXT NOT NULL,      -- 完整文件系统路径

    -- 主模型（决定存储目录）
    primary_model_id    TEXT NOT NULL,

    -- 状态
    status              TEXT NOT NULL DEFAULT 'inbox',
        -- 'inbox'    : 在收件箱，未处理
        -- 'tagged'   : 有元数据但未归档
        -- 'archived' : 已移动到归档目录

    -- 内容
    prompt              TEXT,               -- 生成提示词
    negative_prompt     TEXT,               -- 负面提示词（如有）

    -- 文件信息
    file_size           INTEGER,            -- 字节数
    width               INTEGER,
    height              INTEGER,
    file_hash           TEXT,               -- SHA256 用于去重
    format              TEXT,               -- 'png', 'jpg', 'webp'

    -- 水印信息
    has_watermark       BOOLEAN DEFAULT 0,
    watermark_platform  TEXT,               -- 'google', 'openai' 等
    watermark_detected  BOOLEAN DEFAULT 0,
    watermark_removed   BOOLEAN DEFAULT 0,

    -- 时间戳
    created_at          TEXT NOT NULL,      -- 图片生成时间
    imported_at         TEXT NOT NULL,      -- 导入时间
    archived_at         TEXT,               -- 归档时间

    FOREIGN KEY (storage_vendor_id) REFERENCES vendors(id),
    FOREIGN KEY (storage_model_id) REFERENCES models(id),
    FOREIGN KEY (primary_model_id) REFERENCES models(id)
);

-- 图片-模型关联表（多对多）
CREATE TABLE image_model_relations (
    image_id     TEXT NOT NULL,
    model_id     TEXT NOT NULL,
    is_primary   BOOLEAN DEFAULT 0,        -- true = 主模型，文件存此目录
    PRIMARY KEY (image_id, model_id),
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
);

-- 标签表
CREATE TABLE tags (
    id          TEXT PRIMARY KEY,           -- 'cat', 'cute-sunset'
    name        TEXT NOT NULL,              -- 显示名称（可用中文）
    name_en     TEXT,                       -- 英文名（用于路径）
    color       TEXT,                       -- UI 颜色：'#FF6B6B'
    parent_id   TEXT,                       -- 父标签（层级）
    use_count   INTEGER DEFAULT 0,          -- 使用次数统计
    is_builtin  BOOLEAN DEFAULT 0,          -- 系统预设 vs 用户创建
    created_at  TEXT NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES tags(id) ON DELETE SET NULL
);

-- 图片-标签关联表
CREATE TABLE image_tag_relations (
    image_id     TEXT NOT NULL,
    tag_id       TEXT NOT NULL,
    PRIMARY KEY (image_id, tag_id),
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- 处理历史
CREATE TABLE processing_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id    TEXT NOT NULL,
    action      TEXT NOT NULL,
        -- 'import', 'auto_classify', 'tag', 'archive',
        -- 'detect_watermark', 'remove_watermark', 'rename', 'move'
    status      TEXT NOT NULL,              -- 'success', 'failed', 'skipped'
    details     TEXT,                       -- 额外信息或错误消息
    created_at  TEXT NOT NULL,
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
);

-- 设置（键值对）
CREATE TABLE settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- 索引
CREATE INDEX idx_images_status ON images(status);
CREATE INDEX idx_images_storage ON images(storage_vendor_id, storage_model_id);
CREATE INDEX idx_images_primary_model ON images(primary_model_id);
CREATE INDEX idx_images_imported ON images(imported_at DESC);
CREATE INDEX idx_images_file_hash ON images(file_hash);

CREATE INDEX idx_imr_model ON image_model_relations(model_id);
CREATE INDEX idx_imr_image ON image_model_relations(image_id);
CREATE INDEX idx_imr_primary ON image_model_relations(is_primary);

CREATE INDEX idx_itr_tag ON image_tag_relations(tag_id);
CREATE INDEX idx_itr_image ON image_tag_relations(image_id);

CREATE INDEX idx_tags_parent ON tags(parent_id);
CREATE INDEX idx_tags_use_count ON tags(use_count DESC);

CREATE INDEX idx_history_image ON processing_history(image_id);
CREATE INDEX idx_history_created ON processing_history(created_at DESC);
```

### 关键设计：多模型归属

当一张图片关联多个模型时（如同时用了 nano-banana 和 nano-banana-pro）：

- **物理文件**：只存储在一个目录中（由**主模型**决定）
- **数据库**：`image_model_relations` 记录所有关联的模型
- **查询**：浏览任意模型视图时，通过 JOIN 找到所有关联图片
- **界面提示**：物理存储在其他目录的图片显示链接图标

```
示例：
  文件名：google-nano-banana-2024-01-15-001.png
  - 物理位置：archived/google/nano-banana/
  - 主模型：nano-banana
  - 关联模型：[nano-banana, nano-banana-pro]

  浏览 "nano-banana-pro" 视图时：
  - 这张图片会出现在结果中
  - 显示提示："实际存储在 nano-banana 目录"
```

### 主模型选择策略

用户选择多个模型时：

1. 用户可以显式设置主模型（推荐）
2. 默认规则：版本号高者优先，相同版本按字母序
3. 主模型可以后续修改（会触发文件移动 + 重命名）

---

## 四、厂商与模型配置

### 理解模型体系

**Google 有两条独立的图像生成产品线：**

| 产品线 | 模型 | 用途 |
|--------|------|------|
| **Imagen**（专业 API） | Imagen 3, Imagen 4 | Google AI Studio / API 调用 |
| **Nano Banana**（Gemini 内置） | Nano Banana = Gemini 2.5 Flash Image, Nano Banana Pro = Gemini 3 Flash Image | 直接在 Gemini 对话中生成 |

> 大多数用户通过 Gemini 对话生成图片，因此使用的是 **Nano Banana** 模型，而非 Imagen。

### 预设厂商配置

```typescript
const defaultVendors = [
  {
    id: 'openai',
    name: 'OpenAI',
    path: 'openai',
    models: [
      { id: 'gpt-image-2', name: 'GPT Image 2', path: 'gpt-image-2', version: '2' },
      { id: 'gpt-image-1', name: 'GPT Image 1', path: 'gpt-image-1', version: '1' },
      { id: 'dalle-3', name: 'DALL-E 3', path: 'dalle-3', version: '3' },
    ]
  },
  {
    id: 'google',
    name: 'Google',
    path: 'google',
    models: [
      // Gemini 内置（最常用）
      { id: 'nano-banana', name: 'Nano Banana', path: 'nano-banana',
        description: 'Gemini 2.5 Flash Image' },
      { id: 'nano-banana-pro', name: 'Nano Banana Pro', path: 'nano-banana-pro',
        description: 'Gemini 3 Flash Image' },
      // 专业 API
      { id: 'imagen-3', name: 'Imagen 3', path: 'imagen-3', version: '3',
        description: '专业 API 模型' },
      { id: 'imagen-4', name: 'Imagen 4', path: 'imagen-4', version: '4',
        description: '专业 API 模型' },
    ]
  },
  {
    id: 'midjourney',
    name: 'Midjourney',
    path: 'midjourney',
    models: [
      { id: 'midjourney-v6', name: 'Midjourney V6', path: 'v6', version: '6' },
      { id: 'midjourney-v5', name: 'Midjourney V5', path: 'v5', version: '5' },
    ]
  },
  {
    id: 'stability-ai',
    name: 'Stability AI',
    path: 'stability-ai',
    models: [
      { id: 'sdxl', name: 'Stable Diffusion XL', path: 'sdxl' },
      { id: 'sd-3', name: 'Stable Diffusion 3', path: 'sd-3', version: '3' },
    ]
  },
  {
    id: 'black-forest-labs',
    name: 'Black Forest Labs',
    path: 'black-forest-labs',
    models: [
      { id: 'flux-1', name: 'Flux.1', path: 'flux-1', version: '1' },
      { id: 'flux-pro', name: 'Flux Pro', path: 'flux-pro' },
    ]
  },
];
```

### 厂商管理功能

- 添加自定义厂商和模型
- 启用/禁用厂商（隐藏而不删除）
- 调整厂商显示顺序
- 编辑厂商/模型名称（路径不变以保持稳定性）

---

## 五、分类与标签系统

### 设计理念

| 维度 | 分类（厂商 + 模型） | 标签 |
|------|-------------------|------|
| 性质 | 结构性，层级 | 描述性，平铺 |
| 选择 | 单选（一个主分类） | 多选，自由形式 |
| 用途 | 决定文件存储路径 | 支持搜索和筛选 |
| 管理 | 预设 + 用户可添加 | 完全自由，自动建议 |
| 示例 | Google > Nano Banana | 小猫、写实、赛博朋克 |

### 标签系统设计

标签使用**英文 ID** 用于路径/文件，**显示名称** 可用任意语言：

```typescript
interface Tag {
  id: string;           // 英文 ID：'cat', 'cyberpunk'
  name: string;         // 显示名称：'小猫'，'赛博朋克'
  nameEn: string;       // 英文名：'Cat'，'Cyberpunk'
  color: string;        // UI 颜色：'#FF6B6B'
  parentId?: string;    // 父标签（层级）
}
```

### 预设标签

```
Animal（动物）
├── Cat（小猫）
├── Dog（小狗）
├── Bird（鸟）
└── Fish（鱼）

Nature（自然）
├── Landscape（风景）
├── Sunset（日落）
├── Ocean（海洋）
└── Mountain（山）

Style（风格）
├── Realistic（写实）
├── Anime（动漫）
├── Cyberpunk（赛博朋克）
├── Oil Painting（油画）
└── Watercolor（水彩）

Character（人物）
├── Portrait（肖像）
├── Group（群像）
└── Fantasy（奇幻）

Object（物品）
├── Architecture（建筑）
├── Food（食物）
├── Vehicle（交通工具）
└── Technology（科技）

Color（色彩）
├── Warm Tone（暖色调）
├── Cool Tone（冷色调）
├── Monochrome（黑白）
└── Vibrant（鲜艳）

Composition（构图）
├── Close-up（特写）
├── Wide Angle（广角）
├── Bird's Eye（俯视）
└── Symmetry（对称）
```

### 标签功能

- **自动建议**：输入时搜索已有标签，显示匹配项
- **最近标签**：显示最近使用过的标签
- **标签云**：可视化展示所有标签，大小基于使用频率
- **批量打标签**：选中多张图片，一次性添加标签
- **标签筛选**：点击任意标签过滤图片
- **组合筛选**：选择多个标签进行 AND/OR 筛选

---

## 六、收件箱与归档工作流

### 工作流程

```
下载/生成图片
        │
        ▼
┌───────────────┐
│  导入到收件箱  │  拖拽导入 / 文件夹监控 / 手动选择
│               │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  自动预分类    │  根据文件名/EXIF 猜测来源
│  （可选）     │  放入 inbox/openai/ 或 inbox/google/
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  打标签分类    │  选择厂商、模型（可多选）、输入 prompt、添加标签
│               │  可单张处理或批量处理
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  一键归档      │  移动文件到 archived/{厂商}/{模型}/
│               │  按模板重命名文件
│               │  更新数据库记录
└───────────────┘
```

### 图片状态流转

```
[inbox] ──打标签──> [tagged] ──归档──> [archived]
                          │                    │
                          └── 编辑 ───────────┘
                                              │
                                   └── 重新归档（更换模型）
```

| 状态 | 图标 | 位置 | 可执行操作 |
|------|------|------|-----------|
| 未处理 | 🆕 | inbox/ | 编辑信息、删除 |
| 已标记 | 🏷️ | inbox/ | 归档、继续编辑 |
| 已归档 | ✅ | archived/ | 查看、重新归档、打开位置 |

### 自动预分类规则

```typescript
const classifyRules = [
  // Google / Gemini
  { pattern: /gemini|imagen/i,           vendor: 'google',    confidence: 0.9 },
  { pattern: /nano.?banana/i,            vendor: 'google',    model: 'nano-banana', confidence: 0.95 },

  // OpenAI
  { pattern: /dall.?e|dalle/i,           vendor: 'openai',    model: 'dalle-3', confidence: 0.9 },
  { pattern: /gpt.?image|gpt4o/i,        vendor: 'openai',    confidence: 0.8 },

  // Midjourney
  { pattern: /midjourney|mj_/i,          vendor: 'midjourney', confidence: 0.9 },

  // Stability AI
  { pattern: /stable.?diffusion|sdxl/i,  vendor: 'stability-ai', confidence: 0.8 },
  { pattern: /sd3|sd-3/i,                vendor: 'stability-ai', model: 'sd-3', confidence: 0.8 },

  // Flux
  { pattern: /flux/i,                    vendor: 'black-forest-labs', confidence: 0.8 },
];
```

### 归档逻辑

```typescript
async function archiveImages(imageIds: string[]) {
  const results = { success: 0, skipped: 0, failed: 0 };

  for (const id of imageIds) {
    const image = await db.getImage(id);

    // 验证必填字段
    if (!image.vendorId || image.modelIds.length === 0) {
      results.skipped++;
      continue;
    }

    // 确定目标目录
    const vendor = await db.getVendor(image.storageVendorId);
    const primaryModel = await db.getModel(image.primaryModelId);
    const targetDir = path.join(
      config.rootDir,
      'archived',
      vendor.path,
      primaryModel.path
    );

    // 确保目录存在
    await fs.ensureDir(targetDir);

    // 根据模板生成新文件名
    const newFilename = applyNamingTemplate(config.namingTemplate, {
      vendor: vendor.path,
      model: primaryModel.path,
      date: formatDate(image.createdAt),
      index: image.sequenceNumber,
      // ... 其他变量
    });

    // 移动文件
    const sourcePath = image.absolutePath;
    const targetPath = path.join(targetDir, newFilename);

    try {
      await fs.move(sourcePath, targetPath, { overwrite: false });

      // 更新数据库
      await db.updateImage(id, {
        filename: newFilename,
        relativePath: `archived/${vendor.path}/${primaryModel.path}/${newFilename}`,
        absolutePath: targetPath,
        status: 'archived',
        archivedAt: new Date().toISOString(),
      });

      // 记录历史
      await db.addHistory(id, 'archive', 'success',
        `Moved to ${vendor.path}/${primaryModel.path}/`);

      results.success++;
    } catch (err) {
      await db.addHistory(id, 'archive', 'failed', err.message);
      results.failed++;
    }
  }

  return results;
}
```

### 重新归档（更换主模型）

当用户修改已归档图片的主模型时：

1. 将物理文件从旧目录移动到新目录
2. 如果命名模板包含模型，则重命名文件
3. 更新 `storage_vendor_id`、`storage_model_id`、`primary_model_id`
4. 更新 `image_model_relations.is_primary` 标志
5. 在处理历史中记录变更

---

## 七、水印管理

### 各平台水印特征

| 平台 | 可见水印 | 隐形水印 | 检测方式 |
|------|---------|---------|---------|
| Gemini (Nano Banana) | 有 - 右下角 | 有 - SynthID | 图像识别 + 元数据 |
| DALL-E 3 | 有 - 彩色点 | 有 - C2PA 元数据 | 角落像素检测 + EXIF |
| GPT-4o / GPT Image | 无 | 无 | 无需检测 |
| Midjourney | 无 | 有 | 仅元数据 |
| Imagen (API) | 无 | 有 - SynthID | 仅元数据 |

### 水印检测流程

```
图片导入
    │
    ▼
自动检测水印
    │
    ├── 检测到 Gemini 水印 ──→ 标记"有水印"
    │                          推荐"Gemini 专用去除算法"
    │
    ├── 检测到 DALL-E 水印 ──→ 标记"有水印"
    │                          推荐"通用修复"
    │
    ├── 未检测到水印 ────────→ 标记"无可见水印"
    │
    └── 不确定 ─────────────→ 标记"待确认"
                               提示用户手动检查
```

### 水印去除方案

| 方法 | 适用目标 | 质量 | 速度 | 离线 |
|------|---------|------|------|------|
| Gemini 专用算法 | Gemini 水印 | 优秀 | 快 | 是（本地模型） |
| LaMa 修复 | 通用水印 | 良好 | 中等 | 是（ONNX 运行时） |
| Stable Diffusion 修复 | 复杂水印 | 最佳 | 慢 | 是（本地模型） |

### 批量去水印向导

```
批量去水印向导
┌─────────────────────────────────────────┐
│  步骤 1：选择图片                         │
│  [所有有水印的图片（23张）]              │
│  [手动选择...]                           │
│                                          │
│  步骤 2：选择算法                        │
│  ○ 自动检测每张图片（推荐）              │
│  ○ Gemini 专用                           │
│  ○ 通用（LaMa）                          │
│                                          │
│  步骤 3：输出设置                        │
│  ○ 保存为新版本（推荐）                  │
│  ○ 覆盖原图（不可逆！）                 │
│                                          │
│  步骤 4：确认                            │
│  预览每张图片处理前/后                    │
│                                          │
│  [开始处理]                              │
│                                          │
│  进度：████████░░░░ 16/23               │
│  当前：IMG_001.png - 处理中...          │
└─────────────────────────────────────────┘
```

### 安全原则

1. **永不覆盖原图** - 始终保存为新版本
2. **处理前自动备份** - 创建备份副本
3. **质量评估** - 自动评分，标记低质量输出
4. **支持撤销** - 可随时还原到原图
5. **完整审计追踪** - 每项操作都记录在 processing_history

---

## 八、核心功能汇总

### 8.1 厂商与模型管理
- 预配置常见厂商（OpenAI、Google、Midjourney 等）
- 添加/编辑/禁用自定义厂商和模型
- 模型描述说明（如"Nano Banana = Gemini 2.5 Flash Image"）

### 8.2 图片导入
- **拖拽导入**：直接将文件/文件夹拖入应用
- **文件夹监控**：监控指定目录，新文件自动导入
- **手动选择**：浏览并选择文件
- **智能检测**：根据文件名自动预分类来源

### 8.3 收件箱管理
- 统一收件箱存放所有未处理图片
- 按状态筛选：全部 / 未标记 / 已标记 / 无法识别
- 快速编辑面板用于打标签和分类
- 批量操作：选中多张、批量打标签、批量归档

### 8.4 标签系统
- 自由形式标签，支持自动建议
- 层级化标签分类
- 标签云可视化展示
- 最近标签和常用标签
- 批量添加标签

### 8.5 批量重命名
- 基于模板的可配置命名规则
- 应用前实时预览
- 批量应用到选中图片
- 支持撤销

### 8.6 归档整理
- 一键归档到有序目录结构
- 根据厂商/模型自动移动文件
- 重新归档支持（更换主模型）
- 可配置的路径和命名模板

### 8.7 水印管理
- 自动检测平台水印
- 手动标记能力
- 算法选择的批量水印去除
- 处理前/后预览对比
- 去除结果质量评估

### 8.8 浏览与搜索
- 按厂商 > 模型树形导航
- 全文搜索（prompt、标签、文件名）
- 多条件筛选（厂商、模型、标签、日期范围、水印状态）
- 缩略图网格和列表视图
- 图片详情面板展示元数据

### 8.9 图片详情视图
- 完整尺寸预览
- 厂商和模型展示（多模型徽章）
- Prompt 显示和编辑
- 标签管理
- 水印状态和去除操作
- 处理历史时间线
- 打开文件位置
- 版本对比（原图 vs 去水印版本）

---

## 九、界面布局设计

### 主窗口

```
┌──────────────────────────────────────────────────────────────┐
│  🔍 搜索...                        [收件箱 23] [已归档 156]   │
├──────────┬───────────────────────────────────────────────────┤
│          │  📥 收件箱                                         │
│  厂商树   │                                                    │
│          │  筛选：[全部 23] [未标记 5] [已标记 18] [?] 2]   │
│  ▶ OpenAI│                                                    │
│  ▶ Google│  快速操作：                                        │
│  ▶ Midj. │  [全选] [批量打标签] [归档已标记]                   │
│          │                                                    │
│  标签云   │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │
│          │  │  🖼️    │ │  🖼️    │ │  🖼️    │ │  🖼️    │     │
│  小猫(12)│  │        │ │        │ │        │ │        │     │
│  狗(8)   │  │ 🆕     │ │ 🏷️     │ │ 🏷️     │ │ 🚫     │     │
│  ...     │  │ IMG_01 │ │ IMG_02 │ │ IMG_03 │ │ IMG_04 │     │
│          │  │        │ │        │ │        │ │        │     │
│          │  └────────┘ └────────┘ └────────┘ └────────┘     │
│          │                                                    │
└──────────┴───────────────────────────────────────────────────┘
```

### 图片详情面板（右侧边栏或弹窗）

```
┌─────────────────────────────┐
│  [大图预览]                  │
│                              │
│  厂商：Google                │
│  模型：Nano Banana ✏️       │
│         Nano Banana Pro ✏️   │
│                              │
│  标签：小猫 🏷️ 可爱 🏷️ ✏️   │
│                              │
│  Prompt：                   │
│  ┌─────────────────────┐   │
│  │ a cute cat sitting  │   │
│  │ on a sunny...       │   │
│  └─────────────────────┘   │
│                              │
│  水印：🔴 检测到              │
│  平台：Gemini                │
│  [去除水印]                  │
│                              │
│  历史：                      │
│  2024-01-15 导入             │
│  2024-01-15 自动分类         │
│                              │
│  [打开目录] [重命名] [删除]  │
└─────────────────────────────┘
```

### 快速编辑弹窗

```
┌─────────────────────────────────────────┐
│  编辑图片信息                        [×] │
├─────────────────────────────────────────┤
│                                          │
│  [图片预览]                              │
│                                          │
│  厂商：[Google ▼]                        │
│                                          │
│  模型：☑ Nano Banana  [★ 主模型]        │
│         ☑ Nano Banana Pro               │
│         [+ 添加模型...]                   │
│                                          │
│  Prompt：                                │
│  ┌─────────────────────────────────┐   │
│  │ a cute cat sitting on a...       │   │
│  └─────────────────────────────────┘   │
│  [从剪贴板粘贴]                          │
│                                          │
│  标签：[小猫 ×] [可爱 ×] [+ 添加]        │
│                                          │
│  水印：○ 无  ● Gemini                    │
│                                          │
│  ┌──────────────┐  ┌────────────────┐  │
│  │ 仅保存        │  │ 保存并归档      │  │
│  └──────────────┘  └────────────────┘  │
└─────────────────────────────────────────┘
```

---

## 十、项目代码结构

```
ai-image-manager/
├── src/                          # React 前端
│   ├── App.tsx                   # 主应用（含主题切换+快捷键）
│   ├── main.tsx                  # 入口
│   ├── components/
│   │   ├── InboxView.tsx         # 收件箱视图
│   │   ├── ArchivedView.tsx      # 已归档视图
│   │   ├── ImageCard.tsx         # 图片卡片
│   │   ├── DropZone.tsx          # 拖拽上传（含自动分类）
│   │   ├── QuickEditModal.tsx    # 编辑弹窗
│   │   ├── SettingsView.tsx      # 设置页面（4个标签页）
│   │   └── ui/                   # shadcn 组件 (11个)
│   ├── hooks/
│   │   └── useKeyboardShortcuts.ts  # 键盘快捷键
│   ├── stores/index.ts           # Zustand 状态（含主题+设置）
│   ├── services/tauri.ts         # Tauri API 封装
│   ├── lib/utils.ts              # 工具函数
│   └── styles/globals.css        # 全局样式（含暗色模式CSS变量）
│
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── lib.rs                # Tauri 2.x 入口（pub fn run）
│   │   ├── main.rs               # 最小入口（调用 lib::run）
│   │   ├── commands/
│   │   │   ├── mod.rs            # 命令模块导出
│   │   │   ├── images.rs         # 图片 CRUD + 归档
│   │   │   ├── vendors.rs        # 厂商/模型管理
│   │   │   ├── tags.rs           # 标签管理
│   │   │   ├── watermark.rs      # 水印检测
│   │   │   ├── watermark_removal.rs  # 水印去除（边框采样+渐变混合+模糊）
│   │   │   ├── watcher.rs        # 文件夹监控（notify库）
│   │   │   ├── settings.rs       # 设置管理（UPSERT）
│   │   │   └── classifier.rs     # 自动预分类（文件名关键词匹配）
│   │   ├── database/mod.rs       # SQLite Schema + 初始化 + 默认数据
│   │   └── models/mod.rs         # 数据模型
│   ├── Cargo.toml
│   ├── tauri.conf.json           # Tauri 配置（不含 plugins 段）
│   └── icons/icon.ico
│
├── package.json
├── tailwind.config.js
├── vite.config.ts
├── tsconfig.json
├── components.json
├── PROGRESS.md
├── AI图片管理系统-完整落地方案.md
└── USAGE.md
```

> **架构说明**：
> - Tauri 2.x 采用 `lib.rs` + `main.rs` 双文件模式，`lib.rs` 包含核心逻辑和命令注册
> - 数据库默认存储在 `%USERPROFILE%/.ai-image-manager/database.sqlite`
> - 命令注册使用模块前缀路径，如 `commands::vendors::add_model`
> - 前端组件结构简化，功能合并到更少的文件中

---

## 十一、实施阶段

### 第一阶段：基础构建（第 1-2 周）
- [x] Tauri 项目初始化（React + TypeScript）
- [x] SQLite 数据库与迁移
- [x] 厂商、模型、标签的基础 CRUD
- [x] 图片导入（拖拽、文件选择）
- [x] 收件箱视图与缩略图网格

### 第二阶段：核心工作流（第 3-4 周）
- [x] 快速编辑弹窗（厂商、模型、prompt、标签）
- [x] 根据文件名自动分类
- [x] 归档操作（移动文件、重命名、更新数据库）
- [x] 厂商树导航
- [x] 标签系统与自动建议

### 第三阶段：搜索与浏览（第 5 周）
- [x] 全文搜索
- [x] 多条件筛选
- [x] 已归档视图（按模型浏览）
- [x] 图片详情面板
- [x] 批量操作（打标签、归档、删除）

### 第四阶段：高级功能（第 6-7 周）
- [x] 文件夹监控（自动导入）
- [x] 基于模板的批量重命名
- [x] 水印检测
- [x] 水印去除（边框采样+渐变混合算法）
- [x] 处理历史与撤销

### 第五阶段：完善（第 8 周）
- [x] 设置页面（命名模板、归档规则）
- [x] 键盘快捷键
- [x] 性能优化（基础实现）
- [x] 错误处理与边界情况
- [x] UI 优化与动画

> **实际完成情况**：所有五个阶段的计划功能已全部实现。项目可成功编译运行。
> 
> 部分实现与原方案有差异：
> - 水印去除使用边框采样+渐变混合+3x3模糊平滑算法，而非原计划的 LaMa ONNX 模型
> - 数据库存储在 `USERPROFILE/.ai-image-manager/database.sqlite`，而非项目目录
> - Tauri 2.x 采用 lib.rs + main.rs 双文件模式
> - 前端组件结构比原方案简化，合并了部分模块
> - 实现了暗色模式（三种模式切换）

---

## 十二、关键查询示例

### 按模型查询图片（含多模型关联）

```sql
SELECT
    i.*,
    r.is_primary,
    GROUP_CONCAT(r2.model_id) AS all_model_ids
FROM images i
JOIN image_model_relations r ON i.id = r.image_id
JOIN image_model_relations r2 ON i.id = r2.image_id
WHERE r.model_id = ?
GROUP BY i.id
ORDER BY i.imported_at DESC;
```

### 查询某图片的所有关联模型

```sql
SELECT m.*, r.is_primary
FROM models m
JOIN image_model_relations r ON m.id = r.model_id
WHERE r.image_id = ?;
```

### 查询存储在特定目录的图片

```sql
SELECT * FROM images
WHERE storage_vendor_id = ? AND storage_model_id = ?
ORDER BY imported_at DESC;
```

### 统计每个模型的图片数量（含关联）

```sql
SELECT
    m.id,
    m.name,
    COUNT(DISTINCT r.image_id) AS total_count,
    SUM(CASE WHEN r.is_primary THEN 1 ELSE 0 END) AS primary_count
FROM models m
LEFT JOIN image_model_relations r ON m.id = r.model_id
GROUP BY m.id;
```

### 按文本搜索图片（prompt + 标签）

```sql
SELECT DISTINCT i.*
FROM images i
LEFT JOIN image_tag_relations itr ON i.id = itr.image_id
LEFT JOIN tags t ON itr.tag_id = t.id
WHERE
    i.prompt LIKE ?                    -- 搜索 prompt
    OR i.filename LIKE ?               -- 搜索文件名
    OR t.name LIKE ?                   -- 搜索标签名
    OR t.name_en LIKE ?                -- 搜索标签英文名
ORDER BY i.imported_at DESC;
```

### 获取收件箱统计

```sql
SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN status = 'inbox' THEN 1 ELSE 0 END) AS unprocessed,
    SUM(CASE WHEN status = 'tagged' THEN 1 ELSE 0 END) AS tagged,
    SUM(CASE WHEN has_watermark = 1 AND watermark_removed = 0 THEN 1 ELSE 0 END) AS watermarked
FROM images
WHERE status IN ('inbox', 'tagged');
```

---

## 附录：术语表

| 英文 | 中文 | 说明 |
|------|------|------|
| Inbox | 收件箱 | 未处理图片的暂存区域 |
| Archive/Archived | 归档 | 处理完成后的正式存储 |
| Vendor | 厂商 | 如 OpenAI、Google、Midjourney |
| Model | 模型 | 如 Nano Banana、GPT Image 2 |
| Primary Model | 主模型 | 决定文件物理存储目录的模型 |
| Tag | 标签 | 用于搜索和筛选的描述性关键词 |
| Watermark | 水印 | AI 生成平台添加的可见或隐形标记 |
| Inpainting | 修复 | AI 图像修复技术，用于去水印 |
