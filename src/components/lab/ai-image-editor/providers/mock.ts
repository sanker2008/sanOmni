/**
 * mock.ts — Mock provider: 本地滤镜模拟，无需网络。
 */
import type { ApiProvider, InpaintRequest, InpaintResult, ProviderMeta } from '../types';

export const MOCK_META: ProviderMeta = {
  id: 'mock',
  name: 'Mock 模拟',
  description: '无需 API，使用本地滤镜模拟生成效果（用于测试）',
  fields: [
    { key: 'delay', label: '模拟延时 (ms)', type: 'number', defaultValue: 1500, min: 200, max: 10000, step: 100 },
  ],
};

function applyRandomFilter(imageBase64: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const filters = ['grayscale', 'sepia', 'invert', 'warm', 'cool'];
      const filter = filters[Math.floor(Math.random() * filters.length)];

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        switch (filter) {
          case 'grayscale': {
            const avg = r * 0.299 + g * 0.587 + b * 0.114;
            data[i] = data[i + 1] = data[i + 2] = avg;
            break;
          }
          case 'sepia': {
            data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
            data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
            data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
            break;
          }
          case 'invert': {
            data[i] = 255 - r;
            data[i + 1] = 255 - g;
            data[i + 2] = 255 - b;
            break;
          }
          case 'warm': {
            data[i] = Math.min(255, r + 30);
            data[i + 1] = g;
            data[i + 2] = Math.max(0, b - 20);
            break;
          }
          case 'cool': {
            data[i] = Math.max(0, r - 20);
            data[i + 1] = g;
            data[i + 2] = Math.min(255, b + 30);
            break;
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);
      // Return raw base64 without data-url prefix
      resolve(canvas.toDataURL('image/png').replace(/^data:image\/\w+;base64,/, ''));
    };
    img.src = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
  });
}

export function createMockProvider(): ApiProvider {
  return {
    meta: MOCK_META,
    async generateInpaint(request: InpaintRequest): Promise<InpaintResult> {
      const delay = request.providerConfig.delay ?? 1500;
      await new Promise((r) => setTimeout(r, delay));
      const result = await applyRandomFilter(request.image);
      return {
        image: result,
        seed: Math.floor(Math.random() * 999999999),
        info: `Mock 生成 (滤镜模拟) — prompt: "${request.prompt}"`,
      };
    },
  };
}
