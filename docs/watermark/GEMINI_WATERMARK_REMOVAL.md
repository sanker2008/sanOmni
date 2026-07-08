# Gemini 水印去除兼容说明

最后更新：2026-06-23

## 背景

Gemini 生成图的可见水印存在多个 profile，不能只按图片尺寸或宽高比判断位置。已确认的变化包括：

- 旧 profile：`96px` 水印通常使用右/下 `64px` 边距；`48px` 水印通常使用右/下 `32px` 边距。
- 新 profile：Gemini 2026-05-20 前后开始出现新的 alpha 模板和更内缩的位置。
  - 大图使用 `96px` 水印，右/下 `192px` 边距。
  - `1024x1024` 图使用 `48px` 水印，右/下 `96px` 边距；该类样本的 alpha 更接近 `bg_48 * 0.6`。
- 新旧水印外形接近，但 alpha 模板不同。用旧模板反算新水印会出现白色水印变成深色残影，或只消掉中心、边缘仍然可见。

## 根本原因

旧实现主要有三类问题：

1. 只支持旧 `bg_48.png` / `bg_96.png` 透明度模板。
2. 自由搜索使用 NCC 相关系数，遇到人物、文字、钟表等强纹理区域时，可能被右下白底或边缘内容的假峰值带偏。
3. 前端部分入口只判断 `result.success`，会把低置信 fallback 输出误当作可靠去水印结果。

典型失败：

- `rqm0` 样例的真实水印在 `1024x1024` 图的 `(880,880)`，但自由搜索命中了 `(967,844)` 的白底假峰值，所以脸角和手臂水印基本没变。
- `c80u` 黑底样例真实水印是新版 `96px / margin 192` profile。旧 `bg_96` 模板会把中心反算过黑并留下亮边。

## 当前实现

后端实现位于 `src-tauri/src/commands/gemini_watermark_removal.rs`。

- 内置 alpha 模板：
  - `bg_48.png`
  - `bg_96.png`
  - `bg_96_20260520.png`
- 检查尺寸：`96 / 72 / 48 / 36`。
- 新 profile 优先于自由搜索：
  - 大图：`96px`，右/下 `192px`，alpha `20260520`。
  - 非大图：`48px`，右/下 `96px`，alpha `legacy_scale_0.60`。
- 已知 profile 使用 alpha/luminance evidence 评分，而不是单纯 NCC。纯色暗背景亮度方差接近 0 时不会被当成水印。
- `48px / margin 96 / legacy_scale_0.60` 使用独立的较低 evidence 阈值。该 profile 经常叠在人物脸部、手臂等强纹理区域，相关分会偏低；如果阈值过高，会退回自由搜索并命中右侧白底假峰值。
- 旧 profile 和自由搜索作为 fallback：
  - 大图 legacy：`96px`，右/下 `64px`。
  - 非大图 legacy：`48px`，右/下 `32px`。
  - 额外 `96/72/36px` 内缩水印由自由搜索覆盖。
- `method` 会返回命中的 `size / x / y / conf / profile / alpha`，便于排查。
- `watermark_detected` 只有在已知 profile 命中或动态检测达到可靠阈值时为 `true`。

## 前端约定

所有 Gemini 去水印入口都必须使用：

```ts
isGeminiWatermarkRemovalSuccessful(result)
```

该 helper 要求：

```ts
result.success && result.watermark_detected
```

已接入入口：

- `src/components/ImageCard.tsx`
- `src/components/IpArchivedView.tsx`
- `src/components/lab/image-compressor/ImageCompressor.tsx`
- `src/components/lab/image-slicer/ImageSlicer.tsx`

新增入口时不要只判断 `result.success`。`success` 表示命令执行并写出文件，不代表可靠去除了 Gemini 水印。

## sanLabs 高级修复工具

sanLabs 中新增了 `Gemini 水印高级修复`，用于一键自动处理失败后的人工兜底。该工具调用同一套后端逻辑，不再维护另一份去水印算法。

入口：

- `src/components/lab/LabView.tsx`
- `src/components/lab/gemini-watermark-lab/GeminiWatermarkLab.tsx`
- Tauri 命令：`advanced_remove_gemini_watermark`
- TypeScript API：`geminiWatermarkApi.advancedRemove(request)`

使用顺序：

1. 先用【自动处理】。自动模式等同现有一键逻辑，会先跑已知 profile，再跑自由搜索 fallback。
2. 如果 `method` 中出现 `profile: false`，或 `x/y` 明显命中右下白底、边缘、文字、钟表等非水印区域，改用【框选水印】。
3. 手动框选时只覆盖可见 Gemini 水印区域，不要把过多背景框进去。后端会把框选区域归一为水印方形模板。
4. 手动模式优先使用 `Auto` profile；仍有残留时再切换 profile 或调整 alpha 强度。

Profile 选择建议：

| 场景 | 建议 profile | 典型位置 |
| --- | --- | --- |
| `1024x1024`，水印在脸角、手臂等强纹理区域 | `legacy_scale_0.60` | `48px / margin 96` |
| 大图新版，黑底残留、变深、亮边 | `20260520` | `96px / margin 192` |
| 旧 Gemini 图 | `legacy` | `48px / margin 32` 或 `96px / margin 64` |
| 不能确认版本 | `auto` | 按框选尺寸自动选 |

Alpha 强度调试：

- 处理后还有偏白水印：略微提高 alpha，例如 `105%` 到 `115%`。
- 处理后水印变深、边缘发黑：降低 alpha，例如 `90%` 到 `95%`。
- 每次只调整 `5%` 到 `10%`，避免过度反算导致背景被破坏。

命中信息排查：

- `profile: true`：命中了已知 profile，通常可作为可靠结果。
- `profile: false`：来自自由搜索，遇到强纹理图片时需要人工复核。
- `alpha: legacy_scale_0.60`：1024 新位置小水印。
- `alpha: 20260520`：大图新版 alpha。
- `watermark_detected=false`：仅表示生成了 fallback 文件，不应自动替换正式图。

## 回归测试

后端单测覆盖：

- `36px` 小尺寸 alpha map 可生成。
- 旧默认右下角水印可检测。
- 超出旧 `128px` 范围的内缩水印可检测。
- `1024x1024 / 48px / margin 96 / alpha legacy_scale_0.60` 已知 profile 优先命中。
- 大图 `96px / margin 192 / alpha 20260520` 已知 profile 优先命中。
- 纯色暗背景不会被已知 `20260520` profile 误判为水印。
- 右下角普通图像内容不会被自由搜索误判为高置信水印。

验证命令：

```bash
cd src-tauri
cargo test gemini_watermark_removal
cargo test
cd ..
pnpm run build
```
