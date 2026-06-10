# IP 作品集功能规划

## 概述

作品集（Works Collection）是 IP 资产管理域的**扩展功能模块**，用于管理 IP 角色在不同作品中的出现和角色信息。作品可以是任何类型的创作内容，包括电视剧、电影、小说、话剧、动画、游戏等。

## 功能定位

### 在 IP 域中的角色

IP 资产管理（sanIPBox）的核心功能是**表情包管理**，包括：
- **核心**：表情包（Sticker Packs）、表情图（Emojis）
- **辅助**：角色设定（Character Sheets）、创作素材（Creations）
- **扩展**：作品集（Works Collection）← 本功能

作品集作为扩展功能，为 IP 角色提供更丰富的背景信息和作品关联，但不影响核心的表情包管理流程。

### 导航位置

作品集功能位于 IP 资产管理的"已归档"视图之后，作为可选的扩展模块：

```
IP 资产管理 (sanIPBox)
├── 收件箱          [核心] IP 图片收集
├── 已归档          [核心] 表情包、角色设定等
└── 作品集          [扩展] 作品和角色管理 ← 本功能
```

### 功能关系

- **表情包 ← 作品集**：表情包可以标注来源作品和角色
- **IP 角色 ← 作品集**：IP 可以关联到作品中的角色
- **独立使用**：作品集也可以独立管理，不依赖表情包功能

## 架构设计原则（低耦合）

> **重要**：作品集功能设计为可独立拆分的扩展模块，未来可能成为独立应用 **sanWorksBox**。

### 模块独立性

作品集作为扩展功能，应遵循以下低耦合原则：

1. **独立的数据层**
   - 作品集相关的数据库表（`works`、`characters`、`work_tags`）完全独立
   - 仅通过外键 `ip_id` 与 IP 资产表建立松耦合关系
   - 删除 IP 时使用 `ON DELETE SET NULL`，不影响作品和角色数据的完整性
   - **不影响核心表情包功能**

2. **独立的后端模块**
   - 所有作品集相关命令集中在独立的 Rust 模块中
   - 模块路径：`src-tauri/src/commands/works.rs` 和 `src-tauri/src/commands/characters.rs`
   - 不依赖其他 IP 域的命令模块（除了读取 IP 基本信息）
   - 可以完全禁用而不影响表情包功能

3. **独立的前端模块**
   - 作品集相关组件放在独立的目录或使用明确的命名前缀
   - 独立的 Zustand Store（`useWorksStore`、`useCharactersStore`）
   - 仅通过标准接口与 IP 域交互
   - 可以通过配置开关启用/禁用

4. **最小化跨域依赖**
   - 作品集 → IP 域：仅读取 IP 基本信息（ID、名称、头像）用于关联
   - IP 域 → 作品集：可选地读取角色列表用于展示（不影响核心功能）
   - 使用事件/回调机制而非直接调用

5. **独立的文件存储**
   - 作品集文件存储在独立目录：`{app_data_dir}/works/`
   - 不与 IP 域的文件存储混合
   - 可以独立备份和迁移

### 与表情包功能的关系

作品集作为扩展功能，与核心表情包功能的关系：

| 功能 | 依赖关系 | 说明 |
|------|---------|------|
| **表情包管理** | 核心功能，独立运行 | 不依赖作品集 |
| **作品集管理** | 扩展功能，可选启用 | 可以关联 IP，但不是必需的 |
| **IP 详情页** | 可选集成 | 可以显示"相关作品"标签页，但不影响核心功能 |
| **表情包 → 作品** | 可选关联 | 表情包可以标注来源作品（未来扩展） |

### 未来拆分路径

当需要将作品集拆分为独立应用时：

```
sanOmni (当前)
├── IP 资产管理 (sanIPBox) - 核心：表情包
│   └── 作品集 (内嵌扩展)
└── 提示词管理 (sanPromptBox)

↓ 拆分后

sanIPBox (独立应用)
├── 表情包管理 [核心]
├── 角色设定管理
└── 可选：作品集集成插件

sanWorksBox (独立应用)
├── 作品管理 [核心]
├── 角色管理 [核心]
└── 可选：IP 关联插件

sanPromptBox (独立应用)
└── 提示词管理
```

