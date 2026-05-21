# AI 图片管理系统 - 开发进度追踪

> 最后更新：2026-05-20 (v3)

---

## 📊 总体进度

| 模块 | 状态 | 完成度 |
|------|------|--------|
| 项目框架 | ✅ 完成 | 100% |
| 数据库设计 | ✅ 完成 | 100% |
| 后端 API | ✅ 完成 | 100% |
| 前端界面 | ✅ 完成 | 100% |
| 核心功能 | ✅ 完成 | 100% |
| 水印检测 | ✅ 完成 | 100% |
| 水印去除 | ✅ 完成 | 100% |
| 文件夹监控 | ✅ 完成 | 100% |
| 设置页面 | ✅ 完成 | 100% |
| 厂商管理 | ✅ 完成 | 100% |
| 图片查看器 | ✅ 完成 | 100% |
| 暗色模式 | ✅ 完成 | 100% |
| 键盘快捷键 | ✅ 完成 | 100% |
| 自动预分类 | ✅ 完成 | 100% |

---

## 一、项目框架

| 功能 | 状态 |
|------|------|
| Tauri 2.x + React + TypeScript | ✅ 完成 |
| Tailwind CSS + shadcn/ui | ✅ 完成 |
| Zustand 状态管理 | ✅ 完成 |
| Tauri API 服务层 | ✅ 完成 |

---

## 二、后端 API (26 个命令)

| 命令 | 状态 | 说明 |
|------|------|------|
| `import_image` | ✅ | 导入图片 |
| `get_inbox_images` | ✅ | 获取待整理图片 |
| `get_archived_images` | ✅ | 获取已归档图片 |
| `update_image` | ✅ | 更新图片 |
| `delete_image` | ✅ | 删除图片 |
| `archive_images` | ✅ | 批量归档 |
| `unarchive_images` | ✅ | 撤销归档 |
| `update_missing_formats` | ✅ | 更新缺失格式 |
| `get_vendors` | ✅ | 获取厂商列表 |
| `add_vendor` | ✅ | 添加厂商 |
| `update_vendor` | ✅ | 更新厂商 |
| `delete_vendor` | ✅ | 删除厂商 |
| `add_model` | ✅ | 添加模型 |
| `update_model` | ✅ | 更新模型 |
| `delete_model` | ✅ | 删除模型 |
| `get_tags` | ✅ | 获取标签 |
| `add_tag` | ✅ | 添加标签 |
| `detect_watermark` | ✅ | 检测水印 |
| `batch_detect_watermarks` | ✅ | 批量检测水印 |
| `remove_watermark` | ✅ | 去除水印 |
| `batch_remove_watermarks` | ✅ | 批量去除水印 |
| `start_folder_watcher` | ✅ | 启动文件夹监控 |
| `stop_folder_watcher` | ✅ | 停止文件夹监控 |
| `get_active_watchers` | ✅ | 获取活动监控 |
| `get_settings` | ✅ | 获取设置 |
| `save_settings` | ✅ | 保存设置 |
| `reset_database` | ✅ | 重置数据库 |
| `classify_image` | ✅ | 自动分类 |

---

## 三、前端组件

| 组件 | 状态 | 说明 |
|------|------|------|
| `App.tsx` | ✅ | 主框架（含主题切换+快捷键） |
| `InboxView` | ✅ | 待整理 |
| `ArchivedView` | ✅ | 已归档视图 |
| `ImageCard` | ✅ | 图片卡片 |
| `DropZone` | ✅ | 拖拽上传（含自动分类） |
| `QuickEditModal` | ✅ | 快速编辑弹窗 |
| `SettingsView` | ✅ | 设置页面 |
| 11 个 shadcn 组件 | ✅ | Button/Card/Input/Badge/Dialog/Switch/Slider 等 |

---

## 四、核心功能

