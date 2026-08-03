# Prompt 模板导入格式（v1）

在 sanOmni 的“模板管理”中，点击“下载导入示例”可得到一份可直接交给 Agent 的 JSON 文件。Agent 修改示例内容后，点击“导入模板”选择该文件；通过全部校验后，模板会先预填到编辑窗口，确认“创建 Prompt”才会写入本地库。

```json
{
  "format": "sanOmni.prompt-template",
  "version": 1,
  "template": {
    "name": "模板名称",
    "description": "模板用途与适用场景",
    "category": "Product & Ecommerce",
    "tags": ["标签一", "标签二"],
    "price": 4.99,
    "prompt": "使用 {{variable_key}} 的完整提示词",
    "negative_prompt": "完整的负面提示词；没有时必须写空字符串",
    "template_schema": {
      "name": "模板名称",
      "description": "模板用途与适用场景",
      "raw_prompt": "使用 {{variable_key}} 的完整提示词",
      "negative_prompt": "完整的负面提示词；没有时必须写空字符串",
      "variables": [
        {
          "key": "variable_key",
          "label": "变量显示名称",
          "type": "input",
          "allow_custom": true,
          "required": true,
          "default": "默认值；没有时必须写空字符串",
          "options": []
        }
      ]
    }
  }
}
```

校验规则：

- `format` 固定为 `sanOmni.prompt-template`，`version` 当前固定为 `1`。
- `name`、`description`、`category`、`tags`、`price`、`prompt`、`negative_prompt`、`template_schema` 都必须出现；`negative_prompt`、变量 `default` 和 `options` 可为空值，但字段不能省略。
- 分类必须是 sanOmni 当前支持的分类；价格必须为不小于零的数字；标签不得为空或重复。
- `template_schema` 中的名称、说明、原始提示词、负面提示词，必须分别与外层对应字段完全一致。
- `variables` 必须为数组；静态模板传 `[]`。变量 `key` 仅允许字母、数字、下划线，不能重复；每个变量都要在提示词中以 `{{key}}` 出现，提示词也不能引用未定义变量。
- `type` 仅允许 `input`、`select`、`combobox`。`options` 中每项都必须有非空的 `label` 与 `value`。

导入文件不含图片关联、数据库 ID 或上架状态：图片在编辑窗口中按需要关联，ID 与状态由 sanOmni 本地生成，避免把机器相关或发布状态误带到新模板中。