### 跨应用集成方案（未来）

拆分后的应用间通信方案：

1. **数据导入/导出**
   - JSON 格式的作品和角色数据导出
   - IP 关联信息的导入/导出

2. **API 集成**（可选）
   - 本地 HTTP API 或 IPC 通信
   - 标准化的数据交换格式

3. **共享数据库**（可选）
   - 通过共享 SQLite 数据库文件
   - 使用视图或只读访问控制

4. **插件机制**（推荐）
   - sanIPBox 可以安装 sanWorksBox 插件
   - sanWorksBox 可以安装 IP 关联插件
   - 通过标准化的插件接口通信

## 核心概念

### 作品（Work）

作品是一个独立的创作项目，具有以下属性：

- **基本信息**
  - 作品 ID（唯一标识符）
  - 作品名称
  - 作品类型（电视剧、电影、小说、话剧、动画、游戏、漫画等）
  - 作品简介/描述
  - 创建时间
  - 更新时间

- **扩展信息**
  - 发布日期/上映日期
  - 制作方/出品方
  - 导演/作者
  - 状态（筹备中、制作中、已发布、已完结等）
  - 封面图片路径
  - 标签（可复用现有标签系统）

### 角色（Character）

角色是作品中的人物/角色，具有以下属性：

- **基本信息**
  - 角色 ID（唯一标识符）
  - 作品 ID（所属作品）
  - 角色名称
  - 角色类型（主角、配角、客串、反派等）
  - 角色描述
  - 出场信息（集数/章节等）
  - 角色图片
  - 创建时间
  - 更新时间

- **IP 关联**（可选）
  - IP ID（如果该角色由某个 IP 扮演）
  - 关联说明

### IP-角色关联（IP-Character Relationship）

描述 IP 资产扮演作品中某个角色的关系：

- 一个作品可以有多个角色
- 一个角色可以关联到一个 IP（也可以不关联）
- 一个 IP 可以扮演多个作品中的不同角色

## 数据模型

### 数据库表结构

#### works 表

```sql
CREATE TABLE works (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    work_type TEXT NOT NULL,  -- 作品类型
    description TEXT,
    release_date TEXT,        -- 发布日期 (ISO 8601)
    producer TEXT,            -- 制作方
    director_author TEXT,     -- 导演/作者
    status TEXT,              -- 状态
    cover_path TEXT,          -- 封面图片路径
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT           -- 软删除
);
```

#### work_tags 表（作品标签关联）

```sql
CREATE TABLE work_tags (
    work_id TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (work_id, tag_id),
    FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
```

#### characters 表（作品角色）

```sql
CREATE TABLE characters (
    id TEXT PRIMARY KEY,
    work_id TEXT NOT NULL,
    name TEXT NOT NULL,            -- 角色名称
    character_type TEXT,           -- 角色类型（主角、配角、客串、反派等）
    description TEXT,              -- 角色描述
    appearance_info TEXT,          -- 出场信息（集数/章节等）
    image_paths TEXT,              -- JSON 数组，存储角色图片路径
    ip_id TEXT,                    -- 关联的 IP（可选，松耦合）
    ip_relation_note TEXT,         -- IP 关联说明
    display_order INTEGER DEFAULT 0, -- 显示顺序
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,               -- 软删除
    FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
    FOREIGN KEY (ip_id) REFERENCES ip_assets(id) ON DELETE SET NULL  -- 注意：SET NULL 而非 CASCADE
);

CREATE INDEX idx_characters_work_id ON characters(work_id);
CREATE INDEX idx_characters_ip_id ON characters(ip_id);
CREATE INDEX idx_characters_display_order ON characters(work_id, display_order);
```

**设计说明：**
- `ip_id` 使用 `ON DELETE SET NULL`：删除 IP 时，角色数据保留，仅清除关联
- 这样作品和角色数据可以独立存在，不依赖 IP 域
- 支持未来拆分为独立应用

### TypeScript 类型定义

