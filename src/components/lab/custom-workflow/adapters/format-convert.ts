import type { WorkflowAdapter, WorkflowIO } from '../types';
import { readFile, writeFile } from '@/services/secureFs';
import { join, basename } from '@tauri-apps/api/path';

export const formatConvertAdapter: WorkflowAdapter = {
  id: 'format-convert',
  name: 'Format Convert',
  description: 'Convert image formats',
  icon: 'RefreshCw',
  inputType: 'image',
  outputType: 'image',
  configSchema: [
    { key: 'format', label: 'Target Format', type: 'select', defaultValue: 'png', options: [{label: 'PNG', value: 'png'}, {label: 'JPEG', value: 'jpeg'}, {label: 'WEBP', value: 'webp'}] },
    { key: 'quality', label: 'Quality', type: 'range', defaultValue: 0.9, min: 0.1, max: 1.0, step: 0.1 },
  ],
  async process(input: WorkflowIO, config: Record<string, any>): Promise<WorkflowIO> {
    const outputDir = config.__outputDir as string;
    const outputPaths: string[] = [];
    const format = config.format || 'png';
    const quality = config.quality || 0.9;
    const mimeType = `image/${format}`;
    
    for (const inputPath of input.paths) {
      const name = await basename(inputPath);
      const extIndex = name.lastIndexOf('.');
      const nameWithoutExt = extIndex !== -1 ? name.substring(0, extIndex) : name;
      const outputPath = await join(outputDir, `${nameWithoutExt}.${format}`);
      
      const data = await readFile(inputPath);
      const blob = new Blob([new Uint8Array(data)]);
      const url = URL.createObjectURL(blob);
      
      const img = new Image();
      img.src = url;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      
      const outputBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mimeType, quality));
      if (outputBlob) {
        const buffer = await outputBlob.arrayBuffer();
        await writeFile(outputPath, new Uint8Array(buffer));
        outputPaths.push(outputPath);
      }
      
      URL.revokeObjectURL(url);
    }
    
    return { paths: outputPaths };
  },
};
