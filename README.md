# sanOmni - 全方位管理系统

> sanOmni，意为全方位的 AI 创作辅助中心。

sanOmni 是一个专注于 AI 创作者工作流的跨平台桌面客户端应用（基于 Tauri 2.0 构建）。它不仅是一个强大的图片管理工具，更是创作者的灵感库、资产库和生产力工具箱。

## 🌟 核心理念 (三大功能域)

系统当前**包含三个独立的功能领域**，以一个统一的应用形式打包发布：

1. **sanPrompt (Prompt 模板管理)**：专注于结构化管理和对比 AI 绘画的 Prompt 模板，管理生成的灵感图库。
2. **sanIP (IP 资产管理)**：专注于角色 IP 设定、三视图、衍生作品、表情包分发和状态跟踪。
3. **sanLabs 工具箱 (Product Image Maker 等)**：提供独立、零后端依赖的客户端本地图片处理工具箱，目前内置强大的“产品图制作”画板功能，支持图层管理、模板保存与图片合成。

这三大功能域在架构设计上**保持领域分离**，确保代码高内聚、低耦合。

## ✨ 主要特性

### 📝 sanPrompt
- 🎨 **智能分类** - 按厂商和模型自动分类图片
- 🏷️ **标签管理** - 灵活的标签系统，支持多标签
- 📝 **Prompt 管理** - 记录和管理图片生成提示词
- ✨ **Prompt 对比** - 对比同一 prompt 在不同模型下的效果
- 📦 **Prompt 分组** - 支持 template_schema 的 Prompt 模板分组管理
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
- 📑 **图层管理** - 支持文字层、图片层自由编排
- 💾 **模板保存** - 保存画布配置，一键复用设计
- 📦 **零依赖运行** - 不依赖数据库的本地化工具

### 🔧 通用功能
- 💧 **水印检测** - 自动检测和去除图片水印（标准 + Gemini）
- 👀 **文件夹监控** - 自动监控文件夹并导入新图片
- 🎯 **快速编辑** - 双击图片快速编辑信息
- 🔍 **搜索筛选** - 按厂商、模型、标签快速筛选
- 🌓 **主题切换** - 支持浅色/深色/跟随系统，并可分别设置普通模式和暗黑模式主题色
- 🔄 **自动更新** - 接入 Tauri Updater 实现带进度条的无缝下载及自动重启安装 🆕
- ⚙️ **模块化设置** - 重构的现代化设置面板，按域划分（通用、sanPrompt、sanIP、sanLabs 等）
- ⌨️ **快捷键** - 丰富的键盘快捷键支持
- 💾 **自定义路径** - 灵活自定义存储位置与 sanLabs 工作目录
- 📦 **按需打包** - 通过环境变量支持隔离打包出“纯 sanPrompt”专属版本，自动精简界面和体积

## 📚 文档导航

> 💡 查看 [完整文档索引](./docs/INDEX.md) 了解所有可用文档

### 🏗️ 架构设计
- [架构文档](./docs/ARCHITECTURE.md) - 双域架构设计与模块划分

### 🎯 快速开始
- [开发进度](./docs/PROGRESS.md) - 查看项目完成情况和功能列表
- [使用指南](./docs/USAGE.md) - 如何使用应用的各项功能
- [故障排除](./docs/TROUBLESHOOTING.md) - 常见问题和解决方案

### 📖 功能文档
- [Prompt 对比](./docs/PROMPT_COMPARISON.md) - 对比同一 prompt 在不同模型下的效果 🆕
- [Prompt 对比快速开始](./docs/PROMPT_COMPARISON_QUICKSTART.md) - 5 分钟上手指南 🆕
- [删除功能](./docs/DELETE_FEATURE.md) - 单个和批量删除图片
- [存储结构](./docs/STORAGE_STRUCTURE.md) - 图片存储位置和目录结构
- [数据持久化](./docs/DATA_PERSISTENCE.md) - 数据备份和迁移指南
- [自定义存储路径](./docs/CUSTOM_STORAGE_PATH.md) - 自定义 inbox 和 archived 位置
- [文件夹监控](./docs/FOLDER_MONITORING.md) - 自动监控文件夹导入图片
- [打开文件夹和归档](./docs/OPEN_FOLDER_AND_ARCHIVE.md) - 右键功能说明
- [厂商管理](./docs/VENDOR_MANAGEMENT.md) - 管理 AI 厂商和模型

