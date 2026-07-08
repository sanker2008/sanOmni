# sanOmni - 全方位管理系统

> sanOmni，意为全方位的 AI 创作辅助中心。

sanOmni 是一个专注于 AI 创作者工作流的跨平台桌面客户端应用（基于 Tauri 2.0 构建）。它不仅是一个强大的图片管理工具，更是创作者的灵感库、资产库和生产力工具箱。

## 🌟 核心理念 (三大功能域)

系统当前**包含三个独立的功能领域**，以一个统一的应用形式打包发布：

1. **sanPrompt (Prompt 模板商品管理)**：专注于结构化管理、跨模型验证和商业化发布 AI 绘画 Prompt 模板，管理生成的灵感图库与商品素材。
2. **sanIP (IP 资产管理)**：专注于角色 IP 设定、三视图、衍生作品、表情包分发和状态跟踪。
3. **sanLabs 工具箱 (Product Image Maker 等)**：提供独立、零后端依赖的客户端本地图片处理工具箱，目前内置强大的“产品图制作”画板功能，支持图层管理、模板保存与图片合成。

这三大功能域在架构设计上**保持领域分离**，确保代码高内聚、低耦合。

## ✨ 主要特性

### 📝 sanPrompt
- 🎨 **智能分类** - 按厂商和模型自动分类图片
- 🏷️ **标签管理** - 灵活的标签系统，支持多标签
- 📝 **Prompt 管理** - 记录和管理图片生成提示词
- ✨ **Prompt 对比** - 对比同一 prompt 在不同模型下的效果
- 📦 **Prompt 商品化** - 支持 template_schema、统一分类、价格、上下架和云端发布状态
- 🖼️ **模板图库编排** - 支持封面、画廊排序、图片说明、模型变体证据
- 🗂️ **归档系统** - 待整理 → 标记 → 归档的工作流程
- 🔧 **厂商管理** - 自由管理 AI 厂商和模型

### 🎭 sanIP
- 🧑‍🎨 **IP 角色管理** - IP 角色的增删改查和详情管理
- 🖼️ **角色设定图** - 管理 IP 角色的 character sheet
- 🎨 **创作管理** - 管理基于 IP 角色创作的图片作品
- 📱 **表情包管理** - 制作和管理表情包，支持触发词
- 🚀 **平台发布** - 支持微信、Telegram 等平台的表情包发布
- 🔗 **IP 关系** - 管理 IP 角色之间的关联关系

### 🧪 sanLabs 工具箱
- 🖼️ **产品图制作** - 基于画布的图层合成与海报制作
- 🪄 **PNG 转 SVG** - 本地化位图转矢量图工具，支持高级平滑度调节与等比预览 🆕
- 📑 **图层管理** - 支持文字层、图片层自由编排
- 💾 **模板保存** - 保存画布配置，一键复用设计
- 📦 **零依赖运行** - 不依赖数据库的本地化工具
# sanOmni - 全方位管理系统

> sanOmni，意为全方位的 AI 创作辅助中心。

sanOmni 是一个专注于 AI 创作者工作流的跨平台桌面客户端应用（基于 Tauri 2.0 构建）。它不仅是一个强大的图片管理工具，更是创作者的灵感库、资产库和生产力工具箱。

## 🌟 核心理念 (三大功能域)

系统当前**包含三个独立的功能领域**，以一个统一的应用形式打包发布：

1. **sanPrompt (Prompt 模板商品管理)**：专注于结构化管理、跨模型验证和商业化发布 AI 绘画 Prompt 模板，管理生成的灵感图库与商品素材。
2. **sanIP (IP 资产管理)**：专注于角色 IP 设定、三视图、衍生作品、表情包分发和状态跟踪。
3. **sanLabs 工具箱 (Product Image Maker 等)**：提供独立、零后端依赖的客户端本地图片处理工具箱，目前内置强大的“产品图制作”画板功能，支持图层管理、模板保存与图片合成。

这三大功能域在架构设计上**保持领域分离**，确保代码高内聚、低耦合。

## ✨ 主要特性

### 📝 sanPrompt
- 🎨 **智能分类** - 按厂商和模型自动分类图片
- 🏷️ **标签管理** - 灵活的标签系统，支持多标签
- 📝 **Prompt 管理** - 记录和管理图片生成提示词
- ✨ **Prompt 对比** - 对比同一 prompt 在不同模型下的效果
- 📦 **Prompt 商品化** - 支持 template_schema、统一分类、价格、上下架和云端发布状态
- 🖼️ **模板图库编排** - 支持封面、画廊排序、图片说明、模型变体证据
- 🗂️ **归档系统** - 待整理 → 标记 → 归档的工作流程
- 🔧 **厂商管理** - 自由管理 AI 厂商和模型

