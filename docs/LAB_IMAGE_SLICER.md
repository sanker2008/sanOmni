# Labs — 图片切割工具 (Image Slicer) Specs

> **版本**: v1.0  
> **最后更新**: 2026-05-30  
> **状态**: 已实现

---

## 概述

Labs 是 sanOmni 的第三个顶级功能域，是一个独立的实验性工具集合区域。**图片切割 (Image Slicer)** 是 Labs 中的第二个工具，能够帮助用户以极其灵活、可视化的方式对图片进行均等分或自定义切分，支持双参考线间隔、鼠标拖拽调整、保留/删除切片选择、按比例缩放适配、自定义命名及格式，并能一键批量导出到指定系统目录。

---

## 架构设计

### 耦合度分析

| 依赖项 | 是否依赖 | 说明 |
|--------|:--------:|------|
| `stores/index.ts` | ✅ 最小 | 仅扩展 `activeTab` 类型加 `"labs"` |
| `components/lab/LabView.tsx` | ✅ 最小 | 注册 `ImageSlicer` 菜单并将其设置为可用 (`available: true`) |
| `services/tauri.ts` | ❌ | 不使用 SQLite 数据库，无数据库依赖 |
| `tailwind.config.js` | ✅ | 复用项目已有的 Tailwind CSS 类名与设计系统 |
| `lucide-react` | ✅ | 复用已有的图标组件库 |
| `@tauri-apps/plugin-fs` | ✅ | 使用 Tauri 原生插件进行本地磁盘目录创建和切片文件批量写入 |
| `@tauri-apps/plugin-dialog` | ✅ | 使用 Tauri 的原生文件夹对话框，支持用户自由选择任意导出目录 |
| `@tauri-apps/plugin-shell` | ✅ | 使用 Tauri Shell 执行跨平台原生的“在文件管理器中打开文件夹”命令 |

---

## 文件结构

所有关于图片切割工具的代码和组件均完全内聚在 `src/components/lab/image-slicer/` 目录下：

```
src/components/lab/image-slicer/
├── types.ts                                # 核心 TypeScript 接口定义
├── utils.ts                                # 切分计算、Canvas Crop 与命名模板解析工具
├── fs.ts                                   # 封装的 Tauri 文件夹选择、写入和 Shell 打开逻辑
├── SlicerCanvas.tsx                        # 交互式画布编辑器（拖动参考线、坐标显示、Gutter 红色遮罩）
├── SliceGridPreview.tsx                    # 切片卡片网格预览组件（高效 CSS Sprite 裁剪展示、批量选择状态）
├── ExportSettings.tsx                      # 导出控制面板（Canvas 大小、填充背景色、命名模板、前3个实时预览、导出）
└── ImageSlicer.tsx                         # 主流程控制器与工作区 Tab 编排
```

---

## 功能清单

### 图片加载与上传
- [x] 支持通过拖放区 (Drag & Drop) 直接将本地图片拖入画布中加载
- [x] 支持点击选择文件，以 Base64 Data URL 格式本地极速加载，无需上传云端，零网络消耗
- [x] 主视图工具栏动态呈现文件名以及图片的原始分辨率

### 交互式参考线编辑 (1. 绘制参考线)
- [x] **等分参考线自动生成**：
  - 支持指定水平等分数（行数）和垂直等分数（列数）一键均分
  - **双参考线模式**：在均分时支持开启“双参考线”，允许设置间距（Gutter px）。均分计算时自动在切片间保留此空隙
- [x] **手动添加参考线**：支持一键向画布正中添加水平参考线或垂直参考线
- [x] **极速鼠标拖拽交互**：
  - 悬停参考线鼠标指针变成 `ns-resize` 或 `ew-resize` 缩放手柄，可按住拖拽任意一条线
  - 拖拽时，辅助线在画布上实时以**原始图片分辨率绝对像素坐标 (px)** 动态呈现实时坐标
  - 拖拽双参考线边界时，**双参考线中间的 gutter 废料区域自动呈现红色的 translucent 遮罩**，且标有 "GAP" 废品指示字样，极具工业级质感
- [x] **参考线管理与删除**：
  - 画布上双击任意参考线可直接快速删除
  - 右侧栏“参考线列表”卡片，分组实时显示当前所有垂直线 (X) 和水平线 (Y) 绝对物理坐标，并配备一键清除垃圾桶按钮
  - 支持一键清空全部参考线