```typescript
// 作品类型枚举
export type WorkType = 
  | 'tv_series'      // 电视剧
  | 'movie'          // 电影
  | 'novel'          // 小说
  | 'drama'          // 话剧
  | 'animation'      // 动画
  | 'game'           // 游戏
  | 'comic'          // 漫画
  | 'other';         // 其他

// 作品状态枚举
export type WorkStatus = 
  | 'planning'       // 筹备中
  | 'in_production'  // 制作中
  | 'released'       // 已发布
  | 'completed'      // 已完结
  | 'cancelled';     // 已取消

// 角色类型枚举
export type CharacterType = 
  | 'protagonist'    // 主角
  | 'supporting'     // 配角
  | 'antagonist'     // 反派
  | 'guest'          // 客串
  | 'cameo'          // 彩蛋
  | 'other';         // 其他

// 作品基础信息
export interface Work {
  id: string;
  name: string;
  work_type: WorkType;
  description?: string;
  release_date?: string;
  producer?: string;
  director_author?: string;
  status?: WorkStatus;
  cover_path?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

// 作品完整信息（包含关联数据）
export interface WorkWithRelations extends Work {
  tags: Tag[];
  characters: CharacterWithRelations[];  // 该作品中的所有角色
}

// 角色基础信息
export interface Character {
  id: string;
  work_id: string;
  name: string;
  character_type?: CharacterType;
  description?: string;
  appearance_info?: string;
  image_paths?: string[];  // 解析后的图片路径数组
  ip_id?: string;          // 关联的 IP（可选，松耦合）
  ip_relation_note?: string;
  display_order?: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

// 角色完整信息（包含关联数据）
export interface CharacterWithRelations extends Character {
  work_name: string;
  work_type: WorkType;
  ip_name?: string;        // 如果关联了 IP（通过独立查询获取）
  ip_avatar_path?: string; // 如果关联了 IP（通过独立查询获取）
}

// IP 基本信息（用于作品集中的 IP 关联，最小化依赖）
export interface IpBasicInfo {
  id: string;
  name: string;
  avatar_path?: string;
}
```

## 用户界面设计

### 导航结构

在 IP 资产管理域中，导航结构调整为：

```
IP 资产管理
├── 收件箱 (IpInboxView)
├── 已归档 (IpArchivedView)
├── 作品集 (WorksView) ← 新增
└── 侧边栏 (IpSidebar)
```

### 主要视图

#### 1. 作品列表视图 (WorksView)

**布局：**
- 顶部工具栏：
  - 搜索框（按作品名称搜索）
  - 筛选器（按作品类型、状态筛选）
  - 排序选项（按创建时间、发布日期、名称排序）
  - "新建作品"按钮

- 作品卡片网格：
  - 封面图片（如有）
  - 作品名称
  - 作品类型标签
  - 状态标签
  - 关联的 IP 数量
  - 快速操作按钮（编辑、删除）

**交互：**
- 点击作品卡片 → 进入作品详情视图
- 右键菜单：编辑、删除、查看详情

#### 2. 作品详情视图 (WorkDetailView)

**布局：**
- 左侧：作品基本信息面板
  - 封面图片（可点击更换）
  - 作品名称（可编辑）
  - 作品类型
  - 发布日期
  - 制作方/导演
  - 状态
  - 描述
  - 标签列表

- 右侧：角色管理面板
  - 标题："角色列表"
  - "添加角色"按钮
  - 角色卡片列表：
    - 角色头像/图片
    - 角色名称
    - 角色类型标签
    - 关联的 IP（如有）：显示 IP 头像和名称
    - 角色描述（可折叠）
    - 出场信息
    - 操作按钮（编辑、删除）

**交互：**
- 点击"添加角色" → 打开角色编辑对话框
- 点击角色卡片 → 展开/折叠详细信息
- 点击"编辑" → 打开角色编辑对话框
- 点击 IP 头像/名称（如有关联）→ 跳转到该 IP 的详情页
- 拖拽角色卡片 → 调整角色显示顺序

#### 3. 新建/编辑作品对话框 (WorkEditModal)

**表单字段：**
- 作品名称（必填）
- 作品类型（下拉选择，必填）
- 发布日期（日期选择器）
- 制作方
- 导演/作者
- 状态（下拉选择）
- 封面图片（文件选择器）
- 描述（多行文本框）
- 标签（标签选择器，可复用现有标签系统）

