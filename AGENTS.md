# sanOmni Agent Rules

## sanPrompt 模板创作、查重与入库规范（Codex / Antigravity 共用）

处理任何 sanPrompt 模板的分析、头脑风暴、创作、查重、去 AI 感、JSON 校验、图片生成或数据库写入任务时，必须先完整读取并执行 sanPrompt 项目内唯一 Skill 真源：

`../sanPrompt/.agents/skills/sanprompt-novelty-analyzer/SKILL.md`

- 不得使用全局副本替代项目 Skill；项目 Skill 的规则和脚本优先。
- 当前约定 sanOmni 与 sanPrompt 是同级 checkout；如果上述项目 Skill 不存在或无法读取，必须停止模板任务并报告缺失，禁止退回全局旧规则继续执行。
- 必须以实时 `D:\sanomnidata\data\database.sqlite` 为商品事实源，sanKnow 只能补充可追溯的创作依据与历史结论。
- 新模板必须通过 Skill 的全批次严格审计；`review` 不等于通过。
- 如果任务生成或编辑图片，必须调用 `newapi-imagegen` Skill。
- 仅分析、查重或创作不代表获得数据库写入授权；用户明确要求入库时才可写入。

## 核心法则：sanPrompt / sanOmni 模板图片生成与全量关联规范 (Mandatory Image Import Rule)

在 `d:\dev\san\` 及 `D:\sanomnidata\` 工作区内处理任何模板生成图片与导入 (Import to Inbox / database.sqlite) 任务时：

1. **必须完整写入三大关联表**：
   绝对禁止只写入 `images` 表。任何生成的图像导入数据库时，必须同步完成以下三连关联：
   - **主模型关联 (`image_model_relations`)**：写入对应 `(image_id, model_id, is_primary = 1)`，并更新 `images` 表中的 `primary_model_id`, `storage_vendor_id`, `storage_model_id`。
   - **模板与变体关联 (`image_prompt_group_relations`)**：匹配 `prompt_groups` 的实际 UUID 外键，写入 `variant_key = 'defaults'`、`variant_json`（包含具体变量键值对 JSON）及 `caption`。
   - **标签体系关联 (`tags` & `image_tag_relations`)**：自动解析模板中的标签写入 `tags` 表（更新 `use_count`），并在 `image_tag_relations` 中建立图片与 Tag 关联，同时将 `images.status` 设为 `'tagged'`。

2. **完整性校验**：
   在写入数据库后，必须通过 SQL 脚本校验这三张关联表的数据是否成功落地，确保前端 UI 可以正常渲染关联的模板商品、主模型 Badge 和 Tag 列表。
