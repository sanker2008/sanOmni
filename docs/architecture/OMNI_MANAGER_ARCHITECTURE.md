# Omni-Manager (超级后台) 架构设计

## 背景与演进

在 sanOmni 系统向商业化售卖平台（sanPrompt 网站）演进的过程中，关于“商品上架与后台管理”的架构方案，我们曾面临两种选择：
- **方案 A（客户端全包）**：在本地 sanOmni 直接集成管理面板，配置好价格、分类后推送到云端。
- **方案 B（网页创作者中心）**：本地只负责推送草稿，在 sanPrompt 网站额外开发一套带有鉴权和管理后台（Dashboard）的系统来完成最终包装上架。

经过深入讨论，我们确立了采用 **方案 A（Omni-Manager）** 作为核心架构。

## 核心理念：极致的胖客户端 + 极简的瘦服务端

### 1. sanOmni 化身“超级中枢”
放弃开发复杂的网页后台，将桌面端 `sanOmni` 赋予了 **“全方位商品管理总控中心”** 的能力：
- 资产依然存储和管理在本地 SQLite 数据库中。
- 当用户希望将模板变现时，点击 `sanOmni` 的【管理商城信息】按钮。
- 本地弹出原生或 React 的配置面板（PublishModal），维护商品字段而不只是“是否发布”。
- 模板在本地维护统一 taxonomy、标签、价格、发布状态、云端地址，以及图片的封面/画廊/模型变体元数据。
- 通过向 `sanPrompt` 后端发送完整的商品化 Payload 完成创建、更新和重新发布。

### 2. sanPrompt 专注“前台变现”
`sanPrompt` (Next.js 网站) 作为前台商城和用户游乐场（Playground），被最大程度地“瘦身”：
- **不需要复杂的卖家鉴权与数据隔离**：目前基于全局 `SYNC_SECRET` API 密钥接受本地数据的推送。
- **只需专注消费者体验**：展示商品列表、分类筛选、商品详情画廊、Prompt Playground，以及后续支付转化。
- **本地为唯一商品源头**：网站不再承担另一套创作者中心职责，避免本地和线上各维护一份分类与商品配置。

## 通信协议扩充

为了实现本地与云端的状态同步，双方通过 `/api/sync` 接口进行通信交互：
1. **下发上架 (Action: publish_template)**
   ```json
   {
     "action": "publish_template",
     "payload": {
       "id": "...",
        "name": "...",
        "prompt": "...",
        "negative_prompt": "...",
        "description": "...",
        "template_schema": {},
        "price": 9.99,
        "category": "Product & Ecommerce",
        "tags": ["hero-shot", "beauty-lighting", "cosmetics"],
        "is_published": true,
        "publish_status": "published",
        "tested_models": ["gpt-image-1", "midjourney-v7"],
        "best_for_models": ["gpt-image-1"],
        "images": [
          {
            "id": "...",
            "url": "...",
            "role": "gallery",
            "is_cover": true,
            "sort_order": 0,
            "caption": "Main conversion image",
            "variant_key": "gpt-image-1/default",
            "variant_json": {
              "model": "gpt-image-1",
              "preset": "default"
            },
            "is_sync_enabled": true
          }
        ]
      }
    }
   ```
2. **状态回拉 (Action: get_status)**
   客户端（sanOmni）可以请求某批 ID 的实时云端状态（价格、上下架、远端 slug/url、最近发布时间），以更新本地商品状态。

## 统一分类策略

`sanOmni` 与 `sanPrompt` 共用同一套一级分类，分类以商业用途为主，而不是按模型或画风分裂：

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

标签系统继续承担风格、行业、镜头语言、输出场景、模型适配等次级维度。

## 图片关系升级

归档图片仍然是本地资产，但一旦与模板绑定，就会带上商品展示语义。`image_prompt_group_relations` 需要同时支持：

- 封面图与详情画廊排序
- 图片说明文案
- 不同模型/参数变体的标记
- 是否同步到云端
- 云端同步状态与返回地址

这使 `sanOmni` 不只是“传模板文本”，而是传一整套可售卖的商品证据。

## 优势分析
- **极高的管理效率**：对创作者而言，从微调模型提示词，到设定价格上架，整个生命周期都在同一套熟悉且极速响应的本地 UI 下完成。
- **极低的开发维护成本**：省去了一整套网页端增删改查后台系统的研发，直接利用现有的桌面端能力。
- **符合 Omni 命名哲学**：真正做到了一切尽在“全方位管理中心（Omni）”掌控之中。
- **避免双源配置**：分类、价格、图片选择、模型证据不再本地一套、线上一套，减少运营错误。

## 与 sanIP 的边界

Omni-Manager 方案只作用于 `sanPrompt` 模板商品域：

- 不改变 `sanIP` 的角色资产、表情包、关系网络设计。
- 不要求 `sanIP` 复用 Prompt 商品分类或发布字段。
- 后续即使 `sanIP` 有独立分发能力，也应单独设计，不混入本方案。