### 🎭 sanIP
- 🧑‍🎨 **IP 角色管理** - IP 角色的增删改查和详情管理
- 🖼️ **角色设定图** - 管理 IP 角色的 character sheet
- 🎨 **创作管理** - 管理基于 IP 角色创作的图片作品
- 📱 **表情包管理** - 制作和管理表情包，支持触发词
- 🚀 **平台发布** - 支持微信、Telegram 等平台的表情包发布
- 🔗 **IP 关系** - 管理 IP 角色之间的关联关系

### 🧪 sanLabs 工具箱
- 🖼️ **产品图制作** - 基于画布的图层合成与海报制作
- 💡 **灵感画布** - 搭载 Excalidraw 无边框白板，支持本地无缝记录突发灵感与原型流程图 🆕
- 🪄 **高级抠图 (Pro)** - 搭载双引擎机制的离线 AI 抠图，支持 OpenCV 形态学防误扣漏洞填补与实时 Canvas 撤销笔刷交互修补 🆕
- 🪄 **PNG 转 SVG** - 本地化位图转矢量图工具，支持高级平滑度调节与等比预览 🆕
- 📑 **图层管理** - 支持文字层、图片层自由编排
- 💾 **模板保存** - 保存画布配置，一键复用设计
- 📦 **零依赖运行** - 不依赖数据库的本地化工具

### 🔧 通用功能
- 💧 **水印检测** - 自动检测和去除图片水印（标准 + Gemini）
- 👀 **文件扫描** - 自动扫描文件夹缺失或失效图片
- 🎯 **快速编辑** - 双击图片快速编辑信息
- 🔍 **搜索筛选** - 按厂商、模型、标签快速筛选
- 🌓 **主题切换** - 支持浅色/深色/跟随系统，并可分别设置普通模式和暗黑模式主题色
- ☁️ **高级云端同步** - 内置极速增量同步引擎，配套专属私有化服务端 `sanomni-sync-server`。支持精细化的单向推送/拉取控制、全聚合的“人类可读”同步时间轴、一键强制全量覆盖、以及智能的文件垃圾回收保护 🆕
- 🔄 **自动更新** - 接入 Tauri Updater 实现带进度条的无缝下载及自动重启安装
- ⚙️ **模块化设置** - 重构的现代化设置面板，按域划分（通用、sanPrompt、sanIP、sanLabs 等）
- ⌨️ **快捷键** - 丰富的键盘快捷键支持
- 💾 **自定义路径与统一根目录** - 灵活自定义各模块存储位置，或设置全局“统一根目录”实现资源的一键迁移 🆕
- 📦 **按需打包** - 通过环境变量支持隔离打包出“纯 sanPrompt”专属版本，自动精简界面和体积

## 📚 文档导航

> 💡 查看 [完整文档索引](./docs/INDEX.md) 了解所有可用文档

### 🏗️ 架构设计
- [架构文档](./docs/architecture/ARCHITECTURE.md) - 双域架构设计与模块划分
- [Omni-Manager (超级后台) 架构](./docs/architecture/OMNI_MANAGER_ARCHITECTURE.md) - 为什么放弃网页后台，将桌面端作为商品总控 🆕
- [模板商品化说明](./docs/features/template.md) - Prompt 模板、统一分类、图片证据与发布流

### 🎯 快速开始
- [开发进度](./docs/dev/PROGRESS.md) - 查看项目完成情况和功能列表
- [使用指南](./docs/guides/USAGE.md) - 如何使用应用的各项功能
- [故障排除](./docs/dev/TROUBLESHOOTING.md) - 常见问题和解决方案

### 📖 功能文档
- [Prompt 对比](./docs/features/PROMPT_COMPARISON.md) - 对比同一 prompt 在不同模型下的效果 🆕
- [Prompt 对比快速开始](./docs/guides/PROMPT_COMPARISON_QUICKSTART.md) - 5 分钟上手指南 🆕
- [删除功能](./docs/features/DELETE_FEATURE.md) - 单个和批量删除图片
- [存储结构](./docs/architecture/STORAGE_STRUCTURE.md) - 图片存储位置和目录结构
- [数据持久化](./docs/architecture/DATA_PERSISTENCE.md) - 数据备份和迁移指南
- [自定义存储路径](./docs/guides/CUSTOM_STORAGE_PATH.md) - 自定义 inbox 和 archived 位置
- [文件扫描](./docs/features/FOLDER_MONITORING.md) - 自动扫描文件夹导入或清理图片
- [打开文件夹和归档](./docs/features/OPEN_FOLDER_AND_ARCHIVE.md) - 右键功能说明
- [厂商管理](./docs/features/VENDOR_MANAGEMENT.md) - 管理 AI 厂商和模型

