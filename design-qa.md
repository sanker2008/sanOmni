# sanKnow 视觉验收记录

## 比较目标

- Source visual truth: `/mnt/c/Users/Admin/.codex/generated_images/newapi-imagegen/generated-20260803-112842-2e45bbd4.png`
- Implementation screenshot: unavailable
- Intended viewport: 1440 × 1024 desktop
- Intended state: 已选择项目、显示搜索结果与右侧来源详情

## Evidence

前端生产构建已成功完成；但当前 WSL 缺少 Tauri 所需的 GLib/GObject 系统库，无法启动桌面应用。当前用户也尚未授权使用 Playwright MCP 浏览器捕获 Web 预览，因此没有可与源视觉稿并列比较的实现截图。

## Findings

- [P1] 缺少已渲染实现的视觉对照
  - Location: `src/components/KnowDomainView.tsx`
  - Evidence: 有源视觉稿，但没有 1440 × 1024 的实现截图。
  - Impact: 无法确认搜索框、三栏比例、文字折行、空状态和来源详情是否与选定第二版视觉方向一致。
  - Fix: 在可运行的 Windows Tauri 环境或获授权的浏览器预览中，捕获同一状态与视口的截图；将其与源图合并后进行逐项比较并修复 P0/P1/P2 差异。

## Required Fidelity Surfaces

- Fonts and typography: blocked — 未取得渲染证据。
- Spacing and layout rhythm: blocked — 未取得渲染证据。
- Colors and visual tokens: blocked — 未取得渲染证据。
- Image quality and asset fidelity: N/A — 该界面使用现有 sanOmni 标识与 Lucide 图标，没有新增自定义图像资产。
- Copy and content: static code review completed; rendered wrapping remains blocked.

## Implementation Checklist

1. 获得浏览器测试授权或在 Windows 原生 Tauri 环境启动应用。
2. 选择 sanOmni 项目文件夹并生成索引，完成搜索、筛选、新建记录与更新索引操作。
3. 捕获 1440 × 1024 的结果详情状态，与源视觉稿完成全视图及搜索区、右侧详情区的重点对比。
4. 修复可见 P0/P1/P2 问题并更新此记录。

## Comparison History

暂无视觉比较迭代；渲染截图未取得。

final result: blocked