| 功能 | 状态 |
|------|------|
| 拖拽/选择导入图片 | ✅ |
| 自动预分类（按文件名） | ✅ |
| 打标签（添加/删除） | ✅ |
| 模型选择（多选+主模型） | ✅ |
| Prompt 编辑 | ✅ |
| 一键归档 | ✅ |
| 撤销归档 | ✅ |
| 按模板自动重命名 | ✅ |
| 厂商树导航 | ✅ |
| 显示所有厂商（包括无图片） | ✅ |
| 厂商管理（增删改查） | ✅ |
| 厂商管理快捷入口 | ✅ |
| 模型管理（增删改查） | ✅ |
| 模型/标签 Tooltip 提示 | ✅ |
| 搜索筛选 | ✅ |
| 图片查看器（大图浏览） | ✅ |
| 键盘导航（查看器） | ✅ |
| 水印检测 | ✅ |
| 批量水印检测 | ✅ |
| 水印去除 | ✅ |
| 批量水印去除 | ✅ |
| 文件夹监控 | ✅ |
| 自定义存储路径 | ✅ |
| 设置页面 | ✅ |
| 暗色模式 | ✅ |
| 键盘快捷键 | ✅ |

---

## 五、设置页面

### 分区

| 标签 | 内容 |
|------|------|
| 通用设置 | 亮色/暗色主题色、自定义 Inbox 路径、自定义归档路径、命名模板、重置数据库 |
| 水印设置 | 自动检测开关、置信度阈值 |
| 监控设置 | 监控文件夹、扩展名过滤、防抖时间、活跃监控器显示 |
| 厂商管理 | 厂商和模型的增删改查 |
| 快捷键 | 快捷键列表展示 |

---

## 六、暗色模式

- 三种模式：浅色 / 深色 / 跟随系统
- 点击 header 图标循环切换
- 主题持久化到 localStorage
- 支持分别配置普通模式和暗黑模式主题色
- 设置保存成功后自动关闭弹窗
- CSS 变量已预定义（globals.css）

---

## 七、键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+A | 全选图片 |
| Delete | 删除选中图片 |
| Ctrl+Enter | 归档选中图片 |
| 1 / 2 | 切换待整理/已归档 |
| Ctrl+F | 聚焦搜索框 |
| Ctrl+, | 打开/关闭设置 |
| Escape | 取消选择/关闭弹窗 |
| 双击图片 | 打开图片查看器 |
| ← (查看器中) | 上一张图片 |
| → (查看器中) | 下一张图片 |
| ESC (查看器中) | 关闭查看器 |

---

## 八、自动预分类

根据文件名自动推断厂商和模型：

| 关键词 | 厂商 | 模型 |
|--------|------|------|
| gpt-image | OpenAI | gpt-image-2 |
| dall-e / dalle | OpenAI | dalle-3 |
| imagen-3 | Google | imagen-3 |
| nano-banana-pro | Google | nano-banana-pro |
| nano-banana | Google | nano-banana |
| gemini | Google | — |
| midjourney-v6 | Midjourney | midjourney-v6 |
| midjourney | Midjourney | — |

置信度 > 0.5 时自动应用分类结果。

---

## 九、项目文件结构

```
ai-image-manager/
├── src/                          # React 前端
│   ├── App.tsx                   # 主应用
│   ├── main.tsx                  # 入口
│   ├── components/
│   │   ├── InboxView.tsx         # 待整理视图
│   │   ├── ArchivedView.tsx      # 已归档视图
│   │   ├── ImageCard.tsx         # 图片卡片
│   │   ├── DropZone.tsx          # 拖拽上传
│   │   ├── QuickEditModal.tsx    # 编辑弹窗
│   │   ├── SettingsView.tsx      # 设置页面
│   │   └── ui/                   # shadcn 组件 (11个)
│   ├── hooks/
│   │   └── useKeyboardShortcuts.ts
│   ├── stores/index.ts           # Zustand 状态
│   ├── services/tauri.ts         # Tauri API 封装
│   ├── lib/utils.ts              # 工具函数
│   └── styles/globals.css        # 全局样式
│
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── main.rs               # 入口（极简，仅调用 ai_image_manager_lib::run()）
│   │   ├── lib.rs                # Tauri 2.x 主逻辑（builder、setup、插件、命令注册）
│   │   ├── commands/
│   │   │   ├── mod.rs            # 命令导出
│   │   │   ├── images.rs         # 图片 CRUD + 归档
│   │   │   ├── vendors.rs        # 厂商管理
│   │   │   ├── tags.rs           # 标签管理
│   │   │   ├── watermark.rs      # 水印检测
│   │   │   ├── watermark_removal.rs # 水印去除
│   │   │   ├── watcher.rs        # 文件夹监控
│   │   │   ├── settings.rs       # 设置管理
│   │   │   └── classifier.rs     # 自动预分类
│   │   ├── database/mod.rs       # SQLite Schema
│   │   └── models/mod.rs         # 数据模型
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── package.json
├── tailwind.config.js
├── vite.config.ts
├── tsconfig.json
├── components.json
└── PROGRESS.md
```

