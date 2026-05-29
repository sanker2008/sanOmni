/**
 * stability.ts — Stability AI 官方 REST API 适配器
 */
import type { ApiProvider, InpaintRequest, InpaintResult, ProviderMeta } from '../types';

export const STABILITY_META: ProviderMeta = {
  id: 'stability',
  name: 'Stability AI',
  description: '官方 Stability AI REST API (Stable Image Inpaint)',
  fields: [
    { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'sk-...' },
    { key: 'output_format', label: '输出格式', type: 'select', defaultValue: 'png', options: [
      { label: 'PNG', value: 'png' },
      { label: 'JPEG', value: 'jpeg' },
      { label: 'WebP', value: 'webp' },
    ]},
    { key: 'grow_mask', label: '遮罩扩展 (px)', type: 'number', defaultValue: 5, min: 0, max: 100, step: 1 },
  ],
};

export function createStabilityProvider(): ApiProvider {
  return {
    meta: STABILITY_META,
    async generateInpaint(request: InpaintRequest): Promise<InpaintResult> {
      const cfg = request.providerConfig;
      const apiKey = cfg.api_key;
      if (!apiKey) throw new Error('请在设置中填写 Stability AI API Key');

      // 将 base64 转为 Blob
      const imageBlob = base64ToBlob(request.image, 'image/png');
      const maskBlob = base64ToBlob(request.mask, 'image/png');

      const formData = new FormData();
      formData.append('image', imageBlob, 'image.png');
      formData.append('mask', maskBlob, 'mask.png');
      formData.append('prompt', request.prompt);
      if (request.negativePrompt) formData.append('negative_prompt', request.negativePrompt);
      formData.append('output_format', cfg.output_format || 'png');
      formData.append('grow_mask', String(cfg.grow_mask ?? 5));

      const resp = await fetch('https://api.stability.ai/v2beta/stable-image/edit/inpaint', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
        body: formData,
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Stability AI 请求失败 (${resp.status}): ${text}`);
      }
      const data = await resp.json();
      if (!data.image) throw new Error('Stability AI 未返回图片数据');
      return {
        image: data.image,
        seed: data.seed,
        info: `Stability AI inpaint — seed: ${data.seed ?? 'N/A'}`,
      };
    },
  };
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
