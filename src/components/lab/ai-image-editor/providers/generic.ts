/**
 * generic.ts — 自定义 HTTP 适配器（用户自行配置 URL / Header / Body 模板）
 */
import type { ApiProvider, InpaintRequest, InpaintResult, ProviderMeta } from '../types';

const DEFAULT_BODY_TEMPLATE = `{
  "image": "{{image}}",
  "mask": "{{mask}}",
  "prompt": "{{prompt}}",
  "negative_prompt": "{{negative_prompt}}"
}`;

export const GENERIC_META: ProviderMeta = {
  id: 'generic',
  name: '自定义 HTTP',
  description: '自定义 HTTP 接口，支持占位符模板',
  fields: [
    { key: 'url', label: '请求 URL', type: 'text', placeholder: 'https://api.example.com/inpaint' },
    { key: 'method', label: '请求方法', type: 'select', defaultValue: 'POST', options: [
      { label: 'POST', value: 'POST' },
      { label: 'PUT', value: 'PUT' },
    ]},
    { key: 'headers', label: '请求头 (JSON)', type: 'textarea', placeholder: '{"Authorization": "Bearer xxx"}', defaultValue: '{"Content-Type": "application/json"}', description: 'JSON 格式的请求头' },
    { key: 'body_template', label: 'Body 模板', type: 'textarea', placeholder: DEFAULT_BODY_TEMPLATE, defaultValue: DEFAULT_BODY_TEMPLATE, description: '支持占位符: {{image}} {{mask}} {{prompt}} {{negative_prompt}}' },
    { key: 'result_path', label: '结果图片字段路径', type: 'text', placeholder: 'data.image', defaultValue: 'image', description: '响应 JSON 中图片 base64 的字段路径，用 . 分隔' },
  ],
};

export function createGenericProvider(): ApiProvider {
  return {
    meta: GENERIC_META,
    async generateInpaint(request: InpaintRequest): Promise<InpaintResult> {
      const cfg = request.providerConfig;
      const url = cfg.url;
      if (!url) throw new Error('请在设置中填写请求 URL');

      // 解析 headers
      let headers: Record<string, string> = {};
      try {
        headers = cfg.headers ? JSON.parse(cfg.headers) : {};
      } catch {
        throw new Error('请求头 JSON 格式错误');
      }

      // 替换 body 模板占位符
      let body = (cfg.body_template || DEFAULT_BODY_TEMPLATE)
        .replace(/\{\{image\}\}/g, request.image)
        .replace(/\{\{mask\}\}/g, request.mask)
        .replace(/\{\{prompt\}\}/g, request.prompt.replace(/"/g, '\\"'))
        .replace(/\{\{negative_prompt\}\}/g, (request.negativePrompt || '').replace(/"/g, '\\"'));

      const resp = await fetch(url, {
        method: cfg.method || 'POST',
        headers,
        body,
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`自定义 API 请求失败 (${resp.status}): ${text}`);
      }
      const data = await resp.json();

      // 用点分隔路径提取结果
      const resultPath = (cfg.result_path || 'image').split('.');
      let result: any = data;
      for (const key of resultPath) {
        result = result?.[key];
      }
      if (typeof result !== 'string') {
        throw new Error(`无法在响应中找到图片数据 (路径: ${cfg.result_path})`);
      }
      return { image: result, info: `Custom API: ${url}` };
    },
  };
}
