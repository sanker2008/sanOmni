# 图片切割工具画布缩放与平移设计规格说明书 (Image Slicer Canvas Zoom & Pan Spec)

为了提升图片切割（图片均分/自定义切分）的使用体验，我们需要在 `SlicerCanvas` 画布中实现图片的缩放、平移以及恢复原大小（重置缩放）的功能。

## 需求概述

1. **鼠标滚轮缩放**：
   - 按住 `Ctrl` 键并滚动鼠标滚轮时，对画布中的图片及参考线进行等比放大或缩小。
   - 缩放比例范围限制为 10% (0.1x) 到 500% (5.0x)。
   - 默认缩放比例为 100% (1.0x)，即图片初始自适应 viewport 的大小。
2. **恢复原大小/重置缩放**：
   - 提供便捷方式恢复到默认大小（1.0x 自适应屏幕大小）。
3. **画布拖拽平移 (Pan)**：
   - 当图片放大超出视口产生滚动条时，允许按住鼠标左键在空白区域或图片上拖拽以平移（滚动）画布，体验类似于 Figma 或蓝湖等设计工具。
4. **悬浮缩放控制栏**：
   - 在画布视口右下角显示一个毛玻璃半透明（glassmorphism）的悬浮控制工具栏。
   - 显示当前的缩放百分比（例如：`120%`）。
   - 提供 `+` (放大)、`-` (缩小) 按钮。
   - 提供 `恢复` (RotateCcw) 按钮，点击恢复到 100% 默认大小。
   - 点击中间的百分比数字也可以直接恢复到 100% 大小。

---

## 技术方案与实现细节

### 1. 组件布局调整

目前 `SlicerCanvas.tsx` 中最外层的 `div` 既是 flex 容器，又是 `overflow-auto` 的滚动区域。
为了让悬浮控制工具栏相对于视口固定定位（不随图片滚动），我们需要将布局重构为：
- **外层包裹容器** (Relative, full width & height, `overflow-hidden`, flex-col)
  - **滚动视口容器** (Absolute/relative, flex-1, `overflow-auto`, 用于图片滚动)
    - **图片容器** (Relative, 承载图片和参考线层)
  - **悬浮缩放控制面板** (Absolute, bottom-6, right-6, z-40)

### 2. 状态定义

在 [SlicerCanvas.tsx](file:///d:/aidev/omni/sanOmni/src/components/lab/image-slicer/SlicerCanvas.tsx) 中新增以下状态：
```typescript
const [zoom, setZoom] = useState<number>(1.0); // 缩放比例 (0.1 - 5.0)
const [baseSize, setBaseSize] = useState({ width: 0, height: 0 }); // 图片自适应 fit 时的基础宽高

// 平移 (Pan) 状态
const [panState, setPanState] = useState({
  isPanning: false,
  startX: 0,
  startY: 0,
  scrollLeft: 0,
  scrollTop: 0
});
```

### 3. 动态缩放逻辑

1. **基础大小计算**：
   在图片初次加载或窗口大小时，如果 `zoom === 1`，将图片通过 `getBoundingClientRect()` 测得的渲染宽度和高度保存至 `baseSize`。
2. **样式缩放应用**：
   - 当 `zoom === 1` 时，保持原有的 CSS 样式以确保自适应特性不变。
   - 当 `zoom !== 1` 时，为图片容器及图片本身显式设置宽高：
     - 图片容器：`width: baseSize.width * zoom, height: baseSize.height * zoom, maxWidth: 'none', maxHeight: 'none'`
     - 图片元素：`width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none'`
   - 这样 guidelines 依赖的 `getBoundingClientRect()` 会自动获取缩放后的精确尺寸，所有的参考线定位计算 (`scaleX`, `scaleY`) 以及拖拽修改逻辑均无需做任何坐标公式改动，将完美天然自适应！

### 4. 交互实现

1. **Ctrl + 滚轮缩放**：
   在 `useEffect` 中为滚动视口容器绑定非 passive 的 `wheel` 事件监听器：
   ```typescript
   const handleWheel = (e: WheelEvent) => {
     if (e.ctrlKey) {
       e.preventDefault();
       const zoomFactor = 1.1;
       setZoom((prev) => {
         let nextZoom = prev;
         if (e.deltaY < 0) {
           nextZoom = Math.min(5.0, prev * zoomFactor);
         } else {
           nextZoom = Math.max(0.1, prev / zoomFactor);
         }
         return nextZoom;
       });
     }
   };
   ```
2. **拖动平移 (Pan)**：
   - 在滚动视口容器上监听 `onMouseDown`。如果点击的不是参考线（未触发 `e.stopPropagation()`），并且点击的不是交互控件（如按钮/输入框），则进入 panning 状态：
     ```typescript
     setPanState({
       isPanning: true,
       startX: e.clientX,
       startY: e.clientY,
       scrollLeft: viewport.scrollLeft,
       scrollTop: viewport.scrollTop,
     });
     ```
   - 拖拽过程中动态设置 `viewport.scrollLeft = panState.scrollLeft - (e.clientX - panState.startX)` 以及 `viewport.scrollTop = panState.scrollTop - (e.clientY - panState.startY)`。
   - 移动和释放事件在 `window` 上全局监听以保持极佳的拖拽跟手感。
   - 将视口容器的光标样式绑定为 `cursor: panState.isPanning ? 'grabbing' : 'grab'`。

---

## 验证计划

### 1. 手动测试用例
- **缩放验证**：
  - 加载图片，在画布内按住 `Ctrl` 滚动滚轮，验证图片和参考线是否同时等比缩放。
  - 验证缩放上限为 500%，下限为 10%。
  - 点击悬浮工具栏的 `+` / `-` 按钮，验证缩放是否正确响应。
- **恢复原大小验证**：
  - 缩放到任意比例，点击悬浮工具栏中的百分比文字或点击 `RotateCcw` 重置按钮，验证图片和参考线是否立刻完美恢复到初始自适应大小。
- **拖动平移验证**：
  - 放大图片后出现滚动条，在空白区域或图片上按住鼠标左键并拖拽，验证画布是否能平滑移动。
  - 验证拖拽过程中光标从 `grab` 变为 `grabbing`。
  - 验证拖拽参考线时，不会触发画布平移。
