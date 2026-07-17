# sanLabs — Gemini 视频水印修复

## 功能范围

`Gemini 视频水印修复`在本机处理 Gemini 生成的 MP4 视频：

- 支持 `1280×720`、`720×1280`、`1920×1080`、`1080×1920`。
- 前 5 帧自动校准右下角星形水印的位置与透明度。
- 逐帧执行反向 Alpha 混合，720p 的高 Alpha 边缘额外使用邻域扩散修复。
- 输出为 H.264 MP4；输入为 AAC 时直接复制压缩音频包，不重复编码。
- 支持 Alpha 强度、X/Y 位置微调、取消处理、结果预览和另存为。
- 只修复可见水印，不移除 Google 隐藏的 SynthID。

## 实现结构

- UI：`src/components/lab/gemini-video-watermark/GeminiVideoWatermarkLab.tsx`
- 视频引擎：`src/components/lab/gemini-video-watermark/engine.ts`
- 大文件分块保存：`src/components/lab/gemini-video-watermark/fs.ts`
- 安全追加写入命令：`secure_fs_append_file`

媒体读取、WebCodecs 解码/编码和 MP4 封装由 Mediabunny 负责。转换使用自定义逐帧 `process` 回调，音频未配置转码参数，因此兼容的 AAC 轨道走编码包复制路径。

反算公式：

```text
original = (observed - alpha * logoColor) / (1 - alpha)
```

## 运行要求

- WebView 必须提供 `VideoDecoder` 和 `VideoEncoder`。
- 必须能够解码输入视频并编码 AVC/H.264。
- 非支持分辨率会在处理前停止，不生成不可靠结果。

## 验证记录

2026-07-17 使用真实 Chrome/WebCodecs 完成了两组端到端测试：

- 1080p H.264 + AAC：处理前水印模板相关性 `0.6325`，处理后 `-0.0491`；音频保持 AAC，时长不变。
- 720p H.264：处理前相关性 `0.9949`，处理后 `-0.1970`。
- 前端生产构建通过，Rust `cargo check` 通过，功能页面处理期间无新增控制台错误。

## 参考资料

- WebCodecs `VideoDecoder`：https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder
- WebCodecs `VideoEncoder`：https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder
- Mediabunny Quick Start：https://mediabunny.dev/guide/quick-start
- Mediabunny Conversion API：https://mediabunny.dev/api/Conversion
- Tauri Dialog：https://v2.tauri.app/plugin/dialog/
- Tauri File System：https://v2.tauri.app/plugin/file-system/
