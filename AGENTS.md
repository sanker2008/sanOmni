# sanOmni Agent Rules

## 核心法则：sanPrompt / sanOmni 模板图片生成与全量关联规范 (Mandatory Image Import Rule)

在 `d:\dev\san\` 及 `D:\sanomnidata\` 工作区内处理任何模板生成图片与导入 (Import to Inbox / database.sqlite) 任务时：

1. **必须完整写入三大关联表**：
   绝对禁止只写入 `images` 表。任何生成的图像导入数据库时，必须同步完成以下三连关联：
   - **主模型关联 (`image_model_relations`)**：写入对应 `(image_id, model_id, is_primary = 1)`，并更新 `images` 表中的 `primary_model_id`, `storage_vendor_id`, `storage_model_id`。
   - **模板与变体关联 (`image_prompt_group_relations`)**：匹配 `prompt_groups` 的实际 UUID 外键，写入 `variant_key = 'defaults'`、`variant_json`（包含具体变量键值对 JSON）及 `caption`。
   - **标签体系关联 (`tags` & `image_tag_relations`)**：自动解析模板中的标签写入 `tags` 表（更新 `use_count`），并在 `image_tag_relations` 中建立图片与 Tag 关联，同时将 `images.status` 设为 `'tagged'`。

2. **完整性校验**：
   在写入数据库后，必须通过 SQL 脚本校验这三张关联表的数据是否成功落地，确保前端 UI 可以正常渲染关联的模板商品、主模型 Badge 和 Tag 列表。
