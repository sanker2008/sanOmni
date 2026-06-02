/**
 * google.ts — Google (Vertex AI Imagen) 适配器
 */
import type { ApiProvider, InpaintRequest, InpaintResult, ProviderMeta } from '../types';

export const GOOGLE_META: ProviderMeta = {
  id: 'google',
  name: 'Google (Vertex AI)',
  description: 'Google Vertex AI Imagen 接口 (需 GCP 鉴权)',
  fields: [
    { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'ya29....' },
    { key: 'project_id', label: 'Project ID', type: 'text', placeholder: 'your-gcp-project-id' },
    { key: 'location', label: 'Location', type: 'text', defaultValue: 'us-central1' },
    { key: 'model', label: '模型', type: 'text', defaultValue: 'imagegeneration@006' },
    { key: 'sampleCount', label: '生成数量', type: 'number', defaultValue: 1, min: 1, max: 4, step: 1 },
  ],
};

export function createGoogleProvider(): ApiProvider {
  return {
    meta: GOOGLE_META,
    async generateInpaint(request: InpaintRequest): Promise<InpaintResult> {
      const cfg = request.providerConfig;
      const accessToken = cfg.access_token;
      const projectId = cfg.project_id;
      const location = cfg.location || 'us-central1';
      const model = cfg.model || 'imagegeneration@006';

      if (!accessToken || !projectId) {
        throw new Error('请在设置中填写 GCP Access Token 和 Project ID');
      }

      const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

      const payload = {
        instances: [
          {
            prompt: request.prompt,
            image: { bytesBase64Encoded: request.image },
            mask: { image: { bytesBase64Encoded: request.mask } }
          }
        ],
        parameters: {
          sampleCount: cfg.sampleCount ?? 1,
          editMode: "inpainting-insert"
        }
      };

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Google 请求失败 (${resp.status}): ${text}`);
      }

      const data = await resp.json();
      if (!data.predictions || data.predictions.length === 0) {
        throw new Error('Google Vertex AI 未返回图片数据');
      }

      const b64 = data.predictions[0].bytesBase64Encoded;

      return {
        image: b64,
        info: `Google model: ${model}`,
      };
    },
  };
}
