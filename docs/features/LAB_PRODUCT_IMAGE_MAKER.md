# sanLabs — 产品图制作工具 (Product Image Maker) Specs

> **版本**: v1.0  
> **最后更新**: 2026-05-29  
> **状态**: 已实现

---

## 概述

sanLabs 是 sanOmni 的第三个顶级功能域，作为独立的工具集合区域，容纳各种图片处理小工具。与 Prompt 模板管理和 IP 资产管理完全独立，**零后端依赖、零数据库依赖**。

**产品图制作器**是 sanLabs 中的第一个工具，用于创建带文字叠加的产品推广图。

---

## 架构设计

### 与 sanOmni 的关系

```
┌─────────────────────────────────────────────────────────┐
│                      sanOmni                        │
│                   (统一应用外壳)                          │
│                                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐│
│  │  App A:      │ │  App B:      │ │  App C:          ││
│  │  Prompt 模板  │ │  IP 形象     │ │  sanLabs 工具箱     ││
│  │  管理        │ │  管理        │ │                  ││
│  │  ↕ Tauri后端  │ │  ↕ Tauri后端 │ │  纯前端，无后端   ││
│  │  ↕ SQLite    │ │  ↕ SQLite   │ │  无数据库依赖     ││
│  └──────────────┘ └──────────────┘ └──────────────────┘│
│                                                         │
│  共享: UI组件 (shadcn/ui) · 主题系统 · 全局状态外壳       │
└─────────────────────────────────────────────────────────┘
```

### 耦合度分析

| 依赖项 | 是否依赖 | 说明 |
|--------|:--------:|------|
| `stores/index.ts` | ✅ 最小 | 仅扩展 `activeTab` 类型加 `"labs"` |
| `App.tsx` | ✅ 最小 | 仅添加 Tab 按钮 + 条件渲染 |
| `services/tauri.ts` | ❌ | 不使用任何 Tauri IPC 调用 |
| `useImageStore` | ❌ | 不引用图片 store |
| `useIpImageStore` | ❌ | 不引用 IP 图片 store |
| `useVendorStore` | ❌ | 不引用厂商 store |
| `useTagStore` | ❌ | 不引用标签 store |
| 后端 Rust 代码 | ❌ | 不涉及任何后端修改 |
| SQLite 数据库 | ❌ | 不读写数据库 |
| Tailwind CSS | ✅ | 使用项目已有的 Tailwind 类名 |
| Lucide Icons | ✅ | 使用项目已有的图标库 |
| Zustand | ✅ | 独立 store 文件，不与全局 store 合并 |

---

## 文件结构

```
src/components/lab/
├── LabView.tsx                              # sanLabs 主视图容器
└── product-image-maker/
    ├── types.ts                             # 类型定义（Layer, Canvas 等）
    ├── fonts.ts                             # Google Fonts 配置与加载器
    ├── useProductImageStore.ts              # 独立 Zustand store
    ├── ProductImageMaker.tsx                # 工具主组件
    ├── CanvasPreview.tsx                    # Canvas 渲染与交互
    ├── LayerPanel.tsx                       # 图层列表管理
    ├── PropertyPanel.tsx                    # 属性编辑面板
    └── FontSelector.tsx                     # Google Fonts 字体选择器
```

---

## 功能清单

### 画布设置
- [x] 自定义画布尺寸（宽/高）
- [x] 预设尺寸模板（1000×1000, 800×800, 1200×628, 1080×1080, 1920×1080, 1080×1920）
- [x] 自定义背景色
- [x] 实时缩放预览（自适应容器大小）

### 文字图层
- [x] 添加多个文字图层
- [x] 文字内容编辑
- [x] Google Fonts 字体选择（38+ 精选字体）
  - Sans-serif: Inter, Roboto, Open Sans, Montserrat, Poppins, Outfit, Nunito, Raleway, Work Sans, DM Sans, Manrope, Space Grotesk
  - Serif: Playfair Display, Merriweather, Lora, Crimson Text, Source Serif 4
  - Display: Bebas Neue, Oswald, Anton, Archivo Black, Righteous, Alfa Slab One
  - Handwriting: Dancing Script, Pacifico, Caveat, Sacramento
  - Monospace: JetBrains Mono, Fira Code, Source Code Pro
  - 中文: Noto Sans SC, Noto Serif SC, ZCOOL XiaoWei, ZCOOL QingKe HuangYou, Ma Shan Zheng, Liu Jian Mao Cao, Zhi Mang Xing, Long Cang