**Tauri 2.x 架构说明：**

- `main.rs` 极简入口，仅调用 `ai_image_manager_lib::run()`
- `lib.rs` 包含完整的 Tauri builder 逻辑：setup 初始化、插件加载、全部命令注册
- 命令注册使用模块前缀路径，例如 `commands::vendors::add_model`、`commands::watermark::detect_watermark`
- 数据库存储路径：`%USERPROFILE%/.ai-image-manager/database.sqlite`

---

## 十、运行方式

### 前置依赖

- **Rust**（通过 [rustup](https://rustup.rs/) 安装）
- **Node.js 18+**
- **MSVC Build Tools**（Visual Studio Installer 中勾选"使用 C++ 的桌面开发"）

### 构建与运行

```bash
cd ai-image-manager
npm install
npm install @radix-ui/react-switch @radix-ui/react-slider
npm run tauri:dev
```

### 注意事项

- **源目录权限问题**：如果 `Cargo.lock` 写入失败（os error 5），说明源目录被锁定（TRAE SOLO CN 可能锁定该文件），需要将项目复制到其他目录后再进行构建
- **VM 环境**：虚拟机中 WebView2 可能因权限不足（os error 5）无法启动

---

## 十一、已知问题与修复记录

| 问题 | 说明 | 修复方式 |
|------|------|----------|
| 数据库列数不匹配 | 3 条 INSERT 语句提供了 9 个值但表有 10 列（缺少 `description` 字段） | 补全缺失的 `description` 列值 |
| tauri.conf.json plugins 段 | `tauri.conf.json` 中包含 `plugins` 段会导致 Tauri 2.x 抛出 PluginInitialization 错误 | 移除 `plugins` 配置段 |
| PowerShell `$schema` 被吞 | PowerShell 会将 JSON 字符串中的 `$` 作为变量解析，导致 `$schema` 被替换为空 | 使用 Python 脚本写入 JSON 配置文件，避免 PowerShell 解析 |
| MSVC 链接器临时文件 | MSVC 链接器可能因临时目录路径过长或权限不足而失败 | 将 `TEMP` 环境变量设置为自定义短路径目录 |
| VM 中 WebView2 失败 | 虚拟机环境下 WebView2 启动时报 os error 5（拒绝访问） | 在物理机环境运行，或检查 VM 中 WebView2 运行时安装状态 |
| 源目录文件锁定 | TRAE SOLO CN 可能锁定 `Cargo.lock`，导致 Cargo 写入失败（os error 5） | 将项目复制到其他目录后构建 |

---

## 十二、UI 改进记录

### 2026-05-20 改进 (v3)

| 改进项 | 说明 | 效果 |
|--------|------|------|
| 图片查看器 | 新增全功能图片查看器，支持大图浏览和键盘导航 | 可以查看高清大图，详细信息展示 |
| 厂商管理快捷入口 | 在"厂商分类"标题旁添加编辑图标 | 操作步骤减少 50% |

### 2026-05-20 改进 (v2)

| 改进项 | 说明 | 效果 |
|--------|------|------|
| 快速编辑弹窗宽度 | 从 `max-w-2xl` (672px) 增加到 `max-w-4xl` (896px) | 编辑空间增加 33%，体验更舒适 |
| 模型显示优化 | 为 "+N" 徽章添加 Tooltip，悬停显示所有隐藏的模型 | 信息获取更便捷，无需打开编辑弹窗 |
| 标签显示优化 | 为 "+N" 徽章添加 Tooltip，悬停显示所有隐藏的标签 | 信息获取更便捷，减少操作步骤 |

详细说明请参考：
- [图片查看器文档](./IMAGE_VIEWER.md)
- [厂商管理快捷入口](./VENDOR_EDIT_SHORTCUT.md)
- [UI 改进文档](./UI_IMPROVEMENTS_2026-05-20.md)
- [更新日志 v2](./UPDATES_2026-05-20_v2.md)

---

## 图例

- ✅ 全部完成
