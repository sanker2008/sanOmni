import type { WorkflowAdapter, WorkflowIO } from '../types';
import { readFile, writeFile } from '@/services/secureFs';
import { join, basename } from '@tauri-apps/api/path';
// @ts-ignore
import ImageTracer from 'imagetracerjs';

export const pngToSvgAdapter: WorkflowAdapter = {
  id: 'png-to-svg',
  name: 'PNG to SVG',
  description: 'Convert raster image to vector SVG',
  icon: 'FileCode2',
  inputType: 'image',
  outputType: 'image',
  configSchema: [
    { key: 'preset', label: 'Preset', type: 'select', defaultValue: 'default', options: [{label: 'Default', value: 'default'}, {label: 'Posterized', value: 'posterized2'}] }
  ],
  async process(input: WorkflowIO, config: Record<string, any>): Promise<WorkflowIO> {
    const outputDir = config.__outputDir as string;
    const outputPaths: string[] = [];
    const preset = config.preset || 'default';
    
    for (const inputPath of input.paths) {
      const name = await basename(inputPath);
      const extIndex = name.lastIndexOf('.');
      const nameWithoutExt = extIndex !== -1 ? name.substring(0, extIndex) : name;
      const outputPath = await join(outputDir, `${nameWithoutExt}.svg`);
      
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
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      const svgString = ImageTracer.imagedataToSVG(imageData, preset);
      
      const encoder = new TextEncoder();
      const svgBytes = encoder.encode(svgString);
      await writeFile(outputPath, svgBytes);
      outputPaths.push(outputPath);
      
      URL.revokeObjectURL(url);
    }
    
    return { paths: outputPaths };
  },
};
