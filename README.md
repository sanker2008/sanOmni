# sanMediaBox - AI 图片管理系统

> 一个基于 Tauri 2.0 + React 的 AI 图片管理工具，帮助你高效管理和组织 AI 生成的图片。

## ✨ 主要特性

- 🎨 **智能分类** - 按厂商和模型自动分类图片
- 🏷️ **标签管理** - 灵活的标签系统，支持多标签
- 📝 **Prompt 管理** - 记录和管理图片生成提示词
- 🗂️ **归档系统** - 待整理 → 标记 → 归档的工作流程
- 💧 **水印检测** - 自动检测和去除图片水印
- 👀 **文件夹监控** - 自动监控文件夹并导入新图片
- 🎯 **快速编辑** - 双击图片快速编辑信息
- 🔍 **搜索筛选** - 按厂商、模型、标签快速筛选
- 🌓 **暗色模式** - 支持浅色/深色/跟随系统
- ⌨️ **快捷键** - 丰富的键盘快捷键支持
- 🔧 **厂商管理** - 自由管理 AI 厂商和模型
- 💾 **自定义路径** - 自定义存储位置

## 📚 文档导航

### 🎯 快速开始
- [开发进度](./docs/PROGRESS.md) - 查看项目完成情况和功能列表
- [使用指南](./docs/USAGE.md) - 如何使用应用的各项功能
- [故障排除](./docs/TROUBLESHOOTING.md) - 常见问题和解决方案

### 📖 功能文档
- [删除功能](./docs/DELETE_FEATURE.md) - 单个和批量删除图片
- [存储结构](./docs/STORAGE_STRUCTURE.md) - 图片存储位置和目录结构
- [数据持久化](./docs/DATA_PERSISTENCE.md) - 数据备份和迁移指南
- [自定义存储路径](./docs/CUSTOM_STORAGE_PATH.md) - 自定义 inbox 和 archived 位置
- [文件夹监控](./docs/FOLDER_MONITORING.md) - 自动监控文件夹导入图片
- [打开文件夹和归档](./docs/OPEN_FOLDER_AND_ARCHIVE.md) - 右键功能说明
- [厂商管理](./docs/VENDOR_MANAGEMENT.md) - 管理 AI 厂商和模型

### 🔧 开发文档
- [跨平台支持](./docs/CROSS_PLATFORM.md) - Windows/macOS/Linux 支持说明
- [平台修复](./docs/PLATFORM_FIXES.md) - 平台特定问题的修复记录

### 📝 更新日志
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

### 构建应用
```bash
npm run tauri:build
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
- ✅ 图片导入和管理
- ✅ 厂商和模型分类
- ✅ 标签系统
- ✅ Prompt 管理
- ✅ 归档系统
- ✅ 水印检测和去除
- ✅ 文件夹监控
- ✅ 快速编辑
- ✅ 搜索筛选
- ✅ 暗色模式
- ✅ 快捷键支持
- ✅ 厂商管理
- ✅ 自定义存储路径

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
sanMediaBox/
├── src/                      # 前端代码
│   ├── components/          # React 组件
│   │   ├── ui/             # shadcn/ui 组件
│   │   ├── InboxView.tsx   # 待整理视图
│   │   ├── ArchivedView.tsx # 已归档视图
│   │   ├── ImageCard.tsx   # 图片卡片
│   │   ├── DropZone.tsx    # 拖拽上传
│   │   ├── QuickEditModal.tsx # 快速编辑
│   │   └── SettingsView.tsx # 设置页面
│   ├── hooks/              # 自定义 Hooks
│   ├── services/           # API 服务
│   ├── stores/             # Zustand 状态管理
│   └── styles/             # 样式文件
├── src-tauri/              # 后端代码
│   ├── src/
│   │   ├── commands/       # Tauri 命令
│   │   │   ├── images.rs   # 图片管理
│   │   │   ├── vendors.rs  # 厂商管理
│   │   │   ├── tags.rs     # 标签管理
│   │   │   ├── watermark.rs # 水印检测
│   │   │   ├── watcher.rs  # 文件夹监控
│   │   │   └── ...
│   │   ├── database/       # 数据库操作
│   │   └── models/         # 数据模型
│   └── capabilities/       # 权限配置
└── docs/                   # 文档目录
```

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

**最后更新：** 2026-05-20  
**版本：** 1.1.0
