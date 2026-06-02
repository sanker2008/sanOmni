# AI 创意资产管理系统 - 开发进度追踪

> 最后更新：2026-06-02 (v5)

---

## 📊 总体进度

| 模块 | 状态 | 完成度 |
|------|------|--------|
| 项目框架 | ✅ 完成 | 100% |
| 数据库设计 | ✅ 完成 | 100% |
| 后端 API | ✅ 完成 | 100% |
| 前端界面 | ✅ 完成 | 100% |
| 核心功能 | ✅ 完成 | 100% |
| Prompt 模板管理 | ✅ 完成 | 100% |
| IP 形象管理 | ✅ 完成 | 100% |
| 水印检测 | ✅ 完成 | 100% |
| 水印去除 | ✅ 完成 | 100% |
| Gemini 水印去除 | ✅ 完成 | 100% |
| 文件扫描 | ✅ 完成 | 100% |
| 文件扫描器 | ✅ 完成 | 100% |
| 设置页面 | ✅ 完成 | 100% |
| 厂商管理 | ✅ 完成 | 100% |
| PNG 转 SVG | ✅ 完成 | 100% |
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

## 二、后端 API (60+ 个命令)

### 2.1 Prompt 图片管理命令

| 命令 | 状态 | 说明 |
|------|------|------|
| `import_image` | ✅ | 导入 Prompt 图片 |
| `get_inbox_images` | ✅ | 获取待整理图片 |
| `get_archived_images` | ✅ | 获取已归档图片 |
| `update_image` | ✅ | 更新图片元数据 |
| `delete_image` | ✅ | 删除图片 |
| `archive_images` | ✅ | 批量归档 |
| `unarchive_images` | ✅ | 撤销归档 |
| `update_missing_formats` | ✅ | 更新缺失格式 |

### 2.2 IP 图片管理命令（新增）

| 命令 | 状态 | 说明 |
|------|------|------|
| `import_ip_image` | ✅ | 导入 IP 图片（独立于 Prompt 图片表） |
| `get_ip_inbox_images` | ✅ | 获取 IP 待整理图片 |
| `get_ip_archived_images` | ✅ | 获取 IP 已归档图片 |
| `update_ip_image` | ✅ | 更新 IP 图片元数据 |
| `delete_ip_image` | ✅ | 删除 IP 图片 |
| `archive_ip_images` | ✅ | 归档 IP 图片 |

### 2.2 厂商和标签命令

| 批量水印检测 | ✅ |
| 水印去除 | ✅ |
| 批量水印去除 | ✅ |
| 文件扫描 | ✅ |
| 自定义存储路径 | ✅ |
| 路径迁移与数据自修复 | ✅ |
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
| 扫描设置 | 手动触发扫描，查看并导入遗漏文件，或清理失效记录 |
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

**sanLabs 工具箱 (产品图制作等)：**
- ✅ 无后端本地化运行 (零数据库依赖)
- ✅ 自由拼接多图层 (文字层、图片层)
- ✅ 动态画布设置与导出功能
- ✅ 支持保存为项目草稿或复用模板
- ✅ PNG 转 SVG (支持高级平滑度调节与无损预览)

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
sanOmni/
├── src/                              # React 前端
│   ├── App.tsx                       # 主应用
│   ├── main.tsx                      # 入口
│   ├── components/
│   │   ├── InboxView.tsx             # 待整理视图
│   │   ├── ArchivedView.tsx          # 已归档视图
│   │   ├── PromptGroupsView.tsx      # Prompt 分组管理
│   │   ├── IPManagementView.tsx      # IP 形象管理视图
│   │   ├── IPImagePickerModal.tsx    # IP 图片选择器
│   │   ├── SmartPromptRenderer.tsx   # 智能 Prompt 渲染器
│   │   ├── TemplateVariableEditor.tsx # 模板变量编辑器
│   │   ├── TrashView.tsx             # 回收站视图
│   │   ├── ImageCard.tsx             # 图片卡片
│   │   ├── DropZone.tsx              # 拖拽上传
│   │   ├── QuickEditModal.tsx        # 编辑弹窗
│   │   ├── SettingsView.tsx          # 设置页面
│   │   └── ui/                       # shadcn 组件 (11个)
│   ├── hooks/
│   │   └── useKeyboardShortcuts.ts
│   ├── stores/index.ts               # Zustand 状态
│   ├── services/tauri.ts             # Tauri API 封装
│   ├── lib/utils.ts                  # 工具函数
│   └── styles/globals.css            # 全局样式
│
├── src-tauri/                        # Rust 后端
│   ├── src/
│   │   ├── main.rs                   # 入口
│   │   ├── lib.rs                    # Tauri 2.x 主逻辑
│   │   ├── commands/
│   │   │   ├── mod.rs                # 命令导出
│   │   │   ├── images.rs             # 图片 CRUD + 归档
│   │   │   ├── vendors.rs            # 厂商管理
│   │   │   ├── tags.rs               # 标签管理
│   │   │   ├── prompt_groups.rs      # Prompt 分组管理
│   │   │   ├── ip_assets.rs          # IP 形象管理 (21 个命令)
│   │   │   ├── scanner.rs            # 文件扫描器
│   │   │   ├── watermark.rs          # 水印检测
│   │   │   ├── watermark_removal.rs  # 标准水印去除
│   │   │   ├── gemini_watermark_removal.rs # Gemini 水印去除

│   │   │   └── classifier.rs         # 自动预分类
│   │   ├── database/mod.rs           # SQLite Schema
│   │   └── models/
│   │       ├── mod.rs                # 数据模型
│   │       └── ip_assets.rs          # IP 资产数据模型
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── docs/                             # 文档目录
├── package.json
├── tailwind.config.js
├── vite.config.ts
├── tsconfig.json
└── components.json
```

**Tauri 2.x 架构说明：**

- `main.rs` 极简入口，仅调用 `ai_image_manager_lib::run()`
- `lib.rs` 包含完整的 Tauri builder 逻辑：setup 初始化、插件加载、全部命令注册
- 命令注册使用模块前缀路径，例如 `commands::ip_assets::get_ip_characters`
- 双域架构：Prompt 模板管理与 IP 形象管理在命令、模型、数据库层面相互独立
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