### 🔧 开发文档
- [按需打包配置](./docs/dev/ON_DEMAND_PACKAGING.md) - 配置环境变量进行功能裁剪打包 🆕
- [自动更新发布](./docs/dev/AUTO_UPDATE.md) - GitHub Actions 全自动发版指南 🆕
- [跨平台支持](./docs/dev/CROSS_PLATFORM.md) - Windows/macOS/Linux 支持说明
- [平台修复](./docs/dev/PLATFORM_FIXES.md) - 平台特定问题的修复记录

### 📝 更新日志
- [查看完整更新日志 (CHANGELOG.md)](./CHANGELOG.md) 🆕
- [数据底层防断链与同步安全加固 (2026-06-09) 发布说明](./docs/release-notes/2026-06-09_PATH_IMMUTABILITY.md)
- [统一根目录功能 (2026-06-01) 发布说明](./docs/release-notes/2026-06-01_UNIFIED_ROOT.md)

## 🚀 快速开始

### 环境要求
- Node.js 18+
- Rust 1.70+
- pnpm

### 安装依赖
```bash
pnpm install
```

### 开发模式
```bash
pnpm run tauri:dev
```

### 构建完整应用
```bash
pnpm run tauri:build
```

### 发布流程

打 tag 之前，先运行预检脚本确认可以正常打包：

```bash
# 预检（检查版本号一致性、TypeScript 编译、Rust 编译等）
pnpm run release:check

# 预检通过后手动打 tag
git tag v1.x.x && git push origin v1.x.x

# 或者让脚本自动打 tag 并 push
pnpm run release:check -- --tag
```

预检内容：
| 检查项 | 说明 |
|--------|------|
| 版本号一致性 | `package.json`、`tauri.conf.json`、`Cargo.toml` 三处版本必须一致 |
| Git 状态 | 是否有未提交的代码 |
| Tag 冲突 | 对应版本的 tag 是否已存在 |
| TypeScript 编译 | `tsc --noEmit` |
| Rust 编译 | `cargo check` |

推送 tag 后会自动触发 GitHub Actions 构建并发布 Release。

### 按需构建 (例如：纯 sanPrompt 专属版)
```bash
# 开发模式预览
pnpm run dev:prompt

# 构建安装包
pnpm run tauri:build:prompt
```

## 🎯 常见问题