- [x] 字体大小调节（8-500px）
- [x] 字体粗细调节（100-900 共9档）
- [x] 文字颜色选择（拾色器 + Hex 输入）
- [x] 透明度调节（0%-100% 滑块）
- [x] 文字对齐（左/中/右）
- [x] 字间距调节
- [x] 装饰线（文字两侧横线，可配颜色和宽度）
- [x] 位置调节（X/Y 坐标数值输入）

### 图片图层
- [x] 上传本地图片作为图层
- [x] 图片尺寸调节（锁定宽高比）
- [x] 图片位置调节（X/Y 坐标）
- [x] 透明度调节
- [x] 边框（宽度 + 颜色）
- [x] 替换图片（保留位置和尺寸比例）

### 图层管理
- [x] 图层列表（逆序显示，顶层在前）
- [x] 点击选中图层
- [x] 图层可见性切换
- [x] 图层删除
- [x] 图层复制
- [x] 图层上移/下移
- [x] Canvas 上点击命中检测选中图层
- [x] Canvas 上拖拽移动图层

### 导出
- [x] PNG 格式导出
- [x] 原始分辨率输出（不受预览缩放影响）
- [x] 浏览器原生下载（无需 Tauri）

### 快速模板
- [x] 产品图模板（类似参考图风格）

---

## 数据流

```
                    ┌────────────────────────┐
                    │  useProductImageStore   │  (独立 Zustand store)
                    │                        │
                    │  canvas: CanvasSettings │
                    │  layers: Layer[]        │
                    │  selectedLayerId: id    │
                    └────────┬───────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
    ┌──────────────┐ ┌────────────┐ ┌──────────────┐
    │ CanvasPreview│ │ LayerPanel │ │ PropertyPanel│
    │              │ │            │ │              │
    │  Canvas 渲染  │ │ 图层列表   │ │ 属性编辑     │
    │  拖拽交互    │ │ 增/删/排序 │ │ 实时更新     │
    └──────────────┘ └────────────┘ └──────┬───────┘
                                           │
                                    ┌──────▼───────┐
                                    │ FontSelector │
                                    │              │
                                    │ Google Fonts │
                                    │ 搜索/分类/预览│
                                    └──────────────┘
```

---

## 技术实现细节

### Canvas 渲染
- 使用 HTML5 Canvas 2D API
- 文字渲染: `ctx.fillText()`, 支持 letter-spacing 的手动字符渲染
- 图片渲染: `ctx.drawImage()`, 以中心点定位
- 透明度: `ctx.globalAlpha`
- 选中指示器: 蓝色虚线边框
- 使用 `requestAnimationFrame` 确保流畅渲染

### Google Fonts 加载
- 通过动态注入 `<link>` 标签加载 Google Fonts CSS
- 懒加载: 字体选中/hover 时才加载
- 预加载: 启动时预加载 5 款常用字体
- 字体就绪检测: 使用 `document.fonts.load()` API

### 导出实现
- 创建离屏 Canvas（原始分辨率）
- 重新渲染所有可见图层
- 使用 `canvas.toBlob('image/png')` 生成 Blob
- 创建临时 `<a>` 标签触发浏览器下载

### 图片缓存
- 使用 `Map<string, HTMLImageElement>` 缓存已加载的图片
- 避免每帧重新创建 Image 对象
- 定时检查未加载完成的图片并触发重绘

---

## 存储目录规划

### 当前阶段（纯前端）
- **输入**: 用户通过浏览器文件选择器上传，存为 Data URL
- **输出**: 通过浏览器下载保存到用户选择的位置

### 未来扩展（如需 Tauri 文件系统）

```
{AppDataDir}/
├── lab/
│   ├── product-image-maker/
│   │   ├── input/           # 上传的素材
│   │   ├── output/          # 导出的产品图
│   │   └── templates/       # 保存的模板 (JSON)
│   ├── image-slicer/        # 图片切割 (未来)
│   │   ├── input/
│   │   └── output/
│   └── image-compressor/    # 图片压缩 (未来)
│       ├── input/
│       └── output/
```

---

## 未来扩展计划

### 产品图制作器增强
- [ ] 模板保存/加载功能
- [ ] 批量文字替换生成多张图
- [ ] 更多导出格式 (JPG, WebP)
- [ ] 图层旋转
- [ ] 图层缩放手柄
- [ ] 撤销/重做
- [ ] 渐变色文字
- [ ] 阴影效果

### 新增 sanLabs 工具
- [ ] 图片切割（网格切割 / 自定义区域切割）
- [ ] 图片尺寸压缩（批量调整尺寸 / 文件大小优化）
- [ ] 图片格式转换（PNG ↔ JPG ↔ WebP）
- [ ] 色彩调整（亮度 / 对比度 / 饱和度）
- [ ] 背景移除