**操作按钮：**
- 保存
- 取消

#### 4. 角色编辑对话框 (CharacterEditModal)

**表单字段：**
- 角色名称（必填）
- 角色类型（下拉选择）
- 角色描述（多行文本框）
- 出场信息（文本框）
- 角色图片（多图片选择器）
- 关联 IP（下拉选择，可选，显示 IP 头像和名称）
- IP 关联说明（文本框，仅当选择了 IP 时显示）

**操作按钮：**
- 保存
- 取消

**说明：**
- 角色可以不关联任何 IP（纯作品角色）
- 角色也可以关联到某个 IP（IP 扮演该角色）
- 一个角色只能关联一个 IP

### IP 详情页集成（可选）

在现有的 IP 详情页（IpArchivedView 中的 IP 卡片详情）中，**可选地**添加"相关作品"标签页：

**相关作品标签页：**
- 显示该 IP 扮演的所有角色（跨作品）
- 角色卡片显示：
  - 作品封面
  - 作品名称
  - 作品类型
  - 角色名称（该 IP 在此作品中扮演的角色）
  - 角色类型标签
  - 角色描述（简短）
- 点击角色卡片 → 跳转到作品详情视图，并高亮显示该角色

**实现方式：**
- 通过配置开关控制是否显示此标签页
- 如果作品集功能未启用，此标签页不显示
- 不影响 IP 详情页的核心功能（表情包展示等）

## 后端实现

### Rust 命令模块

创建新的命令模块：`src-tauri/src/commands/works.rs`

**主要命令：**

```rust
// 作品 CRUD
#[tauri::command]
pub async fn create_work(work: Work) -> Result<Work, String>

#[tauri::command]
pub async fn get_works(filters: Option<WorkFilters>) -> Result<Vec<WorkWithRelations>, String>

#[tauri::command]
pub async fn get_work_by_id(id: String) -> Result<WorkWithRelations, String>

#[tauri::command]
pub async fn update_work(id: String, work: Work) -> Result<Work, String>

#[tauri::command]
pub async fn delete_work(id: String) -> Result<(), String>

// IP-作品角色关联 CRUD
#[tauri::command]
pub async fn add_ip_to_work(character: IpWorkCharacter) -> Result<IpWorkCharacter, String>

#[tauri::command]
pub async fn update_ip_character(id: String, character: IpWorkCharacter) -> Result<IpWorkCharacter, String>

#[tauri::command]
pub async fn remove_ip_from_work(id: String) -> Result<(), String>

#[tauri::command]
pub async fn get_work_characters(work_id: String) -> Result<Vec<IpWorkCharacterWithRelations>, String>

#[tauri::command]
pub async fn get_ip_works(ip_id: String) -> Result<Vec<WorkWithRelations>, String>

// 作品标签管理
#[tauri::command]
pub async fn add_work_tag(work_id: String, tag_id: i32) -> Result<(), String>

#[tauri::command]
pub async fn remove_work_tag(work_id: String, tag_id: i32) -> Result<(), String>
```

### 数据库操作

在 `src-tauri/src/database/mod.rs` 中添加作品相关的数据库操作函数。

## 前端实现

### 状态管理

在 `src/stores/index.ts` 中添加作品相关的 Zustand store：

```typescript
// Works Store
interface WorksStore {
  works: WorkWithRelations[];
  selectedWork: WorkWithRelations | null;
  filters: WorkFilters;
  
  // Actions
  fetchWorks: () => Promise<void>;
  createWork: (work: Work) => Promise<void>;
  updateWork: (id: string, work: Work) => Promise<void>;
  deleteWork: (id: string) => Promise<void>;
  selectWork: (work: WorkWithRelations | null) => void;
  setFilters: (filters: WorkFilters) => void;
  
  // IP-Work Character Actions
  addIpToWork: (character: IpWorkCharacter) => Promise<void>;
  updateIpCharacter: (id: string, character: IpWorkCharacter) => Promise<void>;
  removeIpFromWork: (id: string) => Promise<void>;
}
```

### 组件清单

需要创建的新组件：

