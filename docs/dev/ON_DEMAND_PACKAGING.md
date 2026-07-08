# 按需打包与构建配置 (Feature Flags)

由于 sanOmni 集成了三大核心功能域（sanPrompt、sanIP、sanLabs 工具箱），不同用户可能只需要其中的部分功能。为了满足轻量化、专属工具分发的需求，我们利用 Vite 的环境变量（Feature Flags）机制实现了**按需打包**。

## 核心原理

在前端 React/Vite 项目中，通过读取环境变量 `import.meta.env.VITE_APP_MODE` 来控制页面的渲染。
当处于特定模式（如 `prompt_only`）时，未使用的功能（如 sanIP 和 sanLabs）及其相关组件，由于不可达，会在 Vite 打包时通过 **Tree-shaking (摇树优化)** 被彻底剔除。

这带来了两大好处：
1. **纯净体验**：用户界面不再有无关的侧边栏、设置项和按钮。
2. **包体精简**：无用前端代码被物理删除，减轻了最终的 JS bundle 体积。

> **注：** 本方案主要在**前端隔离**。Rust 后端的 API 和 SQLite 数据库表结构保持全量，以防备未来数据迁移或开启功能。

## 环境变量文件配置

在项目根目录下，有不同的 `.env` 文件用来定义环境变量：

1. `.env`（默认全功能）：
   ```env
   VITE_APP_MODE=all
   ```

2. `.env.prompt`（仅 Prompt 版）：
   ```env
   VITE_APP_MODE=prompt_only
   ```

## 快捷构建指令

我们已经在 `package.json` 中配置了快捷脚本，方便直接打包对应版本：

### 全功能版（默认）
适合全量发布，包含所有功能。
```bash
# 开发环境运行
pnpm run tauri:dev

# 打包全功能安装包
pnpm run tauri:build
```

### Prompt 专属版
适合专门分发给只做 AI 绘画 Prompt 管理的用户。
```bash
# 专属版开发环境预览（仅验证界面裁剪效果）
pnpm run dev:prompt

# 一键打包 Prompt 专属安装包
pnpm run tauri:build:prompt
```

## 未来扩展

如果未来需要增加“纯 sanIP 专属版”或者“纯 sanLabs 专属版”，只需：
1. 新建 `.env.ip`（内容：`VITE_APP_MODE=ip_only`）
2. 在 `package.json` 增加脚本：`"tauri:build:ip": "vite build --mode ip && tauri build"`
3. 在 `src/App.tsx` 和 `SettingsView.tsx` 中增加对应的条件过滤判断即可。
