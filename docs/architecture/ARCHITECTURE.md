# sanOmni 架构设计文档

> **版本**: v0.1.0  
> **最后更新**: 2026-05-26  
> **技术栈**: Tauri 2.0 + React 18 + TypeScript + Rust + SQLite

---

## 目录

- [概览摘要](#概览摘要)
- [设计理念](#设计理念)
- [技术栈全景](#技术栈全景)
- [双域架构设计](#双域架构设计)
- [App A: sanPrompt](#app-a-sanprompt)
- [App B: sanIP](#app-b-sanip)
- [共享模块 (sanMediaCore)](#共享模块-sanmediacore)
- [当前代码结构](#当前代码结构)
- [数据库架构](#数据库架构)
- [前端架构](#前端架构)
- [后端架构](#后端架构)
- [数据流与通信机制](#数据流与通信机制)
- [模块耦合度分析](#模块耦合度分析)
- [未来模块化重构方案](#未来模块化重构方案)
- [应用拆分策略](#应用拆分策略)
- [已知技术债务](#已知技术债务)

---

## 概览摘要

sanOmni 是一个基于 Tauri 2.0 的跨平台桌面应用程序，当前**包含两个独立的功能领域**，以一个统一的应用形式打包发布，但在架构设计上**保持领域分离**，以便未来可以轻松拆分为两个独立应用。

```
┌─────────────────────────────────────────────────────────┐
│                      sanOmni                        │
│                   (统一应用外壳)                          │
│                                                         │
│  ┌───────────────────┐    ┌───────────────────────┐     │
│  │   App A:          │    │   App B:              │     │
│  │   sanPrompt       │    │   sanIP               │     │
│  │                   │    │                       │     │
│  │  sanPrompt 模板管理 │    │  sanIP 资产管理         │     │
│  │  图片收纳/归档     │    │  表情包/贴纸管理       │     │
│  │  模型厂商管理      │    │  角色设定图管理        │     │
│  │  跨模型效果对比    │    │  IP 关系网络           │     │
│  └────────┬──────────┘    └──────────┬────────────┘     │
│           │                          │                  │
│           └──────────┬───────────────┘                  │
│                      │                                  │
│           ┌──────────▼──────────┐                       │
│           │  sanMediaCore       │                       │
│           │  (共享基础模块)      │                       │
│           │                     │                       │
│           │  设置系统 / 水印处理  │                       │
│           │  主题切换 / 图片预览  │                       │
│           │  数据库基础 / UI组件  │                       │
│           └─────────────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

### 核心设计原则

| 原则 | 说明 |
|------|------|
| **领域分离** | 两个业务域使用独立的数据表和数据模型，无交叉外键依赖 |
| **松耦合** | IP 模块通过 `image_path` 字符串引用图片，而非外键关联 |
| **可拆分** | 每个域可独立提取为单独应用，仅需携带共享模块 |
| **单体部署** | 当前阶段以单体应用发布，减少维护成本 |

---

## 设计理念

### 为什么合并为一个应用？

1. **开发效率**: 两个领域共享大量基础设施（数据库、UI 组件、水印处理等）
2. **用户体验**: AI 图片创作者往往同时需要管理 Prompt 和 IP 形象
3. **资源共享**: 共享 Tauri 运行时、SQLite 实例等

### 为什么要保持可拆分？

1. **用户群分化**: sanPrompt 和 sanIP 可能面向不同用户群体
2. **复杂度控制**: 单一应用过于庞大时，拆分有利于独立迭代
3. **发布灵活性**: 可按需发布轻量版本

---

## 技术栈全景

### 前端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.2 | UI 框架 |
| TypeScript | 5.0 | 类型安全 |
| Vite | 5.0 | 构建工具 |
| Zustand | 4.5 | 状态管理 |
| Tailwind CSS | 3.4 | 样式框架 |
| Radix UI | 1.x | 无头 UI 组件 |
| shadcn/ui | - | 组件库（基于 Radix） |
| Lucide React | 0.344 | 图标库 |
| Tauri API | 2.0 | 前后端通信桥 |

### 后端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Rust | 2021 edition | 系统编程语言 |
| Tauri | 2.0 | 桌面应用框架 |
| rusqlite | 0.32 | SQLite 数据库绑定 |
| image | 0.25 | 图像处理（水印检测/移除） |

| tokio | 1.x | 异步运行时 |
| serde / serde_json | 1.x | 序列化/反序列化 |
| uuid | 1.x | 唯一标识符生成 |
| sha2 + hex | - | 文件哈希计算 |
| chrono | 0.4 | 日期时间处理 |

### Tauri 插件

| 插件 | 用途 |
|------|------|
| tauri-plugin-shell | 外部程序调用 |
| tauri-plugin-dialog | 原生文件对话框 |
| tauri-plugin-fs | 文件系统操作 |

---

## 双域架构设计

### 领域关系图

```
┌────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                       │
│                                                                │
│  Tab: 待整理    Tab: 已归档    Tab: Prompt管理   Tab: IP管理    │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌─────────────┐  │
│  │InboxView │  │Archived  │  │PromptGroups│  │IPManagement │  │
│  │          │  │View      │  │View        │  │View         │  │
│  └────┬─────┘  └────┬─────┘  └─────┬──────┘  └──────┬──────┘  │
│       │              │              │                │         │
│       └──────┬───────┘              │                │         │
│              │                      │                │         │
│   ┌──────────▼──────────┐  ┌───────▼──────┐  ┌─────▼──────┐  │
│   │  useImageStore      │  │ promptApi    │  │ ipApi      │  │
│   │  useVendorStore     │  │              │  │            │  │
│   │  useTagStore        │  │              │  │            │  │
│   └──────────┬──────────┘  └──────┬───────┘  └─────┬──────┘  │
│              │                    │                 │         │
│   ┌──────────▼────────────────────▼─────────────────▼──────┐  │
│   │                  tauri.ts (API 服务层)                  │  │
│   │  imageApi | vendorApi | tagApi | promptApi | ipApi     │  │
│   │  watermarkApi | geminiWatermarkApi | watcherApi | ...  │  │
│   └──────────────────────┬─────────────────────────────────┘  │
└──────────────────────────┼────────────────────────────────────┘
                           │  invoke()
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                      Backend (Rust / Tauri)                   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              Tauri Command Handlers (lib.rs)         │    │
│  │  66 个已注册命令，分布在 11 个模块中                     │    │
│  └──────────────────────┬───────────────────────────────┘    │
│                         │                                    │
│  ┌──────────────────────▼───────────────────────────────┐    │
│  │                  commands/                           │    │
│  │                                                      │    │
│  │  App A 域:                                           │    │
│  │    images.rs (8) │ vendors.rs (6) │ tags.rs (2)      │    │
│  │    prompt_groups.rs (10) │ classifier.rs (1)         │    │
│  │    scanner.rs (2)                                    │    │
│  │                                                      │    │
│  │  App B 域:                                           │    │
│  │    ip_assets.rs (19) │ ip_images.rs (6)             │    │
│  │                                                      │    │
│  │  共享:                                               │    │
│  │    watermark.rs (2) │ watermark_removal.rs (2)       │    │
│  │    gemini_watermark_removal.rs (3) │ watcher.rs (3)  │    │
│  │    settings.rs (3)                                   │    │
│  └──────────────────────┬───────────────────────────────┘    │
│                         │                                    │
│  ┌──────────────────────▼───────────────────────────────┐    │
│  │              database/mod.rs (SQLite)                │    │
│  │  单一数据库文件: data/database.sqlite                  │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## App A: sanPrompt

### 核心定位

**Prompt 模板商品管理**是 App A 的核心目的。图片（inbox/archived）的存在是为了**服务于 Prompt 模板商品**，既用于本地整理，也用于记录同一模板在不同 AI 模型下的生成效果，最终同步到 `sanPrompt` 网站作为封面、画廊和模型证据。

### 功能清单

| 功能模块 | 说明 |
|----------|------|
| **图片导入** | 通过 DropZone 拖拽或文件对话框导入 AI 生成图片 |
| **自动预分类** | 根据文件名模式自动识别来源厂商和模型（classifier.rs） |
| **Inbox 管理** | 待整理图片的浏览、筛选、批量编辑、单张快速编辑 |
| **归档工作流** | inbox → 分类 → 标签 → 归档，按 `厂商/模型/` 目录结构存储 |
| **Prompt 模板** | 创建 Prompt 模板商品，支持模板变量（template_schema）和插值渲染 |
| **商品字段管理** | 维护统一分类、标签、价格、上架状态、远端 slug/url |
| **跨模型对比** | 将同一 Prompt 的不同模型生成图绑定到一个 PromptGroup，形成效果证明矩阵 |
| **图片展示编排** | 为图片设置封面、排序、说明、变体信息、是否参与云端同步 |
| **厂商/模型管理** | 管理 AI 平台（OpenAI、Google、Midjourney 等）及其模型 |
| **标签系统** | 图片分类标签（风景、人像、抽象、动漫、写实等） |
| **目录扫描** | 扫描归档目录以导入已有图片，清理 inbox 冗余文件 |

### 工作流程

```
用户拖拽图片到 DropZone
        │
        ▼
┌──────────────────┐
│  自动预分类        │ ← classifier.rs 根据文件名识别
│  (厂商/模型推断)   │   例: "midjourney-v6-xxx.png" → Midjourney v6
└────────┬─────────┘
         ▼
┌──────────────────┐
│  Inbox (待整理)   │ ← 用户可编辑 prompt、标签、模型关联
│  状态: inbox      │
└────────┬─────────┘
         │ 用户点击归档
         ▼
┌──────────────────┐
│  归档文件移动      │ ← 按 vendor/model/ 目录结构重命名并移动
│  状态: archived   │
└────────┬─────────┘
         ▼
┌──────────────────┐
│  关联 PromptGroup │ ← 可选：绑定到模板商品
│  编排封面/变体/同步 │
└──────────────────┘
```

### 与 sanPrompt 网站的职责分工

- `sanOmni`：商品主数据源，负责创建模板、维护分类、价格、图片证据和发布状态。
- `sanPrompt`：消费者前台，负责分类检索、商品详情、购买转化和 Playground。
- `sanIP`：独立的角色资产域，不参与 Prompt 商品的分类和发布模型。

### 涉及的前端模块

| 文件 | 大小 | 职责 |
|------|------|------|
| `InboxView.tsx` | 27KB | 待整理图片列表视图 |
| `ArchivedView.tsx` | 30KB | 已归档图片浏览视图 |
| `PromptGroupsView.tsx` | 38KB | Prompt 模板管理视图 |
| `ImageCard.tsx` | 34KB | 图片卡片组件（网格/列表模式） |
| `QuickEditModal.tsx` | 52KB | 单张图片快速编辑模态框 |
| `BatchEditModal.tsx` | 14KB | 批量编辑模态框 |
| `DropZone.tsx` | 11KB | 拖拽导入区域组件 |
| `SmartPromptRenderer.tsx` | 8KB | Prompt 模板智能渲染器 |
| `TemplateVariableEditor.tsx` | 7KB | 模板变量编辑器 |

### 涉及的后端模块

| 文件 | 命令数 | 职责 |
|------|--------|------|
| `images.rs` | 8 | 图片 CRUD、导入、归档/取消归档、格式更新 |
| `vendors.rs` | 6 | 厂商和模型的增删改查 |
| `tags.rs` | 2 | 标签查询与创建 |
| `prompt_groups.rs` | 10 | Prompt 组管理、图片关联、自动分组 |
| `classifier.rs` | 1 | 文件名模式匹配，自动预分类 |
| `scanner.rs` | 2 | 目录扫描与 inbox 清理 |

### 前端 Store

| Store | 状态 |
|-------|------|
| `useImageStore` | inbox 图片列表、已归档图片列表、选中状态、加载状态 |
| `useVendorStore` | 厂商和模型列表 |
| `useTagStore` | 标签列表、热门标签 |

### API 命名空间

`imageApi` · `vendorApi` · `tagApi` · `promptApi` · `classifyApi` · `scannerApi`

---

## App B: sanIP

### 核心定位

**IP 角色管理**是 App B 的核心目的。管理 AI 创作的 IP 角色形象，包括角色设定图、衍生创作（表情包、贴纸等），以及 IP 之间的关系网络。

### 功能清单

| 功能模块 | 说明 |
|----------|------|
| **IP 角色 CRUD** | 创建/编辑/删除 IP 角色（名称、头像、灵感来源、描述） |
| **角色设定图** | 管理角色的三视图/参考图（character sheets），按类型分类 |
| **衍生创作** | 记录使用 IP 角色创作的图片及其名称 |
| **表情包套件** | 创建和管理表情包套件（sticker packs），支持描述 |
| **表情管理** | 管理单个表情图（emojis），支持触发词和排序 |
| **平台发布** | 管理表情包在不同平台的发布状态（微信、Telegram 等） |
| **IP 关系网络** | 建立 IP 角色之间的关系（朋友、同系列、衍生等） |
| **图片选择器** | 从文件系统选择图片关联到 IP 角色 |

### 数据模型关系

```
                    ┌─────────────┐
                    │   IpAsset   │
                    │             │
                    │ name        │
                    │ avatar_path │
                    │ inspiration │
                    │ description │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┬──────────────────┐
          │                │                │                  │
          ▼                ▼                ▼                  ▼
┌─────────────────┐ ┌────────────┐ ┌───────────────┐ ┌──────────────┐
│ IpCharacterSheet│ │ IpCreation │ │ IpStickerPack │ │  IpRelation  │
│                 │ │            │ │               │ │              │
│ image_path      │ │ image_path │ │ name          │ │ ip_a_id      │
│ sheet_type      │ │ creation_  │ │ description   │ │ ip_b_id      │
│ sort_order      │ │ name       │ │               │ │ relation_type│
└─────────────────┘ └────────────┘ └───────┬───────┘ └──────────────┘
                                           │
                                    ┌──────┴──────┐
                                    │             │
                                    ▼             ▼
                          ┌────────────┐  ┌─────────────────────┐
                          │  IpEmoji   │  │IpStickerPackPlatform│
                          │            │  │                     │
                          │ image_path │  │ platform_name       │
                          │ trigger_   │  │ pack_name_on_       │
                          │ word       │  │ platform            │
                          │ sort_order │  │ status (Draft/      │
                          └────────────┘  │  Published)         │
                                          │ publish_url         │
                                          │ downloads_count     │
                                          └─────────────────────┘
```

### 涉及的前端模块

| 文件 | 大小 | 职责 |
|------|------|------|
| `IPManagementView.tsx` | **91KB** | IP 管理主视图（当前最复杂的组件！） |
| `IPImagePickerModal.tsx` | 6KB | 图片选择器模态框 |

> **⚠️ 注意**: `IPManagementView.tsx` 是当前代码库中最大的单文件组件（91KB），未来应当优先拆分。

### 涉及的后端模块

| 文件 | 命令数 | 职责 |
|------|--------|------|
| `ip_assets.rs` | **19** | IP 资产管理（CRUD、设定图、创作、贴纸包、表情、平台、关系） |
| `ip_images.rs` | **6** | IP 图片管理（导入、查询、更新、删除、归档） |

### 19 个 ip_assets 命令

| 命令 | 功能 |
|------|------|
| `get_ip_assets` | 获取所有 IP 角色列表 |
| `get_ip_asset_detail` | 获取单个 IP 角色完整详情 |
| `create_ip_asset` | 创建新 IP 角色（含 path 字段） |
| `update_ip_asset` | 更新 IP 角色信息（含 path 字段） |
| `delete_ip_asset` | 删除 IP 角色（级联删除所有关联） |
| `add_ip_character_sheets` | 添加角色设定图 |
| `remove_ip_character_sheets` | 移除角色设定图 |
| `add_ip_creations` | 添加衍生创作 |
| `remove_ip_creations` | 移除衍生创作 |
| `add_ip_relation` | 建立 IP 角色间关系 |
| `remove_ip_relation` | 解除 IP 角色间关系 |
| `create_ip_sticker_pack` | 创建表情包套件 |
| `update_ip_sticker_pack` | 更新表情包套件 |
| `delete_ip_sticker_pack` | 删除表情包套件 |
| `add_ip_sticker_pack_platform` | 添加发布平台 |
| `update_ip_sticker_pack_platform` | 更新平台信息 |
| `delete_ip_sticker_pack_platform` | 删除发布平台 |
| `add_ip_emojis` | 添加表情图 |
| `update_ip_emoji_trigger_word` | 更新表情触发词 |
| `delete_ip_emojis` | 删除表情图 |
| `move_ip_emojis_to_pack` | 将表情移动到指定套件 |

### 6 个 ip_images 命令

| 命令 | 功能 |
|------|------|
| `import_ip_image` | 导入 IP 图片（关联 ip_id） |
| `get_ip_inbox_images` | 获取 IP 收件箱图片 |
| `get_ip_archived_images` | 获取 IP 已归档图片 |
| `update_ip_image` | 更新 IP 图片元数据（标签、水印、ip_id） |
| `delete_ip_image` | 删除 IP 图片 |
| `archive_ip_images` | 归档 IP 图片（按 `{ip}-{date}-{index}` 模板命名） |

### 前端 Store

| Store | 存储类型 | 状态 |
|-------|----------|------|
| `useIpImageStore` | `IpImageWithRelations[]` | IP 图片收件箱/归档列表、选中状态 |

IP 角色数据（`IpAsset`）通过组件内 `useState` 直接管理，`useUIStore` 维护 `selectedIpId`。

### API 命名空间

`ipApi` · `ipImageApi`

---

## 共享模块 (sanMediaCore)

### 核心定位

提供两个业务域都需要的**基础设施和通用功能**。

### 功能矩阵

| 模块 | 前端 | 后端 | 说明 |
|------|:----:|:----:|------|
| **设置系统** | SettingsView.tsx | settings.rs | 键值对持久化设置（SQLite + localStorage 双层） |
| **水印检测** | - | watermark.rs | 标准水印检测算法（模式匹配 + 图像分析） |
| **水印移除** | - | watermark_removal.rs | 标准水印移除（inpainting 方式） |
| **Gemini 水印** | - | gemini_watermark_removal.rs | Gemini 专用反向透明度混合算法 |
| **主题系统** | useUIStore | - | 浅色/深色/跟随系统，支持每模式自定义主题色 |
| **图片预览** | ImageViewer.tsx | - | 全屏图片浏览，键盘导航 |
| **文件扫描** |  | scanner.rs | 扫描文件夹以发现未入库或已失效的文件 |
| **确认对话框** | ConfirmDialog.tsx | - | 通用确认弹窗 |
| **回收站** | TrashView.tsx | - | 已删除图片管理 |
| **Toast 通知** | useToast.ts | - | 通知提示系统 |
| **键盘快捷键** | useKeyboardShortcuts.ts | - | 全局快捷键框架 |
| **UI 组件库** | ui/ (shadcn) | - | Button, Input, Dialog, Tooltip 等 |
| **数据库基础** | - | database/mod.rs | SQLite 连接管理、Schema 初始化 |
| **命令结果** | CommandResult\<T\> | mod.rs | 统一的 Tauri 命令返回格式 |

### 前端共享 Store

`useUIStore` 管理全局 UI 状态：

| 状态 | 类型 | 说明 |
|------|------|------|
| `activeTab` | `"inbox" \| "archived" \| "prompt-management" \| "ip-management"` | 当前激活的标签页 |
| `searchQuery` | `string` | 全局搜索关键字 |
| `theme` | `"light" \| "dark" \| "system"` | 主题模式 |
| `viewMode` | `"grid" \| "list"` | 图片视图模式 |
| `settingsOpen` | `boolean` | 设置面板开关 |
| `isQuickEditOpen` | `boolean` | 快速编辑弹窗开关 |
| `isImageViewerOpen` | `boolean` | 图片预览器开关 |
| `selectedIpId` | `string \| null` | 当前选中的 IP 角色（属于 App B） |
| `settings` | `Record<string, any>` | 本地设置缓存 |

---

## 当前代码结构

### 前端目录结构

```
src/
├── App.tsx                              # 应用外壳，标签页路由
├── main.tsx                             # React 入口
├── components/
│   ├── InboxView.tsx             [27KB] # App A: 待整理视图
│   ├── ArchivedView.tsx          [30KB] # App A: 已归档视图
│   ├── PromptGroupsView.tsx      [38KB] # App A: Prompt 模板管理
│   ├── ImageCard.tsx             [34KB] # App A: 图片卡片
│   ├── QuickEditModal.tsx        [52KB] # App A: 快速编辑
│   ├── BatchEditModal.tsx        [14KB] # App A: 批量编辑
│   ├── DropZone.tsx              [11KB] # App A: 拖拽导入
│   ├── SmartPromptRenderer.tsx    [8KB] # App A: Prompt 渲染器
│   ├── TemplateVariableEditor.tsx [7KB] # App A: 模板变量编辑
│   ├── IPManagementView.tsx      [91KB] # App B: IP 管理 ⚠️ 需拆分
│   ├── IPImagePickerModal.tsx     [6KB] # App B: 图片选择器
│   ├── ImageViewer.tsx           [18KB] # 共享: 图片预览器
│   ├── SettingsView.tsx          [59KB] # 共享: 设置视图
│   ├── ConfirmDialog.tsx          [2KB] # 共享: 确认对话框
│   ├── TrashView.tsx             [15KB] # 共享: 回收站
│   └── ui/                              # 共享: shadcn/ui 组件库
│       ├── button.tsx
│       ├── dialog.tsx
│       ├── dropdown-menu.tsx
│       ├── input.tsx
│       ├── scroll-area.tsx
│       ├── separator.tsx
│       ├── slider.tsx
│       ├── switch.tsx
│       ├── toaster.tsx
│       ├── toast.tsx
│       └── tooltip.tsx
├── hooks/
│   ├── useKeyboardShortcuts.ts    [4KB] # 共享: 键盘快捷键

│   └── useToast.ts                [4KB] # 共享: Toast 通知
├── stores/
│   └── index.ts                  [14KB] # 全部 Store 合并 ⚠️ 需拆分
├── services/
│   └── tauri.ts                  [28KB] # 全部 API 合并 ⚠️ 需拆分
├── lib/
│   └── utils.ts                         # 工具函数（cn 等）
└── styles/
    └── globals.css                      # 全局样式 + CSS 变量
```

### 后端目录结构

```
src-tauri/src/
├── main.rs                              # Tauri 主入口
├── lib.rs                       [5KB]   # 应用配置、插件注册、命令注册
├── commands/
│   ├── mod.rs                           # CommandResult<T> 定义 + 模块导出
│   ├── images.rs                [44KB]  # App A: 图片命令 (8个)
│   ├── vendors.rs               [10KB]  # App A: 厂商命令 (6个)
│   ├── tags.rs                   [2KB]  # App A: 标签命令 (2个)
│   ├── prompt_groups.rs         [16KB]  # App A: Prompt 组命令 (10个)
│   ├── classifier.rs             [8KB]  # App A: 分类器 (1个)
│   ├── scanner.rs               [15KB]  # App A+B: 扫描器 (4个)
│   ├── ip_assets.rs             [31KB]  # App B: IP 资产命令 (19个)
│   ├── ip_images.rs              [8KB]  # App B: IP 图片命令 (6个)
│   ├── watermark.rs             [26KB]  # 共享: 水印检测 (2个)
│   ├── watermark_removal.rs     [10KB]  # 共享: 水印移除 (2个)
│   ├── gemini_watermark_removal.rs [10KB] # 共享: Gemini 水印 (3个)

│   └── settings.rs               [3KB]  # 共享: 设置 (3个)
├── models/
│   ├── mod.rs                    [3KB]  # App A 模型定义
│   └── ip_assets.rs              [2KB]  # App B 模型定义
├── database/
│   └── mod.rs                   [14KB]  # Schema 定义 + 初始化 + 默认数据
└── test.rs                              # 测试文件
```

---

## 数据库架构

### 数据库概览

- **引擎**: SQLite (通过 rusqlite 0.32 绑定)
- **存储位置**: `{AppDataDir}/data/database.sqlite`
- **初始化方式**: 应用启动时自动创建表和索引（`CREATE TABLE IF NOT EXISTS`）
- **ORM**: 无 ORM，使用原生 SQL

### 数据表分域归属

```
┌─────────────────────────────────────────────────────────────┐
│                        SQLite Database                      │
│                                                             │
│  ┌─ App A (Prompt 域) ───────────────────────────────────┐  │
│  │                                                       │  │
│  │  vendors                    模型厂商                    │  │
│  │  models                     AI 模型                    │  │
│  │  images                     Prompt 图片主表             │  │
│  │  image_model_relations      图片-模型关联               │  │
│  │  tags                       标签（两域共享）             │  │
│  │  image_tag_relations        Prompt 图片-标签关联        │  │
│  │  prompt_groups              Prompt 模板组               │  │
│  │  image_prompt_group_relations 图片-Prompt组关联         │  │
│  │  processing_history         处理历史记录                 │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ App B (IP 域) ───────────────────────────────────────┐  │
│  │                                                       │  │
│  │  ip_assets                  IP 角色主表（含 path 字段） │  │
│  │  ip_images                  IP 图片主表（独立于images） │  │
│  │  ip_image_tag_relations     IP 图片-标签关联            │  │
│  │  ip_character_sheets        角色设定图                  │  │
│  │  ip_creations               衍生创作                   │  │
│  │  ip_sticker_packs           表情包套件                  │  │
│  │  ip_emojis                  表情图                     │  │
│  │  ip_sticker_pack_platforms  发布平台                    │  │
│  │  ip_relations               IP 角色关系                 │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ 共享 ────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │  tags                       标签（两域共用同一张表）     │  │
│  │  settings                   键值对设置                  │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### App A 域 — 表结构详解

#### vendors (AI 厂商)

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | 厂商 ID（如 "openai"） |
| name | TEXT | NOT NULL | 显示名称 |
| path | TEXT | UNIQUE | 文件路径标识 |
| icon | TEXT | - | 图标路径 |
| sort_order | INTEGER | DEFAULT 0 | 排序权重 |
| is_active | INTEGER | DEFAULT 1 | 是否启用 |
| created_at | TEXT | NOT NULL | 创建时间 |
| updated_at | TEXT | NOT NULL | 更新时间 |

> **预置厂商**: Unknown、OpenAI、Google、Midjourney

#### models (AI 模型)

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | 模型 ID（如 "gpt-image-2"） |
| vendor_id | TEXT | FK → vendors(id) | 所属厂商 |
| name | TEXT | NOT NULL | 模型名称 |
| path | TEXT | NOT NULL | 文件路径标识 |
| version | TEXT | - | 版本号 |
| description | TEXT | - | 模型描述 |
| sort_order | INTEGER | DEFAULT 0 | 排序权重 |
| is_active | INTEGER | DEFAULT 1 | 是否启用 |
| created_at | TEXT | NOT NULL | 创建时间 |
| updated_at | TEXT | NOT NULL | 更新时间 |

> **预置模型**: Unknown Model, GPT Image 2, DALL-E 3, Nano Banana, Nano Banana Pro, Imagen 3, Midjourney v6

#### images (图片)

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID v4 |
| filename | TEXT | NOT NULL | 当前文件名 |
| original_filename | TEXT | NOT NULL | 原始文件名 |
| storage_vendor_id | TEXT | FK → vendors(id) | 存储厂商 |
| storage_model_id | TEXT | FK → models(id) | 存储模型 |
| relative_path | TEXT | NOT NULL | 相对路径 |
| absolute_path | TEXT | NOT NULL | 绝对路径 |
| primary_model_id | TEXT | FK → models(id) | 主要生成模型 |
| status | TEXT | DEFAULT 'inbox' | 状态: inbox / archived |
| prompt | TEXT | - | 生成 Prompt |
| negative_prompt | TEXT | - | 反向 Prompt |
| file_size | INTEGER | - | 文件大小 (bytes) |
| width | INTEGER | - | 图片宽度 |
| height | INTEGER | - | 图片高度 |
| file_hash | TEXT | - | SHA-256 哈希 |
| format | TEXT | - | 文件格式 (png/jpg/webp) |
| has_watermark | INTEGER | DEFAULT 0 | 是否有水印 |
| watermark_platform | TEXT | - | 水印来源平台 |
| watermark_detected | INTEGER | DEFAULT 0 | 是否已检测 |
| watermark_removed | INTEGER | DEFAULT 0 | 是否已移除 |
| created_at | TEXT | NOT NULL | 图片创建时间 |
| imported_at | TEXT | NOT NULL | 导入时间 |
| archived_at | TEXT | - | 归档时间 |

#### prompt_groups (Prompt 模板组)

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID v4 |
| prompt | TEXT | NOT NULL | Prompt 内容 |
| negative_prompt | TEXT | - | 反向 Prompt |
| name | TEXT | - | 模板名称 |
| description | TEXT | - | 模板描述 |
| template_schema | TEXT | - | 变量定义 (JSON) |
| category | TEXT | - | 网站一级分类 |
| tags | TEXT | - | 标签数组(JSON) |
| price | REAL | DEFAULT 0 | 模板售价 |
| is_published | INTEGER | DEFAULT 0 | 是否允许上架 |
| publish_status | TEXT | DEFAULT 'draft' | 发布状态 |
| remote_slug | TEXT | - | 云端商品 slug |
| remote_url | TEXT | - | 云端商品地址 |
| last_published_at | TEXT | - | 最近发布时间 |
| created_at | TEXT | NOT NULL | 创建时间 |
| updated_at | TEXT | NOT NULL | 更新时间 |

#### 关联表

| 表名 | 主键 | 说明 |
|------|------|------|
| image_model_relations | (image_id, model_id) | 图片与模型的多对多关系 |
| image_tag_relations | (image_id, tag_id) | 图片与标签的多对多关系 |
| image_prompt_group_relations | (image_id, prompt_group_id) | 图片与 Prompt 商品的多对多关系，包含展示元数据 |

#### image_prompt_group_relations (图片-模板商品关系)

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| image_id | TEXT | PK/FK → images(id) | 图片 ID |
| prompt_group_id | TEXT | PK/FK → prompt_groups(id) | 模板 ID |
| role | TEXT | DEFAULT 'gallery' | 展示角色 |
| is_cover | INTEGER | DEFAULT 0 | 是否为封面 |
| sort_order | INTEGER | DEFAULT 0 | 展示顺序 |
| caption | TEXT | - | 图片说明 |
| variant_key | TEXT | - | 变体键，例如模型分组 |
| variant_json | TEXT | - | 变体上下文快照(JSON) |
| is_sync_enabled | INTEGER | DEFAULT 1 | 是否同步到网站 |
| sync_status | TEXT | DEFAULT 'pending' | 图片同步状态 |
| remote_url | TEXT | - | 云端图片地址 |

### App B 域 — 表结构详解

#### ip_assets (IP 角色)

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID v4 |
| name | TEXT | NOT NULL | 角色名称 |
| path | TEXT | UNIQUE NOT NULL | 路径标识（用于目录命名和扫描匹配） |
| avatar_path | TEXT | - | 头像图片路径 |
| inspiration | TEXT | - | 灵感来源 |
| description | TEXT | - | 角色描述 |
| created_at | TEXT | NOT NULL | 创建时间 |
| updated_at | TEXT | NOT NULL | 更新时间 |

> **path 字段说明**: 只允许小写字母、数字、连字符和下划线。用于归档目录命名（`ip_archived/{path}/`）和扫描时的目录匹配。创建时若不填则自动从 name 生成。

#### ip_images (IP 图片) — 新增

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | `ipimg_` 前缀 + UUID |
| filename | TEXT | NOT NULL | 当前文件名 |
| original_filename | TEXT | NOT NULL | 原始文件名 |
| ip_id | TEXT | FK → ip_assets(id) CASCADE | 所属 IP 角色 |
| relative_path | TEXT | NOT NULL | 相对路径 |
| absolute_path | TEXT | NOT NULL | 绝对路径 |
| status | TEXT | DEFAULT 'inbox' | 状态: inbox / tagged / archived |
| file_size | INTEGER | - | 文件大小 (bytes) |
| width | INTEGER | - | 图片宽度 |
| height | INTEGER | - | 图片高度 |
| file_hash | TEXT | - | SHA-256 哈希 |
| format | TEXT | - | 文件格式 |
| has_watermark | INTEGER | DEFAULT 0 | 是否有水印 |
| watermark_platform | TEXT | - | 水印来源平台 |
| watermark_detected | INTEGER | DEFAULT 0 | 是否已检测 |
| watermark_removed | INTEGER | DEFAULT 0 | 是否已移除 |
| created_at | TEXT | NOT NULL | 创建时间 |
| imported_at | TEXT | NOT NULL | 导入时间 |
| archived_at | TEXT | - | 归档时间 |

> **与 images 表的区别**: 无 vendor/model 关联，无 prompt/negative_prompt，直接通过 `ip_id` 关联 IP 角色。

#### ip_character_sheets (角色设定图)

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID v4 |
| ip_id | TEXT | FK → ip_assets(id) CASCADE | 所属 IP |
| image_path | TEXT | NOT NULL | 图片文件路径 |
| sheet_type | TEXT | NOT NULL | 类型（正面/侧面/背面等） |
| sort_order | INTEGER | DEFAULT 0 | 排序 |
| created_at | TEXT | NOT NULL | 创建时间 |

#### ip_sticker_packs (表情包套件)

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID v4 |
| ip_id | TEXT | FK → ip_assets(id) CASCADE | 所属 IP |
| name | TEXT | NOT NULL | 套件名称 |
| description | TEXT | - | 套件描述 |
| created_at | TEXT | NOT NULL | 创建时间 |
| updated_at | TEXT | NOT NULL | 更新时间 |

#### ip_emojis (表情图)

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID v4 |
| ip_id | TEXT | FK → ip_assets(id) CASCADE | 所属 IP |
| pack_id | TEXT | FK → ip_sticker_packs(id) SET NULL | 所属套件（可选） |
| image_path | TEXT | NOT NULL | 表情图片路径 |
| trigger_word | TEXT | - | 触发词 |
| sort_order | INTEGER | DEFAULT 0 | 排序 |
| created_at | TEXT | NOT NULL | 创建时间 |

#### ip_sticker_pack_platforms (发布平台)

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK | UUID v4 |
| pack_id | TEXT | FK → ip_sticker_packs(id) CASCADE | 所属套件 |
| platform_name | TEXT | NOT NULL | 平台名称 |
| pack_name_on_platform | TEXT | - | 平台上的包名 |
| emoji_size_spec | TEXT | - | 平台尺寸规格 |
| status | TEXT | DEFAULT 'Draft' | 发布状态 |
| publish_url | TEXT | - | 发布链接 |
| downloads_count | INTEGER | DEFAULT 0 | 下载量 |
| updated_at | TEXT | NOT NULL | 更新时间 |

#### ip_relations (IP 关系)

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| ip_a_id | TEXT | FK → ip_assets(id) CASCADE | IP A |
| ip_b_id | TEXT | FK → ip_assets(id) CASCADE | IP B |
| relation_type | TEXT | NOT NULL | 关系类型 |
| description | TEXT | - | 关系描述 |
| created_at | TEXT | NOT NULL | 创建时间 |

> **主键**: (ip_a_id, ip_b_id, relation_type) 复合主键

### 索引清单

| 索引名 | 表 | 列 | 用途 |
|--------|------|------|------|
| idx_images_status | images | status | 按状态筛选 |
| idx_images_storage | images | storage_vendor_id, storage_model_id | 按存储位置查询 |
| idx_images_primary_model | images | primary_model_id | 按主要模型筛选 |
| idx_images_imported | images | imported_at DESC | 按导入时间排序 |
| idx_images_prompt | images | prompt | 按 prompt 搜索 |
| idx_imr_model | image_model_relations | model_id | 模型关联查询 |
| idx_itr_tag | image_tag_relations | tag_id | Prompt 图片标签查询 |
| idx_ipgr_group | image_prompt_group_relations | prompt_group_id | Prompt 组查询 |
| idx_ip_images_status | ip_images | status | IP 图片状态筛选 |
| idx_ip_images_ip | ip_images | ip_id | 按 IP 角色查询 |
| idx_ip_images_imported | ip_images | imported_at DESC | 按导入时间排序 |
| idx_ip_itr_tag | ip_image_tag_relations | tag_id | IP 图片标签查询 |
| idx_ip_character_sheets_ip | ip_character_sheets | ip_id | IP 设定图查询 |
| idx_ip_sticker_packs_ip | ip_sticker_packs | ip_id | IP 贴纸包查询 |
| idx_ip_emojis_pack | ip_emojis | pack_id | 表情所属套件查询 |
| idx_ip_spp_pack | ip_sticker_pack_platforms | pack_id | 平台所属套件查询 |

---

## 前端架构

### 状态管理架构

```
┌──────────────────────────────────────────────────────┐
│                   Zustand Stores                     │
│                                                      │
│  ┌──────────────────┐  ┌──────────────────┐          │
│  │  useImageStore   │  │  useVendorStore  │          │
│  │                  │  │                  │          │
│  │  inboxImages[]   │  │  vendors[]       │   App A  │
│  │  archivedImages[]│  │  isLoading       │          │
│  │  selectedImages[]│  └──────────────────┘          │
│  │  isLoading       │                                │
│  └──────────────────┘  ┌──────────────────┐          │
│                        │  useTagStore     │          │
│                        │                  │   App A  │
│                        │  tags[]          │          │
│                        │  popularTags[]   │          │
│                        └──────────────────┘          │
│                                                      │
│  ┌──────────────────┐                                │
│  │ useIpImageStore  │                                │
│  │                  │                                │
│  │  inboxImages[]   │                         App B  │
│  │  archivedImages[]│  (IpImageWithRelations)        │
│  │  selectedImages[]│                                │
│  └──────────────────┘                                │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │  useUIStore                                  │    │
│  │                                              │    │
│  │  activeTab  │  theme  │  viewMode            │    │
│  │  searchQuery  │  settings  │  settingsOpen   │ 共享│
│  │  isQuickEditOpen  │  isImageViewerOpen       │    │
│  │  selectedIpId  ← (属于 App B 的状态)         │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

### 主题系统

主题系统支持三种模式，并允许为每种模式分别设置主题色：

```
主题模式: light │ dark │ system
                         │
                         ▼
              ┌──────────────────────┐
              │ 检测系统偏好           │
              │ prefers-color-scheme │
              └──────────┬───────────┘
                         ▼
              ┌──────────────────────┐
              │ 应用 CSS 变量         │
              │ --primary-light      │  浅色主题色 (默认: #2563eb)
              │ --primary-dark       │  深色主题色 (默认: #60a5fa)
              │ 颜色转换: HEX → HSL  │
              └──────────────────────┘
```

### 组件层次（简化）

```
App.tsx
├── Header (导航栏 + 搜索 + 主题切换 + 设置)
├── Main Content (根据 activeTab 切换)
│   ├── InboxView          ← Tab: 待整理
│   │   ├── DropZone
│   │   └── ImageCard[]
│   ├── ArchivedView       ← Tab: 已归档
│   │   └── ImageCard[]
│   ├── PromptGroupsView   ← Tab: Prompt 管理
│   │   └── SmartPromptRenderer
│   │       └── TemplateVariableEditor
│   └── IPManagementView   ← Tab: IP 管理
│       └── IPImagePickerModal
├── QuickEditModal         (全局弹窗)
├── ImageViewer            (全局弹窗)
├── SettingsView           (全局弹窗)
└── Toaster                (通知容器)
```

---

## 后端架构

### 命令注册流程

```rust
// lib.rs — Tauri 应用入口
tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())

    .setup(|app| {
        // 1. 获取应用数据目录
        // 2. 创建 data/ 子目录
        // 3. 初始化 SQLite 数据库 (database.sqlite)
    })
    .invoke_handler(tauri::generate_handler![
        // 注册 66 个命令...
    ])
```

### 数据库初始化流程

```
应用启动
    │
    ▼
获取 AppDataDir
    │
    ▼
创建 data/ 目录
    │
    ▼
打开/创建 database.sqlite
    │
    ▼
⚠️ DROP 所有 IP 表     ← 开发阶段临时行为，需修复！
    │
    ▼
CREATE TABLE IF NOT EXISTS (全部表)
    │
    ▼
ALTER TABLE 添加新列 (兼容升级)
    │
    ▼
INSERT 默认数据 (厂商、模型、标签)
    │
    ▼
应用就绪
```

### 统一命令返回格式

所有 Tauri 命令通过 `CommandResult<T>` 返回统一格式：

```rust
pub struct CommandResult<T> {
    pub success: bool,       // 是否成功
    pub data: Option<T>,     // 成功时返回数据
    pub error: Option<String>, // 失败时返回错误消息
}
```

---

## 数据流与通信机制

### 前后端通信

```
┌──────────────────────────────────────────────────┐
│                   Frontend                       │
│                                                  │
│  组件 → Store Action → API Service → invoke()    │
│                                                  │
│     const result = await imageApi.getInboxImages()│
│                           │                      │
│                    invoke("get_inbox_images",     │
│                           { dbPath })             │
└───────────────────────────┼──────────────────────┘
                            │  IPC (JSON 序列化)
                            ▼
┌───────────────────────────────────────────────────┐
│                   Backend                         │
│                                                   │
│  #[tauri::command]                                │
│  fn get_inbox_images(db_path: String)             │
│      → Connection::open(db_path)                  │
│      → SQL 查询                                    │
│      → 序列化为 CommandResult<Vec<ImageWithRelations>>│
│      → 返回 JSON                                   │
└───────────────────────────────────────────────────┘
```

### 数据库路径传递模式

当前架构中，每个命令调用都通过前端传入 `dbPath` 参数：

```typescript
// 前端: 每次调用都获取数据库路径
export async function getDbPath(): Promise<string> {
    const appDir = await appDataDir();
    const dataDir = await join(appDir, "data");
    return await join(dataDir, "database.sqlite");
}

// 每个 API 方法都调用 getDbPath()
async getInboxImages(): Promise<ImageWithRelations[]> {
    const dbPath = await getDbPath();  // ← 每次都获取
    const result = await invoke("get_inbox_images", { dbPath });
    // ...
}
```

> **⚠️ 优化建议**: 考虑在后端使用 Tauri 的 `State` 管理数据库连接，避免每次命令都重新打开连接。

---

## 模块耦合度分析

### 耦合度矩阵

| 关系 | 耦合方式 | 耦合程度 | 说明 |
|------|----------|:--------:|------|
| App A ↔ App B | 无直接依赖 | 🟢 **松耦合** | IP 模块使用 `image_path` 字符串而非外键引用图片 |
| App A ↔ 共享模块 | 使用共享基础设施 | 🟡 **正常依赖** | 使用 Settings、Watermark、UI 组件等 |
| App B ↔ 共享模块 | 使用共享基础设施 | 🟡 **正常依赖** | 使用 Settings、UI 组件等 |
| Prompt ↔ Image | 外键关联 | 🔴 **紧耦合** | `image_prompt_group_relations` 有外键，且承载商品展示元数据，这是**有意设计** |
| Store 文件 | 全部在 index.ts | 🔴 **物理耦合** | 所有 Store 合并在单一文件中 |
| API 文件 | 全部在 tauri.ts | 🔴 **物理耦合** | 所有 API 合并在单一文件中 |

### 关键设计决策

1. **IP 模块使用 `image_path` 而非外键**

   ```sql
   -- IP 角色设定图：通过文件路径引用，不依赖 images 表
   CREATE TABLE ip_character_sheets (
       ip_id       TEXT NOT NULL,
       image_path  TEXT NOT NULL,  -- ← 字符串路径，非外键！
       ...
   );
   ```

   这是有意为之的松耦合设计，使得 IP 模块可以独立运作，不需要 images 表的存在。

2. **Prompt 商品 与 Image 的紧耦合**

   ```sql
   -- Prompt 商品关联：通过外键强关联到 images 表，并补充展示元数据
   CREATE TABLE image_prompt_group_relations (
       image_id        TEXT NOT NULL,
       prompt_group_id TEXT NOT NULL,
       role            TEXT DEFAULT 'gallery',
       is_cover        INTEGER DEFAULT 0,
       sort_order      INTEGER DEFAULT 0,
       variant_key     TEXT,
       FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
   );
   ```

   这也是有意设计。归档图片一方面是本地资产，另一方面直接承担模板商品的封面、详情画廊、模型效果证明职责，两者天然紧耦合。

---

## 未来模块化重构方案

### 前端目标结构

```
src/
├── modules/
│   ├── prompt/                    # === App A 域 ===
│   │   ├── components/
│   │   │   ├── InboxView.tsx
│   │   │   ├── ArchivedView.tsx
│   │   │   ├── PromptGroupsView.tsx
│   │   │   ├── ImageCard.tsx
│   │   │   ├── QuickEditModal.tsx
│   │   │   ├── BatchEditModal.tsx
│   │   │   ├── DropZone.tsx
│   │   │   ├── SmartPromptRenderer.tsx
│   │   │   └── TemplateVariableEditor.tsx
│   │   ├── stores/
│   │   │   ├── useImageStore.ts
│   │   │   ├── useVendorStore.ts
│   │   │   └── useTagStore.ts
│   │   ├── services/
│   │   │   ├── imageApi.ts
│   │   │   ├── vendorApi.ts
│   │   │   ├── tagApi.ts
│   │   │   ├── promptApi.ts
│   │   │   ├── classifyApi.ts
│   │   │   └── scannerApi.ts
│   │   └── types/
│   │       └── index.ts           # Image, Vendor, Model, Tag, PromptGroup
│   │
│   ├── ip/                        # === App B 域 ===
│   │   ├── components/
│   │   │   ├── IPListPanel.tsx          # 从 IPManagementView 拆出
│   │   │   ├── IPDetailPanel.tsx        # 从 IPManagementView 拆出
│   │   │   ├── IPCharacterSheets.tsx    # 从 IPManagementView 拆出
│   │   │   ├── IPCreations.tsx          # 从 IPManagementView 拆出
│   │   │   ├── IPStickerPacks.tsx       # 从 IPManagementView 拆出
│   │   │   ├── IPRelations.tsx          # 从 IPManagementView 拆出
│   │   │   └── IPImagePickerModal.tsx
│   │   ├── stores/
│   │   │   └── useIPStore.ts
│   │   ├── services/
│   │   │   └── ipApi.ts
│   │   └── types/
│   │       └── index.ts           # IpAsset, IpEmoji, IpStickerPack, etc.
│   │
│   └── shared/                    # === 共享模块 ===
│       ├── components/
│       │   ├── ImageViewer.tsx
│       │   ├── SettingsView.tsx
│       │   ├── ConfirmDialog.tsx
│       │   ├── TrashView.tsx
│       │   └── ui/                # shadcn/ui 组件
│       ├── stores/
│       │   └── useUIStore.ts
│       ├── services/
│       │   ├── watermarkApi.ts
│       │   ├── geminiWatermarkApi.ts
│       │   ├── watcherApi.ts
│       │   ├── settingsApi.ts
│       │   └── dbPath.ts          # getDbPath() 公共函数
│       ├── hooks/
│       │   ├── useKeyboardShortcuts.ts
│       │   ├── useFolderWatcher.ts
│       │   └── useToast.ts
│       ├── types/
│       │   └── index.ts           # CommandResult, Theme, ViewMode
│       └── lib/
│           └── utils.ts
│
├── App.tsx                        # 应用外壳，组合各模块
└── main.tsx                       # React 入口
```

### 后端目标结构

```
src-tauri/src/
├── modules/
│   ├── prompt/                    # === App A 域 ===
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── images.rs
│   │   │   ├── vendors.rs
│   │   │   ├── tags.rs
│   │   │   ├── prompt_groups.rs
│   │   │   ├── classifier.rs
│   │   │   └── scanner.rs
│   │   ├── models/
│   │   │   └── mod.rs             # Vendor, Model, Image, Tag, PromptGroup
│   │   └── database/
│   │       └── schema.rs          # App A 域的表定义 + 迁移
│   │
│   ├── ip/                        # === App B 域 ===
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   └── ip_assets.rs
│   │   ├── models/
│   │   │   └── mod.rs             # IpAsset, IpEmoji, IpStickerPack, etc.
│   │   └── database/
│   │       └── schema.rs          # App B 域的表定义 + 迁移
│   │
│   └── shared/                    # === 共享模块 ===
│       ├── commands/
│       │   ├── mod.rs             # CommandResult<T>
│       │   ├── watermark.rs
│       │   ├── watermark_removal.rs
│       │   ├── gemini_watermark_removal.rs
│       │   ├── watcher.rs
│       │   └── settings.rs
│       ├── models/
│       │   └── mod.rs
│       └── database/
│           ├── connection.rs      # 连接管理（可用 Tauri State 单例）
│           └── schema.rs          # settings 表定义
│
├── lib.rs                         # 应用配置，按模块组合命令注册
└── main.rs                        # 入口
```

### 重构优先级

| 优先级 | 任务 | 复杂度 | 影响 |
|:------:|------|:------:|------|
| P0 | 拆分 `IPManagementView.tsx` (91KB) | 🟡 中 | 可维护性大幅提升 |
| P0 | 移除 IP 表的 DROP + RECREATE 行为 | 🟢 低 | 数据安全 |
| P1 | 拆分 `stores/index.ts` 为独立 Store 文件 | 🟢 低 | 代码组织 |
| P1 | 拆分 `services/tauri.ts` 为独立 API 文件 | 🟢 低 | 代码组织 |
| P2 | 建立 `modules/` 目录结构 | 🟡 中 | 架构清晰度 |
| P2 | 数据库连接单例化（Tauri State） | 🟡 中 | 性能优化 |
| P3 | 数据库迁移系统 | 🔴 高 | 版本升级安全 |

---

## 应用拆分策略

当需要将 sanOmni 拆分为两个独立应用时，遵循以下策略：

### 拆分步骤

```
         sanOmni (当前)
               │
               ▼
    ┌──────────┴──────────┐
    │                     │
    ▼                     ▼
sanPromptBox          sanIPBox
(App A + 共享)         (App B + 共享)
```

#### 步骤 1: 提取共享模块为独立包

```
# 前端: 提取为 npm 包或 workspace package
packages/
├── san-media-core/           # 共享前端代码
│   ├── components/
│   ├── hooks/
│   ├── services/
│   └── package.json

# 后端: 提取为本地 Rust crate
crates/
├── san-media-core/           # 共享后端代码
│   ├── src/
│   │   ├── commands/
│   │   ├── models/
│   │   └── database/
│   └── Cargo.toml
```

#### 步骤 2: 各应用只包含自己的域模块 + 共享模块

**sanPromptBox (App A)**:
```toml
# Cargo.toml
[dependencies]
san-media-core = { path = "../crates/san-media-core" }
```

```rust
// lib.rs — 只注册 App A + 共享的命令
.invoke_handler(tauri::generate_handler![
    // App A 命令
    commands::images::import_image,
    commands::vendors::get_vendors,
    commands::prompt_groups::create_prompt_group,
    // ...
    // 共享命令
    san_media_core::commands::settings::get_settings,
    san_media_core::commands::watermark::detect_watermark,
    // ...
    // ❌ 不包含 ip_assets 相关命令
])
```

**sanIPBox (App B)**:
```rust
// lib.rs — 只注册 App B + 共享的命令
.invoke_handler(tauri::generate_handler![
    // App B 命令
    commands::ip_assets::get_ip_assets,
    commands::ip_assets::create_ip_asset,
    // ...
    // 共享命令
    san_media_core::commands::settings::get_settings,
    // ...
    // ❌ 不包含 images、vendors、prompt_groups 相关命令
])
```

#### 步骤 3: 前端路由简化

**sanPromptBox**:
```typescript
// App.tsx — 只保留 App A 的标签页
const tabs = ["inbox", "archived", "prompt-management"];
```

**sanIPBox**:
```typescript
// App.tsx — 只保留 App B 的标签页（可扩展更多）
const tabs = ["ip-management"];
```

#### 步骤 4: 数据库按域分离

由于两个域的数据表已经天然分离（无交叉外键），只需在各自的 schema 中保留自己域的表定义即可。

```
sanPromptBox 数据库:
  vendors + models + images + tags + prompt_groups + 关联表 + settings

sanIPBox 数据库:
  ip_assets + ip_character_sheets + ip_creations + ip_sticker_packs
  + ip_emojis + ip_sticker_pack_platforms + ip_relations + settings
```

### 拆分可行性评估

| 维度 | 评估 | 说明 |
|------|:----:|------|
| 数据表分离 | ✅ 已就绪 | 两个域无交叉外键 |
| 后端命令分离 | ✅ 已就绪 | 命令分文件组织，注册列表可直接裁剪 |
| 前端组件分离 | ⚠️ 需重构 | 当前 Store 和 Service 文件混在一起 |
| 共享模块提取 | ⚠️ 需工作 | 需建立包/crate 边界 |
| UI Store 分离 | ⚠️ 需重构 | `selectedIpId` 混在 useUIStore 中 |

---

## 已知技术债务

| 编号 | 严重度 | 问题 | 位置 | 说明 |
|:----:|:------:|------|------|------|
| TD-1 | 🔴 严重 | IP 表在每次启动时被 DROP + RECREATE | `database/mod.rs:8-14` | **用户数据会丢失！** 这是开发阶段的临时代码，必须在正式发布前移除 |
| TD-2 | 🟡 中等 | 所有 Store 合并在单一文件 | `stores/index.ts` | 14KB，4 个 Store + 所有类型定义混在一起 |
| TD-3 | 🟡 中等 | 所有 API 合并在单一文件 | `services/tauri.ts` | 28KB，8+ 个 API 命名空间混在一起 |
| TD-4 | 🟡 中等 | IPManagementView 过于庞大 | `components/IPManagementView.tsx` | 91KB 的单文件组件，应拆分为子组件 |
| TD-5 | 🟡 中等 | 每次命令都重新获取数据库路径 | `services/tauri.ts` | `getDbPath()` 每次 API 调用都执行，应缓存或使用后端 State |
| TD-6 | 🟢 低 | 无数据库迁移系统 | `database/mod.rs` | 使用 `ALTER TABLE` 手动添加列，缺少版本化迁移 |
| TD-7 | 🟢 低 | `selectedIpId` 放在 useUIStore 中 | `stores/index.ts:400` | 应移至独立的 IP Store |
| TD-8 | 🟢 低 | QuickEditModal 文件过大 | `components/QuickEditModal.tsx` | 52KB，可拆分为子组件 |
| TD-9 | 🟢 低 | SettingsView 文件过大 | `components/SettingsView.tsx` | 59KB，可按设置分类拆分 |

---

## 附录: 命令注册总览

### 按域分类的 66 个 Tauri 命令

#### App A: Prompt 域 (29 个命令)

<details>
<summary>点击展开完整列表</summary>

**images.rs** (8):
`import_image`, `get_inbox_images`, `get_archived_images`, `update_image`, `delete_image`, `archive_images`, `unarchive_images`, `update_missing_formats`, `get_all_images`

**vendors.rs** (6):
`get_vendors`, `add_vendor`, `update_vendor`, `delete_vendor`, `add_model`, `update_model`, `delete_model`

**tags.rs** (2):
`get_tags`, `add_tag`

**prompt_groups.rs** (10):
`create_prompt_group`, `get_prompt_groups`, `get_prompt_group_with_images`, `get_prompt_groups_for_image`, `add_images_to_prompt_group`, `remove_images_from_prompt_group`, `set_prompt_groups_for_image`, `update_prompt_group`, `delete_prompt_group`, `auto_group_by_prompt`

**classifier.rs** (1):
`classify_image`

**scanner.rs** (2):
`scan_archived_directory`, `cleanup_inbox_directory`

</details>

#### App B: IP 域 (21 个命令)

<details>
<summary>点击展开完整列表</summary>

**ip_assets.rs** (21):
`get_ip_assets`, `get_ip_asset_detail`, `create_ip_asset`, `update_ip_asset`, `delete_ip_asset`, `add_ip_character_sheets`, `remove_ip_character_sheets`, `add_ip_creations`, `remove_ip_creations`, `add_ip_relation`, `remove_ip_relation`, `create_ip_sticker_pack`, `update_ip_sticker_pack`, `delete_ip_sticker_pack`, `add_ip_sticker_pack_platform`, `update_ip_sticker_pack_platform`, `delete_ip_sticker_pack_platform`, `add_ip_emojis`, `update_ip_emoji_trigger_word`, `delete_ip_emojis`, `move_ip_emojis_to_pack`

</details>

#### 共享 (16 个命令)

<details>
<summary>点击展开完整列表</summary>

**watermark.rs** (2):
`detect_watermark`, `batch_detect_watermarks`

**watermark_removal.rs** (2):
`remove_watermark`, `batch_remove_watermarks`

**gemini_watermark_removal.rs** (3):
`remove_gemini_watermark`, `batch_remove_gemini_watermarks`, `auto_remove_gemini_watermark`

**watcher.rs** (3):
`start_folder_watcher`, `stop_folder_watcher`, `get_active_watchers`

**settings.rs** (3):
`get_settings`, `save_settings`, `reset_database`

</details>

---

> 📝 本文档将随项目迭代持续更新。如需讨论架构决策，请在项目 Issue 中提出。
