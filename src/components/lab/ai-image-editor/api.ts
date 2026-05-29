/**
 * api.ts — 统一 API 调度层
 *
 * 读取全局设置中的供应商配置，创建对应适配器并调用。
 */
import type { InpaintRequest, InpaintResult } from './types';
import { createProvider } from './providers';
import { useUIStore } from '@/stores';

/**
 * 根据全局设置中的供应商，执行 inpaint 生成。
 * 外部只需调用此函数，无需关心具体供应商实现。
 */
export async function generateInpaint(
  image: string,
  mask: string,
  prompt: string,
  negativePrompt?: string,
  overrideConfig?: Record<string, any>,
): Promise<InpaintResult> {
  const settings = useUIStore.getState().settings;
  const providerId: string = settings.aiImageEditorProvider || 'mock';
  const providerConfig: Record<string, any> = {
    ...(settings.aiImageEditorProviderConfig || {}),
    ...overrideConfig,
  };

  const provider = createProvider(providerId);

  const request: InpaintRequest = {
    image: stripDataUrlPrefix(image),
    mask: stripDataUrlPrefix(mask),
    prompt,
    negativePrompt,
    providerConfig,
  };

  return provider.generateInpaint(request);
}

/** 去除 data:image/xxx;base64, 前缀（如果有） */
function stripDataUrlPrefix(data: string): string {
  return data.replace(/^data:image\/\w+;base64,/, '');
}
