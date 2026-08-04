# Prompt 模板导入格式（v1）

在 sanOmni 的“模板管理”中，点击“导入模板”会打开操作面板：可先下载一份可直接交给 Agent 的 JSON 示例，再选择一个 Agent 生成的文件。一个 JSON 文件可以在 `templates` 数组中包含多个模板。面板会实时显示“选择文件 → 完整性校验 → 确认导入”三步状态，并逐项列出校验和写入结果。

模板 JSON 中的所有内容值（名称、说明、提示词、标签、变量标签、默认值和选项）必须使用英文；中文仅用于本页说明和应用界面。

- 文件只包含 1 个通过校验的模板时，确认后会预填到编辑窗口；可以关联图片，最后点击“创建 Prompt”写入本地库。
- 文件包含多个模板时，确认“批量导入”后，会将每个通过校验的模板直接写入本地库，并在弹窗中显示每一项的成功或失败结果。批量导入不会关联图片，之后可逐个编辑关联。
- 某一项校验失败不会影响同一文件中其他已通过的模板；失败项会显示如 `templates[1].price` 的具体字段位置，且绝不会写入模板库。

```json
{
  "format": "sanOmni.prompt-template",
  "version": 1,
  "templates": [
    {
      "name": "Template Name",
      "description": "Template purpose and intended use case.",
      "category": "Product & Ecommerce",
      "tags": ["tag-one", "tag-two"],
      "price": 4.99,
      "prompt": "A complete English prompt using {{variable_key}}.",
      "negative_prompt": "A complete English negative prompt; use an empty string when not needed.",
      "template_schema": {
        "name": "Template Name",
        "description": "Template purpose and intended use case.",
        "raw_prompt": "A complete English prompt using {{variable_key}}.",
        "negative_prompt": "A complete English negative prompt; use an empty string when not needed.",
        "variables": [
          {
            "key": "variable_key",
            "label": "Variable Display Name",
            "type": "input",
            "allow_custom": true,
            "required": true,
            "default": "Default value; use an empty string when not needed.",
            "options": []
          }
        ]
      }
    }
  ]
}
```

校验规则：

- `format` 固定为 `sanOmni.prompt-template`，`version` 当前固定为 `1`。
- `templates` 必须是非空数组，每一项中的 `name`、`description`、`category`、`tags`、`price`、`prompt`、`negative_prompt`、`template_schema` 都必须出现；`negative_prompt`、变量 `default` 和 `options` 可为空值，但字段不能省略。
- 所有模板文本值必须使用英文，不能包含中文字符；这包括名称、说明、提示词、负面提示词、标签、变量标签、默认值及选项的 `label`/`value`。
- 分类必须是 sanOmni 当前支持的分类；价格必须为不小于零的数字；标签不得为空或重复。
- `template_schema` 中的名称、说明、原始提示词、负面提示词，必须分别与外层对应字段完全一致。
- `variables` 必须为数组；静态模板传 `[]`。变量 `key` 仅允许字母、数字、下划线，不能重复；每个变量都要在提示词中以 `{{key}}` 出现，提示词也不能引用未定义变量。
- `type` 仅允许 `input`、`select`、`combobox`。`options` 中每项都必须有非空的 `label` 与 `value`。

导入文件不含图片关联、数据库 ID 或上架状态：图片在单模板编辑窗口中按需要关联；批量导入不关联图片。ID 与状态由 sanOmni 本地生成，避免把机器相关或发布状态误带到新模板中。

此前下载的 v1 单模板文件（顶层 `template` 对象）仍可导入，但它仅用于兼容旧文件；让 Agent 生成新文件时必须使用上面的 `templates` 数组格式。
