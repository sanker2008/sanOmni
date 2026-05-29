/**
 * providers/index.ts — 供应商注册表 & 工厂
 */
import type { ApiProvider, ProviderMeta, ProviderField } from '../types';
import { MOCK_META, createMockProvider } from './mock';
import { SD_WEBUI_META, createSdWebuiProvider } from './sd-webui';
import { COMFYUI_META, createComfyuiProvider } from './comfyui';
import { REPLICATE_META, createReplicateProvider } from './replicate';
import { STABILITY_META, createStabilityProvider } from './stability';
import { FAL_META, createFalProvider } from './fal';
import { GENERIC_META, createGenericProvider } from './generic';

/** 所有可用供应商元信息（有序） */
export const ALL_PROVIDER_METAS: ProviderMeta[] = [
  MOCK_META,
  SD_WEBUI_META,
  COMFYUI_META,
  REPLICATE_META,
  STABILITY_META,
  FAL_META,
  GENERIC_META,
];

type ProviderFactory = () => ApiProvider;

const FACTORY_MAP: Record<string, ProviderFactory> = {
  mock: createMockProvider,
  'sd-webui': createSdWebuiProvider,
  comfyui: createComfyuiProvider,
  replicate: createReplicateProvider,
  stability: createStabilityProvider,
  fal: createFalProvider,
  generic: createGenericProvider,
};

/** 根据 id 创建供应商实例 */
export function createProvider(id: string): ApiProvider {
  const factory = FACTORY_MAP[id];
  if (!factory) throw new Error(`未知的供应商: ${id}`);
  return factory();
}

/** 获取供应商的设置字段定义 */
export function getProviderFields(id: string): ProviderField[] {
  const meta = ALL_PROVIDER_METAS.find((m) => m.id === id);
  return meta?.fields ?? [];
}

/** 获取供应商名称 */
export function getProviderName(id: string): string {
  const meta = ALL_PROVIDER_METAS.find((m) => m.id === id);
  return meta?.name ?? id;
}
