import type { WorkflowAdapter, WorkflowIO } from '../types';
import { readFile, writeFile } from '@/services/secureFs';
import { join, basename } from '@tauri-apps/api/path';

export const imageSliceAdapter: WorkflowAdapter = {
  id: 'image-slice',
  name: 'Image Slice',
  description: 'Slice image into a grid',
  icon: 'Grid',
  inputType: 'image',
  outputType: 'images',
  configSchema: [
    { key: 'rows', label: 'Rows', type: 'number', defaultValue: 2, min: 1, max: 10, step: 1 },
    { key: 'cols', label: 'Columns', type: 'number', defaultValue: 2, min: 1, max: 10, step: 1 },
  ],
  async process(input: WorkflowIO, config: Record<string, any>): Promise<WorkflowIO> {
    const outputDir = config.__outputDir as string;
    const outputPaths: string[] = [];
    const rows = config.rows || 2;
    const cols = config.cols || 2;
    
    for (const inputPath of input.paths) {
      const name = await basename(inputPath);
      const extIndex = name.lastIndexOf('.');
      const nameWithoutExt = extIndex !== -1 ? name.substring(0, extIndex) : name;
      const ext = extIndex !== -1 ? name.substring(extIndex) : '.png';
      
      const data = await readFile(inputPath);
      const blob = new Blob([new Uint8Array(data)]);
      const url = URL.createObjectURL(blob);
      
      const img = new Image();
      img.src = url;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      
      const sliceWidth = img.width / cols;
      const sliceHeight = img.height / rows;
      
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const canvas = document.createElement('canvas');
          canvas.width = sliceWidth;
          canvas.height = sliceHeight;
          const ctx = canvas.getContext('2d')!;
          
          ctx.drawImage(
            img,
            c * sliceWidth, r * sliceHeight, sliceWidth, sliceHeight,
            0, 0, sliceWidth, sliceHeight
          );
          
          const outputPath = await join(outputDir, `${nameWithoutExt}_r${r}_c${c}${ext}`);
          const outputBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
          
          if (outputBlob) {
            const buffer = await outputBlob.arrayBuffer();
            await writeFile(outputPath, new Uint8Array(buffer));
            outputPaths.push(outputPath);
          }
        }
      }
      
      URL.revokeObjectURL(url);
    }
    
    return { paths: outputPaths };
  },
};
