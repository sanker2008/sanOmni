/**
 * comfyui.ts — ComfyUI 适配器（通过 workflow JSON 调用）
 */
import type { ApiProvider, InpaintRequest, InpaintResult, ProviderMeta } from '../types';

const DEFAULT_WORKFLOW = `{
  "prompt": "{{prompt}}",
  "negative_prompt": "{{negative_prompt}}",
  "_note": "请在 ComfyUI 中导出 inpaint 工作流 JSON 并粘贴到此处，用 {{image}} {{mask}} {{prompt}} {{negative_prompt}} 作为占位符"
}`;

export const COMFYUI_META: ProviderMeta = {
  id: 'comfyui',
  name: 'ComfyUI',
  description: '通过 workflow JSON 调用本地或云端 ComfyUI',
  fields: [
    { key: 'url', label: 'API 地址', type: 'text', placeholder: 'http://127.0.0.1:8188', defaultValue: 'http://127.0.0.1:8188' },
    { key: 'workflow', label: '工作流 JSON', type: 'textarea', placeholder: '粘贴 ComfyUI 导出的 API 格式工作流...', defaultValue: DEFAULT_WORKFLOW, description: '支持占位符: {{image}} {{mask}} {{prompt}} {{negative_prompt}}' },
    { key: 'poll_interval', label: '轮询间隔 (ms)', type: 'number', defaultValue: 1000, min: 200, max: 10000, step: 200 },
    { key: 'timeout', label: '超时时间 (s)', type: 'number', defaultValue: 120, min: 10, max: 600, step: 10 },
  ],
};

export function createComfyuiProvider(): ApiProvider {
  return {
    meta: COMFYUI_META,
    async generateInpaint(request: InpaintRequest): Promise<InpaintResult> {
      const cfg = request.providerConfig;
      const url = (cfg.url || 'http://127.0.0.1:8188').replace(/\/+$/, '');
      const pollInterval = cfg.poll_interval ?? 1000;
      const timeout = (cfg.timeout ?? 120) * 1000;

      // 替换 workflow 中的占位符
      let workflow = cfg.workflow || DEFAULT_WORKFLOW;
      workflow = workflow
        .replace(/\{\{image\}\}/g, request.image)
        .replace(/\{\{mask\}\}/g, request.mask)
        .replace(/\{\{prompt\}\}/g, request.prompt)
        .replace(/\{\{negative_prompt\}\}/g, request.negativePrompt || '');

      let workflowObj: any;
      try {
        workflowObj = JSON.parse(workflow);
      } catch {
        throw new Error('ComfyUI 工作流 JSON 解析失败，请检查格式');
      }

      // 提交 prompt
      const resp = await fetch(`${url}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflowObj }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`ComfyUI 提交失败 (${resp.status}): ${text}`);
      }
      const { prompt_id } = await resp.json();
      if (!prompt_id) throw new Error('ComfyUI 未返回 prompt_id');

      // 轮询等待结果
      const start = Date.now();
      while (Date.now() - start < timeout) {
        await new Promise((r) => setTimeout(r, pollInterval));
        const histResp = await fetch(`${url}/history/${prompt_id}`);
        if (!histResp.ok) continue;
        const hist = await histResp.json();
        const entry = hist[prompt_id];
        if (!entry) continue;
        if (entry.status?.completed) {
          // 找到输出图片
          const outputs = entry.outputs || {};
          for (const nodeId of Object.keys(outputs)) {
            const images = outputs[nodeId]?.images;
            if (images && images.length > 0) {
              const imgInfo = images[0];
              const imgResp = await fetch(`${url}/view?filename=${encodeURIComponent(imgInfo.filename)}&subfolder=${encodeURIComponent(imgInfo.subfolder || '')}&type=${imgInfo.type || 'output'}`);
              if (!imgResp.ok) throw new Error('无法获取 ComfyUI 输出图片');
              const blob = await imgResp.blob();
              const base64 = await blobToBase64(blob);
              return { image: base64, info: `ComfyUI prompt_id: ${prompt_id}` };
            }
          }
          throw new Error('ComfyUI 执行完成但未找到输出图片');
        }
      }
      throw new Error(`ComfyUI 执行超时 (${cfg.timeout}s)`);
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
