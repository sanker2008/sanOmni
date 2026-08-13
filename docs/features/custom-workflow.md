# sanLabs 无限画布自定义工作流 (Custom Workflow Canvas)

`sanLabs` 自定义工作流工具允许将 sanLabs 内部的小工具作为节点添加在点阵无限画布上，节点之间通过贝塞尔连线组合为有向无环图 (DAG) 管道，前一个节点的处理输出自动传递为后一个节点的输入。

---

## 核心特性

1. **无限点阵画布 (Infinite Canvas)**：
   - 展现点阵背景，支持鼠标滚轮以光标坐标为中心做 15%~300% 自由放缩。
   - 按住鼠标中键或在空白区域拖拽平移画布。

2. **工具节点化 (Workflow Adapters)**：
   包含 7 个预置工具节点算子：
   - **Gemini 水印修复** (`gemini-watermark-auto`)
   - **图片压缩** (`image-compress`)
   - **高级抠图 Pro** (`background-removal`)
   - **PNG 转 SVG** (`png-to-svg`)
   - **图片切割** (`image-slice`)
   - **动图拆帧** (`gif-decompose`)
   - **格式转换** (`format-convert`)

3. **端口贝塞尔拉线 (Ports & Bezier Connections)**：
   - 节点卡片左侧为输入端口，右侧为输出端口。
   - 从右侧输出端口按下鼠标拖拽拉出三次贝塞尔曲线，连接到目标节点的输入端口。
   - 选中节点或连线后按下 `Delete` / `Backspace` 快捷键可删除。

4. **单节点独立运行 (Single Node Execution)**：
   - 节点 Header 包含单独运行按钮 `▶`。
   - 支持只单独执行特定节点算子，自动追溯前置依赖输出或直连输入图片。

5. **DAG 拓扑执行引擎 (Engine)**：
   - 基于拓扑排序 (Topological Sort) 计算执行依赖。
   - 节点卡片实时呈现状态、耗时与即时输出预览缩略图。

6. **工程存储管理**：
   - 工作流定义保存在 `<labsRoot>/custom_workflows/workflows.json` 中。
   - 支持项目命名、保存、加载、一键自动网格排布 (Auto Arrange) 与导出结果管理。
