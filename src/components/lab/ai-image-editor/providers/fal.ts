/**
 * fal.ts — Fal.ai 适配器（快速 Flux 推理）
 */
import type { ApiProvider, InpaintRequest, InpaintResult, ProviderMeta } from '../types';

export const FAL_META: ProviderMeta = {
  id: 'fal',
  name: 'Fal.ai',
  description: '快速 Flux 推理服务，支持 LoRA',
  fields: [
    { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'fal-...' },
    { key: 'model', label: '模型', type: 'select', defaultValue: 'fal-ai/flux/dev/inpainting', options: [
      { label: 'Flux Dev Inpainting', value: 'fal-ai/flux/dev/inpainting' },
      { label: 'Flux Pro Inpainting', value: 'fal-ai/flux-pro/v1/inpainting' },
    ]},
    { key: 'num_steps', label: '步数', type: 'number', defaultValue: 28, min: 1, max: 50, step: 1 },
    { key: 'guidance_scale', label: 'Guidance Scale', type: 'number', defaultValue: 3.5, min: 1, max: 20, step: 0.5 },
    { key: 'strength', label: '强度', type: 'number', defaultValue: 0.85, min: 0, max: 1, step: 0.05 },
  ],
};

export function createFalProvider(): ApiProvider {
  return {
    meta: FAL_META,
    async generateInpaint(request: InpaintRequest): Promise<InpaintResult> {
      const cfg = request.providerConfig;
      const apiKey = cfg.api_key;
      if (!apiKey) throw new Error('请在设置中填写 Fal.ai API Key');

      const model = cfg.model || 'fal-ai/flux/dev/inpainting';
      const imageDataUrl = `data:image/png;base64,${request.image}`;
      const maskDataUrl = `data:image/png;base64,${request.mask}`;

      const resp = await fetch(`https://fal.run/${model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_url: imageDataUrl,
          mask_url: maskDataUrl,
          prompt: request.prompt,
          num_inference_steps: cfg.num_steps ?? 28,
          guidance_scale: cfg.guidance_scale ?? 3.5,
          strength: cfg.strength ?? 0.85,
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Fal.ai 请求失败 (${resp.status}): ${text}`);
      }
      const data = await resp.json();
      const images = data.images;
      if (!images || images.length === 0) throw new Error('Fal.ai 未返回图片');

      const imgUrl = images[0].url;
      const imgResp = await fetch(imgUrl);
      const blob = await imgResp.blob();
      const base64 = await blobToBase64(blob);

      return {
        image: base64,
        seed: data.seed,
        info: `Fal.ai model: ${model}`,
      };
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