1. **WorksView.tsx** - 作品列表主视图
2. **WorkCard.tsx** - 作品卡片组件
3. **WorkDetailView.tsx** - 作品详情视图
4. **WorkEditModal.tsx** - 作品编辑对话框
5. **IpCharacterEditModal.tsx** - IP 角色编辑对话框
6. **WorkCharacterCard.tsx** - 作品中的角色卡片组件
7. **IpWorksTab.tsx** - IP 详情页中的相关作品标签页

### 服务层

在 `src/services/tauri.ts` 中添加作品相关的 API 包装函数。

## 文件存储

### 作品封面存储

作品封面图片存储在：
```
{app_data_dir}/works/{work_id}/cover.{ext}
```

### 角色关联图片存储

角色在作品中的形象图片存储在：
```
{app_data_dir}/works/{work_id}/characters/{ip_id}_{index}.{ext}
```

## 功能特性

### 1. 作品管理

- ✅ 创建、编辑、删除作品
- ✅ 作品类型分类（电视剧、电影、小说等）
- ✅ 作品状态跟踪（筹备中、制作中、已发布等）
- ✅ 作品封面图片管理
- ✅ 作品标签系统（复用现有标签）
- ✅ 作品搜索和筛选

### 2. IP-作品关联

- ✅ 将 IP 添加到作品中
- ✅ 为 IP 在作品中设置角色名称
- ✅ 角色类型分类（主角、配角、客串等）
- ✅ 角色描述和出场信息
- ✅ 角色形象图片管理
- ✅ 从作品中移除 IP

### 3. 视图和导航

- ✅ 作品列表视图（网格/列表切换）
- ✅ 作品详情视图
- ✅ IP 详情页中的相关作品展示
- ✅ 作品与 IP 之间的双向导航

### 4. 数据完整性

- ✅ 软删除支持（作品删除不影响 IP）
- ✅ 级联删除（删除作品时清理关联数据）
- ✅ 唯一性约束（一个 IP 在一个作品中只能有一个角色）

## 实现优先级

### Phase 1: 核心功能（MVP）

1. 数据库表结构创建
2. 后端命令实现（基础 CRUD）
3. 前端 Store 实现
4. 作品列表视图
5. 作品创建/编辑对话框
6. 基础的 IP-作品关联功能

### Phase 2: 增强功能

1. 作品详情视图
2. 角色编辑对话框（完整功能）
3. IP 详情页中的相关作品标签页
4. 作品封面图片管理
5. 角色形象图片管理

### Phase 3: 优化和扩展

1. 高级搜索和筛选
2. 批量操作
3. 数据导入/导出
4. 统计和报表功能

## 技术考虑

### 性能优化

- 作品列表使用虚拟滚动（如果数量较多）
- 图片懒加载
- 数据库查询优化（适当的索引）

### 用户体验

- 拖拽排序（角色列表）
- 快捷键支持
- 加载状态和错误处理
- 确认对话框（删除操作）

### 数据迁移

- 提供数据库迁移脚本
- 向后兼容性考虑

## 未来扩展

### 可能的功能扩展

1. **时间线视图**：按时间轴展示作品发布历史
2. **关系图谱**：可视化 IP 与作品之间的关系网络
3. **协作功能**：多人协作编辑作品信息
4. **版本控制**：跟踪作品信息的修改历史
5. **导出功能**：导出作品信息为 PDF/Word 文档
6. **统计分析**：IP 出演频率、作品类型分布等
7. **外部集成**：与豆瓣、IMDb 等平台集成获取作品信息

## 参考资料

- 现有 IP 资产管理实现：`src-tauri/src/commands/ip_assets.rs`
- 标签系统实现：`src-tauri/src/commands/tags.rs`
- 图片管理实现：`src-tauri/src/commands/ip_images.rs`

## 总结

作品集功能为 IP 资产管理域提供了一个重要的维度，使用户能够跟踪和管理 IP 角色在不同作品中的出现。通过建立 IP 与作品之间的多对多关系，并记录每个 IP 在特定作品中的角色信息，该功能为 IP 资产的全生命周期管理提供了更完整的解决方案。

该功能设计遵循了项目的架构原则，保持了与现有 IP 域功能的一致性，并为未来可能的功能扩展预留了空间。