### 图片存储
- **图片会复制到哪里？** → [存储结构说明](./docs/architecture/STORAGE_STRUCTURE.md#存储位置)
- **会占用多少空间？** → [存储结构说明](./docs/architecture/STORAGE_STRUCTURE.md#磁盘空间考虑)
- **如何自定义存储位置？** → [自定义存储路径](./docs/guides/CUSTOM_STORAGE_PATH.md)

### 数据安全
- **重装应用数据会丢失吗？** → [数据持久化说明](./docs/architecture/DATA_PERSISTENCE.md)
- **如何备份数据？** → [数据持久化说明](./docs/architecture/DATA_PERSISTENCE.md#数据备份建议)
- **如何迁移到新电脑？** → [数据持久化说明](./docs/architecture/DATA_PERSISTENCE.md#常见问题)

### 功能使用
- **如何删除图片？** → [删除功能说明](./docs/features/DELETE_FEATURE.md)
- **如何自动导入缺失图片？** → [文件扫描功能](./docs/features/FOLDER_MONITORING.md)
- **如何管理厂商和模型？** → [厂商管理](./docs/features/VENDOR_MANAGEMENT.md)

## 🔧 技术栈

### 前端
- **框架：** React 18 + TypeScript
- **UI 库：** Tailwind CSS + shadcn/ui
- **状态管理：** Zustand
- **构建工具：** Vite

### 后端
- **框架：** Tauri 2.0
- **语言：** Rust
- **数据库：** SQLite (rusqlite)
- **图像处理：** image crate
- **文件监控：** notify crate

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+A | 全选图片 |
| Delete | 删除选中图片 |
| Ctrl+Enter | 归档选中图片 |
| 1 / 2 | 切换待整理/已归档 |
| Ctrl+F | 聚焦搜索框 |
| Ctrl+, | 打开/关闭设置 |
| Escape | 取消选择/关闭弹窗 |

## 📊 项目状态

### 已完成功能

**sanPrompt：**
- ✅ 图片导入和管理
- ✅ 厂商和模型分类
- ✅ 标签系统
- ✅ Prompt 管理
- ✅ Prompt 对比（同一 prompt 不同模型效果对比）
- ✅ Prompt 分组与模板管理
- ✅ 归档系统

**sanIP：**
- ✅ IP 角色 CRUD
- ✅ 角色设定图（Character Sheet）管理
- ✅ 创作管理（基于 IP 的图片作品）
- ✅ 表情包管理与平台发布（微信、Telegram 等）
- ✅ 表情 Emoji 与触发词管理
- ✅ IP 关系管理

**sanLabs 工具箱 (产品图制作等)：**
- ✅ 无后端本地化运行 (零数据库依赖)
- ✅ 自由拼接多图层 (文字层、图片层)
- ✅ 动态画布设置与导出功能
- ✅ 支持保存为项目草稿或复用模板
- ✅ 灵感画布 (Excalidraw 本地无边框白板) 🆕
- ✅ PNG 转 SVG 工具 (支持高级平滑参数与直接导出) 🆕

**通用功能：**
- ✅ 水印检测和去除（标准 + Gemini）
- ✅ 文件夹扫描与清理
- ✅ 快速编辑
- ✅ 搜索筛选
- ✅ 暗色模式
- ✅ 快捷键支持
- ✅ 厂商管理
- ✅ 自定义路径与统一根目录
- ✅ 模块化的设置页面
- ✅ 路径迁移工具与数据自修复
- ✅ **全量双向/单向云端同步** - 支持细粒度的上传/拉取控制，提供聚合时间轴的同步历史面板 (需搭配私有项目 `sanomni-sync-server` 使用) 🆕
- ✅ **数据底层防断链设计** - 全局核心数据模型（IP、厂商、作品等）的目录路径标识（Path）采用“创建后硬锁定”架构，彻底根绝后期重命名引发的本地断链与同步错乱问题 🆕

### 待开发功能
- [ ] 数据导出/导入
- [ ] 图片编辑功能
- [ ] 批量标签管理
- [ ] 监控统计和日志

详细进度请查看：[开发进度文档](./docs/dev/PROGRESS.md)

## 📁 项目结构

```
sanOmni/
├── src/                          # 前端代码
│   ├── components/              # React 组件
│   │   ├── ui/                 # shadcn/ui 组件
│   │   ├── lab/                # sanLabs 工具箱组件 (产品图制作等)
│   │   ├── settings/           # 模块化设置面板组件
│   │   ├── InboxView.tsx       # 待整理视图
│   │   ├── ArchivedView.tsx    # 已归档视图
│   │   ├── PromptGroupsView.tsx # Prompt 分组管理
│   │   ├── IPManagementView.tsx # IP 形象管理视图
│   │   ├── SmartPromptRenderer.tsx # 智能 Prompt 渲染
│   │   ├── ImageCard.tsx       # 图片卡片
│   │   └── SettingsView.tsx    # 设置页面入口
│   ├── hooks/                  # 自定义 Hooks
│   ├── services/               # API 服务
│   ├── stores/                 # Zustand 状态管理
│   └── styles/                 # 样式文件
├── src-tauri/                  # 后端代码
│   ├── src/
│   │   ├── commands/           # Tauri 命令
│   │   │   ├── images.rs       # 图片管理
│   │   │   ├── vendors.rs      # 厂商管理
│   │   │   ├── tags.rs         # 标签管理
│   │   │   ├── prompt_groups.rs # Prompt 分组管理
│   │   │   ├── ip_assets.rs    # IP 形象管理
│   │   │   ├── scanner.rs      # 文件扫描
│   │   │   ├── watermark.rs    # 水印检测
│   │   │   ├── gemini_watermark_removal.rs # Gemini 水印去除

│   │   ├── database/           # 数据库操作
│   │   └── models/             # 数据模型
│   │       └── ip_assets.rs    # IP 资产数据模型
│   └── capabilities/           # 权限配置
└── docs/                       # 文档目录
```

> 📐 **架构说明：** 项目采用三域架构，sanPrompt、sanIP 与 sanLabs 工具箱三个功能域在数据库、命令和前端组件层面相互独立，便于未来拆分为独立应用。详细见 [架构文档](./docs/architecture/ARCHITECTURE.md)。

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 提交 Issue
- 描述问题或建议
- 提供复现步骤
- 附上截图或日志

### 提交 PR
- Fork 项目
- 创建功能分支
- 提交清晰的 commit 信息
- 更新相关文档

## 📄 许可证

[待添加]

## 📧 联系方式

[待添加]

---

**最后更新：** 2026-06-26
**版本：** 1.3.1
**最新功能：** 新增基于 Excalidraw 的无边界「灵感画布」工具，并深度优化了高级抠图引擎在超大分辨率图片下的内存开销与抗锯齿表现 🆕
