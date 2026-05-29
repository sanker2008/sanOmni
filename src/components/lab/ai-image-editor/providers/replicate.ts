/**
 * replicate.ts — Replicate 适配器（云端 Flux / SD 模型）
 */
import type { ApiProvider, InpaintRequest, InpaintResult, ProviderMeta } from '../types';

export const REPLICATE_META: ProviderMeta = {
  id: 'replicate',
  name: 'Replicate',
  description: '云端托管的 Flux、Stable Diffusion 等模型（按次计费）',
  fields: [
    { key: 'api_token', label: 'API Token', type: 'password', placeholder: 'r8_...' },
    { key: 'model', label: '模型', type: 'select', defaultValue: 'black-forest-labs/flux-fill-pro', options: [
      { label: 'Flux Fill Pro (推荐)', value: 'black-forest-labs/flux-fill-pro' },
      { label: 'Flux Dev Inpainting', value: 'black-forest-labs/flux-dev-inpainting' },
      { label: 'SD Inpainting', value: 'stability-ai/stable-diffusion-inpainting' },
      { label: 'SDXL Inpainting', value: 'lucataco/sdxl-inpainting' },
    ]},
    { key: 'poll_interval', label: '轮询间隔 (ms)', type: 'number', defaultValue: 2000, min: 500, max: 10000, step: 500 },
    { key: 'timeout', label: '超时时间 (s)', type: 'number', defaultValue: 300, min: 30, max: 600, step: 30 },
  ],
};

export function createReplicateProvider(): ApiProvider {
  return {
    meta: REPLICATE_META,
    async generateInpaint(request: InpaintRequest): Promise<InpaintResult> {
      const cfg = request.providerConfig;
      const token = cfg.api_token;
      if (!token) throw new Error('请在设置中填写 Replicate API Token');

      const model = cfg.model || 'black-forest-labs/flux-fill-pro';
      const pollInterval = cfg.poll_interval ?? 2000;
      const timeout = (cfg.timeout ?? 300) * 1000;

      const imageDataUrl = `data:image/png;base64,${request.image}`;
      const maskDataUrl = `data:image/png;base64,${request.mask}`;

      // 创建 prediction
      const createResp = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: {
            image: imageDataUrl,
            mask: maskDataUrl,
            prompt: request.prompt,
            ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
          },
        }),
      });
      if (!createResp.ok) {
        const text = await createResp.text();
        throw new Error(`Replicate 创建失败 (${createResp.status}): ${text}`);
      }
      const prediction = await createResp.json();
      const predUrl = prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`;

      // 轮询
      const start = Date.now();
      while (Date.now() - start < timeout) {
        await new Promise((r) => setTimeout(r, pollInterval));
        const pollResp = await fetch(predUrl, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!pollResp.ok) continue;
        const status = await pollResp.json();
        if (status.status === 'succeeded') {
          const output = status.output;
          const outputUrl = Array.isArray(output) ? output[0] : output;
          if (!outputUrl) throw new Error('Replicate 未返回输出图片');
          // 下载图片并转 base64
          const imgResp = await fetch(outputUrl);
          const blob = await imgResp.blob();
          const base64 = await blobToBase64(blob);
          return { image: base64, info: `Replicate model: ${model}` };
        }
        if (status.status === 'failed' || status.status === 'canceled') {
          throw new Error(`Replicate 生成失败: ${status.error || status.status}`);
        }
      }
      throw new Error(`Replicate 超时 (${cfg.timeout}s)`);
    },
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.replace(/^data:.*?;base64,/, ''));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
