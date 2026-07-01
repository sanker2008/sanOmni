---
name: GIF/APNG 动图拆帧 (Gif Decomposer)
status: Active
last_updated: 2026-07-01
---

# 动图拆帧 (Gif Decomposer)

## 概述
动图拆帧是一个内置于 sanLabs 的纯前端工具，用于将 GIF、APNG 和 WebP 动态图片解析并拆解为逐帧序列，支持帧级别的预览、提取和批量导出。主要帮助创作者在临摹或制作动画表情包时，提取现有动图的动画规律与关键帧。

## 核心特性
- **纯浏览器端解码**：使用前端 `gifuct-js` 库解析 GIF 包含延迟和重绘规则（disposal method）；APNG 和 WebP 采用浏览器原生 WebCodecs `ImageDecoder` 接口处理。
- **逐帧查看**：动图分离后展示在网格列表中，支持快速跳转和单帧静态分析。
- **自定义播放**：提供原速、0.5x、0.25x、2x 播放速度控制及逐帧步进功能。
- **灵活导出**：
  - **按间隔抽取**：可按一定步长间隔（例如每隔 3 帧取 1 帧）提取动图的关键帧，适合快速抽帧分析。
  - **单图序列导出**：将选中帧批量导出为本地文件，以序列化命名（如 `filename_frame_001.png`）。内置了同名文件覆盖检测。
  - **雪碧长图 (Spritesheet) 导出**：自动计算排版，将选中的多帧组合拼贴成一张无缝的超大分辨率图片。
  - **新动图合成 (Re-encode)**：可选取片段或间隔抽帧后，一键重新合成并压缩为全新的 GIF 动图，轻松实现动图瘦身和片段截取。

## 技术实现
- **文件与架构**：采用组件化设计
  - `GifDecomposer.tsx`：主 UI 与播放器状态管理
  - `decoder.ts`：抽象的解码层，向下对接 `gifuct-js` 和 Web API
  - `fs.ts`：Tauri 安全文件导出层对接
- **核心依赖**：
  - 解码引擎：使用 `gifuct-js` 进行 GIF 纯前端解析；APNG 和 WebP 采用浏览器原生 WebCodecs `ImageDecoder`。
  - 编码引擎：新增 `gifenc` 轻量级高性能库，提供纯 JS 的 GIF 色彩量化及重编码能力。
- **数据流转**：从 `ArrayBuffer` 解码，还原图像数据为 `ImageData`。在 UI 中将大尺寸像素数据异步转换为轻量级的 `Blob URL` 代替原生 Base64 DataURL，极大地优化了超长 GIF 的内存占用，并在重载/卸载时自动回收避免内存泄漏。

## 未来迭代 (待办)
- [ ] **Onion Skin（洋葱皮）模式**：增加前一帧与后一帧的半透明叠加显示，更直观地呈现帧间变化。
- [x] **导出为 Sprite 拼图**：支持将选中的多帧组合为一张雪碧长图 (Sprite Sheet) 导出。