### 🔧 开发文档
- [按需打包配置](./docs/ON_DEMAND_PACKAGING.md) - 配置环境变量进行功能裁剪打包 🆕
- [自动更新发布](./docs/AUTO_UPDATE.md) - GitHub Actions 全自动发版指南 🆕
- [跨平台支持](./docs/CROSS_PLATFORM.md) - Windows/macOS/Linux 支持说明
- [平台修复](./docs/PLATFORM_FIXES.md) - 平台特定问题的修复记录

### 📝 更新日志
- [Prompt 对比功能 (2026-05-21)](./docs/CHANGELOG_2026-05-21_PROMPT_COMPARISON.md) 🆕
- [Prompt 筛选功能更新](./docs/PROMPT_FILTER_UPDATE.md) 🆕
- [厂商管理更新 (2026-05-20)](./docs/CHANGELOG_2026-05-20.md)
- [UI 改进 (2026-05-20)](./docs/UI_IMPROVEMENTS_2026-05-20.md)

## 🚀 快速开始

### 环境要求
- Node.js 18+
- Rust 1.70+
- npm 或 pnpm

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
npm run tauri:dev
```

### 构建完整应用
```bash
npm run tauri:build
```

### 按需构建 (例如：纯 sanPrompt 专属版)
```bash
# 开发模式预览
npm run dev:prompt

# 构建安装包
npm run tauri:build:prompt
```

## 🎯 常见问题

### 图片存储
- **图片会复制到哪里？** → [存储结构说明](./docs/STORAGE_STRUCTURE.md#存储位置)
- **会占用多少空间？** → [存储结构说明](./docs/STORAGE_STRUCTURE.md#磁盘空间考虑)
- **如何自定义存储位置？** → [自定义存储路径](./docs/CUSTOM_STORAGE_PATH.md)

### 数据安全
- **重装应用数据会丢失吗？** → [数据持久化说明](./docs/DATA_PERSISTENCE.md)
- **如何备份数据？** → [数据持久化说明](./docs/DATA_PERSISTENCE.md#数据备份建议)
- **如何迁移到新电脑？** → [数据持久化说明](./docs/DATA_PERSISTENCE.md#常见问题)

### 功能使用
- **如何删除图片？** → [删除功能说明](./docs/DELETE_FEATURE.md)
- **如何自动导入图片？** → [文件夹监控功能](./docs/FOLDER_MONITORING.md)
- **如何管理厂商和模型？** → [厂商管理](./docs/VENDOR_MANAGEMENT.md)

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

**通用功能：**
- ✅ 水印检测和去除（标准 + Gemini）
- ✅ 文件夹监控与扫描
- ✅ 快速编辑
- ✅ 搜索筛选
- ✅ 暗色模式
- ✅ 快捷键支持
- ✅ 厂商管理
- ✅ 自定义存储路径
- ✅ 模块化的设置页面

### 待开发功能
- [ ] 数据导出/导入
- [ ] 云同步支持
- [ ] 图片编辑功能
- [ ] 批量标签管理
- [ ] 路径迁移工具
- [ ] 监控统计和日志

详细进度请查看：[开发进度文档](./docs/PROGRESS.md)

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
│   │   │   ├── watcher.rs      # 文件夹监控
│   │   │   └── ...
│   │   ├── database/           # 数据库操作
│   │   └── models/             # 数据模型
│   │       └── ip_assets.rs    # IP 资产数据模型
│   └── capabilities/           # 权限配置
└── docs/                       # 文档目录
```

> 📐 **架构说明：** 项目采用三域架构，sanPrompt、sanIP 与 sanLabs 工具箱三个功能域在数据库、命令和前端组件层面相互独立，便于未来拆分为独立应用。详细见 [架构文档](./docs/ARCHITECTURE.md)。

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

**最后更新：** 2026-05-29  
**版本：** 2.1.0  
**最新功能：** 全新更名为 sanOmni、新增 sanLabs 工具箱（内置产品图海报制作工具）、模块化重构设置面板 🆕
