import type { WorkflowAdapter, WorkflowIO } from '../types';
import { readFile, writeFile } from '@/services/secureFs';
import { join, basename } from '@tauri-apps/api/path';

export const imageCompressAdapter: WorkflowAdapter = {
  id: 'image-compress',
  name: 'Image Compress',
  description: 'Compress and resize images',
  icon: 'Minimize2',
  inputType: 'image',
  outputType: 'image',
  configSchema: [
    { key: 'format', label: 'Format', type: 'select', defaultValue: 'jpeg', options: [{label: 'JPEG', value: 'jpeg'}, {label: 'WEBP', value: 'webp'}, {label: 'PNG', value: 'png'}] },
    { key: 'quality', label: 'Quality', type: 'range', defaultValue: 0.8, min: 0.1, max: 1.0, step: 0.1 },
    { key: 'scale', label: 'Scale', type: 'range', defaultValue: 1.0, min: 0.1, max: 1.0, step: 0.1 },
  ],
  async process(input: WorkflowIO, config: Record<string, any>): Promise<WorkflowIO> {
    const outputDir = config.__outputDir as string;
    const outputPaths: string[] = [];
    
    const format = config.format || 'jpeg';
    const quality = config.quality || 0.8;
    const scale = config.scale || 1.0;
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
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
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
