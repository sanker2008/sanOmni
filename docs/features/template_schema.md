# Prompt 模板 JSON 规范

为了让系统能够正确解析并渲染出交互式的表单组件，您需要按照以下 JSON 格式提供您的模板定义数据。

## JSON 结构

```json
{
  "name": "string (模板名称, 例如: 多功能图像生成助手)",
  "description": "string (可选, 模板说明)",
  "raw_prompt": "string (带有 {{变量名}} 的原始 Prompt 字符串)",
  "negative_prompt": "string (可选, 基础的负面提示词)",
  "variables": [
    {
      "key": "string (变量的唯一 key，对应 raw_prompt 中的 {{key}})",
      "label": "string (前端表单上显示的中文/阅读名称)",
      "type": "combobox | select | input",
      "required": "boolean (是否必填)",
      "default": "string (默认填充的值)",
      "options": [
        {
          "label": "string (选项的显示名称)",
          "value": "string (选项的实际值，会被替换到 prompt 中)"
        }
      ]
    }
  ]
}
```

## 字段详解

### 顶层字段
- **`raw_prompt`** (必填): 包含插值变量的字符串，必须使用 `{{ }}` 包裹 `变量 key`。例如：`A beautiful {{subject}} painting in {{style}} style.`
- **`negative_prompt`** (可选): 这套模板默认带有的全局负面提示词。当前台表单未填写时，系统会自动提取此字段。
- **`description` / `name`** (可选): 模板简介，同样支持自动提取到表单的基础信息中。
- **`variables`** (必填): 数组，里面包含所有的变量定义。

### `variables` 数组内字段
- **`key`**: 必须与 `raw_prompt` 里的 `{{key}}` 严格一致。
- **`type`**:
  - `combobox`: 推荐下拉选项 + 允许用户自由打字输入新词（推荐）。
  - `select`: 只能选择现成的选项，不能自己打字。
  - `input`: 普通文本输入框（用于类似 "画面主体" 这种自由发挥的词）。
- **`options`**: 数组。只有当类型是 `select` 或 `combobox` 时才有意义，包含该变量的推荐选项列表。

## 完整示例

您可以直接复制这段 JSON 到编辑框进行测试：

```json
{
  "name": "极简摄影模板",
  "description": "用于生成极简主义的摄影作品",
  "negative_prompt": "ugly, blurry, poor quality, noisy, text, watermark",
  "raw_prompt": "A highly detailed {{style}} photography of a {{subject}} in {{location}}, {{lighting}}, 8k resolution, {{aspect_ratio}}",
  "variables": [
    {
      "key": "style",
      "label": "艺术风格",
      "type": "combobox",
      "required": true,
      "default": "minimalist monochrome",
      "options": [
        {"label": "极简黑白", "value": "minimalist monochrome"},
        {"label": "复古胶片", "value": "vintage film"},
        {"label": "赛博朋克", "value": "cyberpunk"}
      ]
    },
    {
      "key": "subject",
      "label": "画面主体",
      "type": "input",
      "required": true,
      "default": "Doberman Pinscher",
      "options": []
    },
    {
      "key": "location",
      "label": "发生地点",
      "type": "combobox",
      "required": true,
      "default": "dense flock of white sheep",
      "options": [
        {"label": "白色羊群中心", "value": "dense flock of white sheep"},
        {"label": "霓虹都市街道", "value": "neon city streets"}
      ]
    },
    {
      "key": "lighting",
      "label": "光影效果",
      "type": "combobox",
      "allow_custom": true,
      "required": false,
      "default": "cinematic lighting",
      "options": [
        {"label": "电影光", "value": "cinematic lighting"},
        {"label": "自然光", "value": "natural light"}
      ]
    },
    {
      "key": "aspect_ratio",
      "label": "画面比例",
      "type": "select",
      "required": true,
      "default": "--ar 9:16",
      "options": [
        {"label": "竖屏 9:16", "value": "--ar 9:16"},
        {"label": "横屏 16:9", "value": "--ar 16:9"}
      ]
    }
  ]
}
```
