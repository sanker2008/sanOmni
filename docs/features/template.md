# Prompt 模板商品化说明

## 定位

`sanOmni` 里的 Prompt 模板不再只是“便于对比的 Prompt 分组”，而是面向 `sanPrompt` 网站发布的商品源数据。

本地端负责：

- 创建和维护模板主体：`name`、`prompt`、`negative_prompt`、`description`、`template_schema`
- 维护商业字段：`category`、`tags`、`price`、`is_published`、`publish_status`
- 维护云端同步字段：`remote_slug`、`remote_url`、`last_published_at`
- 维护图片与模板之间的展示关系，用于网站封面、详情画廊、模型效果证明

## 分类规划

分类采用“商业用途优先”的一级目录，`sanOmni` 与 `sanPrompt` 共用同一套 taxonomy，避免本地创建和线上展示脱节。

V1 一级分类：

1. `Product & Ecommerce`
2. `Marketing & Ads`
3. `Portrait & Personal Brand`
4. `Character & IP`
5. `Fashion & Beauty`
6. `Interior & Architecture`
7. `UI & Digital Product`
8. `Illustration & Concept Art`
9. `Print & Merchandise`
10. `Cinematic & Storyboard`

说明：

- `category` 用于网站主导航、列表页筛选、SEO 路由。
- `tags` 作为次级维度，表达风格、行业、镜头、材质、模型适配、输出用途等。
- 不按模型本身做一级分类，模型信息通过标签与图片证据层体现。

## 图片资产如何服务模板

归档图片仍然首先是本地图片资产，但当它和模板建立关系后，会承载商品展示语义。

`image_prompt_group_relations` 当前承载以下信息：

- `role`: 图片在商品中的角色，例如封面、画廊、隐藏证据
- `is_cover`: 是否为列表主图
- `sort_order`: 详情页展示顺序
- `caption`: 面向前台展示的简短说明
- `variant_key`: 同一模板下的变体键，例如不同模型或不同参数组合
- `variant_json`: 变体快照，可记录模型、参数、批次等上下文
- `is_sync_enabled`: 是否允许同步到 `sanPrompt`
- `sync_status`: 当前图片同步状态
- `remote_url`: 云端图片地址

这意味着一张归档图可以同时具备两层身份：

1. 本地图片资产，可独立被搜索、筛选、再利用。
2. 模板商品证据，用来证明“同一模板在不同模型/参数下的可交付效果”。

## 同一模板，不同模型图片的表达方式

推荐按“模型效果矩阵”理解，而不是单纯相册：

- 同一个模板作为一个商品主体。
- 不同模型生成的图片，作为该商品下的不同 `variant_key` 或 `variant_json` 证据组。
- 前台优先展示封面图与高价值画廊图，同时保留“本模板已测试模型”与“最佳效果模型”的说明。

这样做的原因很直接：

- 用户购买的是“结果确定性”，不是抽象 prompt 字符串。
- 不同模型的成片差异，需要在商品层直接可见。
- 模板可持续扩展，不需要为每个模型重新复制一份商品。

## 本地到线上发布流

1. 在 `sanOmni` 创建或编辑模板。
2. 设定统一分类、标签、价格和上架状态。
3. 选择哪些归档图片参与该模板展示，并维护封面、顺序、说明、模型变体信息。
4. 通过发布动作将模板主体、图片关系元数据、已测试模型与最佳模型信息同步到 `sanPrompt`。
5. 云端返回 `remote_slug`、`remote_url` 和发布状态，本地保存为后续增量更新依据。

## 与 sanIP 的边界

这套设计只影响 `sanPrompt` 域：

- `prompt_groups` 及其图片关系属于 Prompt 商品域。
- `sanIP` 的角色、设定图、表情包、作品集合不接入这套模板商品分类体系。
- 不会要求 `sanIP` 复用 `prompt_groups` 或 Prompt 商品的图片关系元数据。

因此，本次模板商品化是 `sanPrompt` 域内部增强，不改变 `sanIP` 的业务边界。
