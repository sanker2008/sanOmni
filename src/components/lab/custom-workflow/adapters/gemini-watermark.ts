import type { WorkflowAdapter, WorkflowIO } from '../types';
import { geminiWatermarkApi } from '@/services/tauri';
import { join, basename } from '@tauri-apps/api/path';

export const geminiWatermarkAdapter: WorkflowAdapter = {
  id: 'gemini-watermark-auto',
  name: 'Gemini 水印修复',
  description: '自动检测并移除 Gemini 生成图片的可见水印',
  icon: 'Sparkles',
  inputType: 'image',
  outputType: 'image',
  configSchema: [],
  async process(input: WorkflowIO, config: Record<string, any>): Promise<WorkflowIO> {
    const outputDir = config.__outputDir as string;
    const outputPaths: string[] = [];
    
    for (const inputPath of input.paths) {
      const name = await basename(inputPath);
      const outputPath = await join(outputDir, name);
      await geminiWatermarkApi.autoRemove(inputPath, outputPath);
      outputPaths.push(outputPath);
    }
    
    return { paths: outputPaths };
  },
};
