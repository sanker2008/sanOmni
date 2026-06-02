/**
 * openai.ts — OpenAI (DALL-E) 适配器
 */
import type { ApiProvider, InpaintRequest, InpaintResult, ProviderMeta } from '../types';

export const OPENAI_META: ProviderMeta = {
  id: 'openai',
  name: 'OpenAI (DALL-E)',
  description: 'OpenAI 官方图像编辑接口 (需正方形图片, 推荐DALL-E 2)',
  fields: [
    { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'sk-...' },
    { key: 'endpoint', label: 'Endpoint', type: 'text', defaultValue: 'https://api.openai.com/v1' },
    { key: 'model', label: '模型', type: 'select', defaultValue: 'dall-e-2', options: [
      { label: 'DALL-E 2', value: 'dall-e-2' }
    ]},
    { key: 'size', label: '尺寸', type: 'select', defaultValue: '1024x1024', options: [
      { label: '1024x1024', value: '1024x1024' },
      { label: '512x512', value: '512x512' },
      { label: '256x256', value: '256x256' }
    ], description: '注意: OpenAI API 要求原始图像和蒙版必须为严格的正方形' },
  ],
};

function base64ToBlob(base64: string, type: string = 'image/png'): Blob {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type });
}

export function createOpenAIProvider(): ApiProvider {
  return {
    meta: OPENAI_META,
    async generateInpaint(request: InpaintRequest): Promise<InpaintResult> {
      const cfg = request.providerConfig;
      const apiKey = cfg.api_key;
      if (!apiKey) throw new Error('请在设置中填写 OpenAI API Key');

      const endpoint = (cfg.endpoint || 'https://api.openai.com/v1').replace(/\/$/, '');
      const model = cfg.model || 'dall-e-2';
      const size = cfg.size || '1024x1024';

      const formData = new FormData();
      formData.append('image', base64ToBlob(request.image, 'image/png'), 'image.png');
      formData.append('mask', base64ToBlob(request.mask, 'image/png'), 'mask.png');
      formData.append('prompt', request.prompt);
      formData.append('model', model);
      formData.append('n', '1');
      formData.append('size', size);
      formData.append('response_format', 'b64_json');

      const resp = await fetch(`${endpoint}/images/edits`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`OpenAI 请求失败 (${resp.status}): ${text}`);
      }

      const data = await resp.json();
      if (!data.data || data.data.length === 0) throw new Error('OpenAI 未返回图片数据');

      const b64 = data.data[0].b64_json;

      return {
        image: b64,
        info: `OpenAI model: ${model} | size: ${size}`,
      };
    },
  };
}