### 切片选择性保留 (2. 确认切片与导出)
- [x] **高效 CSS Sprite 渲染**：切片预览网格采用 CSS Sprite 平移截取技术，无需生成大量 DOM Canvas，无论切出多少个切片都绝对不卡顿，且保证最高清画质
- [x] **保留与删除卡片交互**：
  - 切片卡片上标明所处行号、列号、原始像素宽高、全局索引号
  - 点击切片卡片直接切换“保留”或“不导出/已排除”状态。未选中状态遮罩红色斜线，优雅过滤
  - **双参考线间距切片自动识别**：开启双参考线等分时，处于 Gutter 区域的切片自动被标记为 `isGutter` 并**默认置为“已排除”状态**，免除用户繁琐的手动筛选
  - 顶部栏支持“全选”和“清空选择”的批量控制

### 尺寸适配与画布处理
- [x] **自定义目标画布大小**：支持设定导出图片的固定物理像素大小，提供 240x240, 500x500, 800x800, 1000x1000 等常见正方形预设，**默认宽度与高度为 240 px**
- [x] **智能缩放适配规则**：
  - **小于设定尺寸居中**：切片比设定大小小时，保持原尺寸置于设定画布中心（无任何失真）
  - **大于设定尺寸等比缩小**：切片比设定大小大时，自动等比例缩小至容纳在设定画布中，并居中排版
  - **原始尺寸模式**：输入 `0` 或不设 target 时，以切片剪裁的实际物理分辨率 1:1 输出
- [x] **背景色填充**：支持设定透明、纯白、纯黑、灰白等背景色，用于填充多余的外边框 margins

### 格式、命名与导出
- [x] **三种高保真导出格式**：支持导出为 `PNG`、`JPEG`、`WebP`。在 JPEG 和 WebP 下开放压缩质量 (Quality 10%~100%) 滑块调节
- [x] **JPEG 自动透转白**：JPEG 格式不支持 alpha 通道，程序在生成 JPEG 离屏 Canvas 时**自动把透明背景填充为白色**，同时在 UI 上提供友好的💡高亮提示，彻底避免生成丑陋的黑底图
- [x] **高度可定制命名规则**：
  - 支持自定义规则，可交互一键拼接 `{filename}` (原文件名), `{index}` (保留索引), `{row}` (行), `{col}` (列), `{width}` (宽), `{height}` (高) 等占位符
  - 命名输入框下显示**前3个文件的实时生成文件名预览**，所见即所得
- [x] **Tauri 原生文件夹导出**：
  - 点击 Browse 按钮直接唤起系统原生选择对话框挑选磁盘文件夹
  - 导出时底部呈现高精度百分比进度条和进度指示器
  - 导出完毕后，可以在 header 栏一键使用系统 Finder / 资源管理器直接定位至对应的导出路径

### 多重编辑控制
- [x] **重置编辑**：工具栏中的“重置编辑”可在**保留当前已加载图片**的前提下，将所有参考线重置为初始的 3x3 默认状态，不必重新上传
- [x] **更换图片**：随时卸载当前图片，方便切换

---

## 技术实现细节

### Draggable 算法 (可视化拖动)
为了避免 Canvas 重绘事件带来的开销，拖拽控制采用纯 DOM Overlay 叠层方案：
- 渲染图片时，通过 `getBoundingClientRect()` 测出图片在视口中的实际 `displayedSize`，得到缩放比率：
  `scaleX = displayedWidth / originalWidth`  
  `scaleY = displayedHeight / originalHeight`
- 辅助线通过绝对定位的 `div` 盖在图片之上。当 `mousedown` 触发时，记录初始 client 坐标和 reference 相对位置。
- `mousemove` 时，计算 `delta` 像素偏差，并通过 `position = Math.max(0, Math.min(originalLimit, Math.round(startPos + delta / scale)))` 重新计算并保存为原始图片的物理坐标，实现亚像素级精度微调。

### 批量切图离屏 Canvas 生成
- 切片批量渲染依靠独立的离屏 Canvas：
  ```typescript
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth; // tw
  canvas.height = targetHeight; // th
  const ctx = canvas.getContext('2d');
  ```
- 切片图像裁剪核心执行 `ctx.drawImage` 的 9 元素渲染方案：
  ```typescript
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  ```
  其中 `[sx, sy, sw, sh]` 对应 `SliceItem` 数据，`[dx, dy, dw, dh]` 则是基于适配算法计算出的物理渲染包围盒。

---

## 存储规划与权限

由于图片切割工具涉及向用户自定义的系统文件夹写入二进制图片数据，我们在 Tauri 系统中做了如下配合：
1. **Capabilities 配置**：在 `capabilities/default.json` 许可了 `fs` 对任意路径 `**` 的读取与写入权限，许可了 `dialog:allow-open` 调取路径，并白名单许可了 `open` 命令行调用。
2. **操作系统兼容的打开指令**：在 `fs.ts` 中通过解析 `navigator.userAgent`，分别在 Windows 上调取 `explorer`、Mac 上调取 `open`、Linux 上调取 `xdg-open` 进程，从而在沙箱安全约束下顺利唤起系统原生文件管理器展示文件夹。
