import type { WorkflowAdapter, WorkflowIO } from '../types';
import { executeBgRemoval } from '@/services/bgRemovalService';
import { copyFile } from '@/services/secureFs';
import { join, basename } from '@tauri-apps/api/path';

export const backgroundRemovalAdapter: WorkflowAdapter = {
  id: 'background-removal',
  name: 'Background Removal',
  description: 'Remove background from images',
  icon: 'ImageMinus',
  inputType: 'image',
  outputType: 'image',
  configSchema: [
    { key: 'strategy', label: 'Strategy', type: 'select', defaultValue: 'A', options: [{label: 'Fast', value: 'A'}, {label: 'High Quality', value: 'B'}] },
  ],
  async process(input: WorkflowIO, config: Record<string, any>): Promise<WorkflowIO> {
    const outputDir = config.__outputDir as string;
    const outputPaths: string[] = [];
    const strategy = config.strategy || 'A';
    
    for (const inputPath of input.paths) {
      const name = await basename(inputPath);
      const extIndex = name.lastIndexOf('.');
      const nameWithoutExt = extIndex !== -1 ? name.substring(0, extIndex) : name;
      const outputPath = await join(outputDir, `${nameWithoutExt}_nobg.png`);
      
      const tempOutput = await executeBgRemoval({ inputPath, strategy: strategy as 'A' | 'B' });
      await copyFile(tempOutput, outputPath);
      outputPaths.push(outputPath);
    }
    
    return { paths: outputPaths };
  },
};
