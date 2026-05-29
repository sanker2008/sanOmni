/**
 * sd-webui.ts — Stable Diffusion WebUI (A1111 / Forge) 适配器
 */
import type { ApiProvider, InpaintRequest, InpaintResult, ProviderMeta } from '../types';

export const SD_WEBUI_META: ProviderMeta = {
  id: 'sd-webui',
  name: 'Stable Diffusion WebUI',
  description: '本地 A1111 / Forge WebUI 的 img2img inpaint 接口',
  fields: [
    { key: 'url', label: 'API 地址', type: 'text', placeholder: 'http://127.0.0.1:7860', defaultValue: 'http://127.0.0.1:7860' },
    { key: 'model', label: '模型 (可选)', type: 'text', placeholder: '留空使用当前加载的模型' },
    { key: 'sampler', label: '采样器', type: 'select', defaultValue: 'Euler a', options: [
      { label: 'Euler a', value: 'Euler a' },
      { label: 'Euler', value: 'Euler' },
      { label: 'DPM++ 2M', value: 'DPM++ 2M' },
      { label: 'DPM++ 2M Karras', value: 'DPM++ 2M Karras' },
      { label: 'DPM++ SDE Karras', value: 'DPM++ SDE Karras' },
      { label: 'DDIM', value: 'DDIM' },
      { label: 'UniPC', value: 'UniPC' },
    ]},
    { key: 'steps', label: '步数 (Steps)', type: 'number', defaultValue: 20, min: 1, max: 150, step: 1 },
    { key: 'cfg_scale', label: 'CFG Scale', type: 'number', defaultValue: 7, min: 1, max: 30, step: 0.5 },
    { key: 'denoising_strength', label: '重绘幅度 (Denoising)', type: 'number', defaultValue: 0.75, min: 0, max: 1, step: 0.05 },
    { key: 'width', label: '输出宽度', type: 'number', defaultValue: 512, min: 64, max: 2048, step: 64 },
    { key: 'height', label: '输出高度', type: 'number', defaultValue: 512, min: 64, max: 2048, step: 64 },
  ],
};

export function createSdWebuiProvider(): ApiProvider {
  return {
    meta: SD_WEBUI_META,
    async generateInpaint(request: InpaintRequest): Promise<InpaintResult> {
      const cfg = request.providerConfig;
      const url = (cfg.url || 'http://127.0.0.1:7860').replace(/\/+$/, '');
      const body: Record<string, any> = {
        init_images: [request.image],
        mask: request.mask,
        prompt: request.prompt,
        negative_prompt: request.negativePrompt || '',
        sampler_name: cfg.sampler || 'Euler a',
        steps: cfg.steps ?? 20,
        cfg_scale: cfg.cfg_scale ?? 7,
        denoising_strength: cfg.denoising_strength ?? 0.75,
        width: cfg.width ?? 512,
        height: cfg.height ?? 512,
        mask_blur: 4,
        inpainting_fill: 1, // original
        inpaint_full_res: false,
      };
      if (cfg.model) {
        body.override_settings = { sd_model_checkpoint: cfg.model };
      }

      const resp = await fetch(`${url}/sdapi/v1/img2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`SD WebUI 请求失败 (${resp.status}): ${text}`);
      }
      const data = await resp.json();
      const images: string[] = data.images || [];
      if (images.length === 0) throw new Error('SD WebUI 未返回图片');

      const info = typeof data.info === 'string' ? JSON.parse(data.info) : data.info;
      return {
        image: images[0],
        seed: info?.seed,
        info: JSON.stringify(info, null, 2),
      };
    },
  };
}
