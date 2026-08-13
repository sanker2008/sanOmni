import type { WorkflowAdapter, WorkflowIO } from '../types';
import { readFile, writeFile } from '@/services/secureFs';
import { join, basename } from '@tauri-apps/api/path';
import { parseGIF, decompressFrames } from 'gifuct-js';

export const gifDecomposeAdapter: WorkflowAdapter = {
  id: 'gif-decompose',
  name: 'GIF Decompose',
  description: 'Extract frames from a GIF',
  icon: 'Layers',
  inputType: 'image',
  outputType: 'images',
  configSchema: [
    { key: 'interval', label: 'Frame Interval', type: 'number', defaultValue: 1, min: 1, max: 60, step: 1 },
  ],
  async process(input: WorkflowIO, config: Record<string, any>): Promise<WorkflowIO> {
    const outputDir = config.__outputDir as string;
    const outputPaths: string[] = [];
    const interval = config.interval || 1;
    
    for (const inputPath of input.paths) {
      if (!inputPath.toLowerCase().endsWith('.gif')) {
        continue;
      }
      
      const name = await basename(inputPath);
      const nameWithoutExt = name.substring(0, name.lastIndexOf('.'));
      
      const data = await readFile(inputPath);
      const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      const parsedGif = parseGIF(arrayBuffer);
      const frames = decompressFrames(parsedGif, true);
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      if (frames.length > 0) {
        canvas.width = frames[0].dims.width;
        canvas.height = frames[0].dims.height;
      }
      
      let tempCanvas = document.createElement('canvas');
      let tempCtx = tempCanvas.getContext('2d')!;
      
      let frameIndex = 0;
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        
        if (i === 0) {
          tempCanvas.width = frame.dims.width;
          tempCanvas.height = frame.dims.height;
        }
        
        const imageData = new ImageData(
          new Uint8ClampedArray(frame.patch),
          frame.dims.width,
          frame.dims.height
        );
        
        tempCtx.putImageData(imageData, frame.dims.left, frame.dims.top);
        ctx.drawImage(tempCanvas, 0, 0);
        
        if (i % interval === 0) {
          const outputPath = await join(outputDir, `${nameWithoutExt}_frame${frameIndex.toString().padStart(4, '0')}.png`);
          const outputBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
          
          if (outputBlob) {
            const buffer = await outputBlob.arrayBuffer();
            await writeFile(outputPath, new Uint8Array(buffer));
            outputPaths.push(outputPath);
          }
          frameIndex++;
        }
      }
    }
    
    return { paths: outputPaths };
  },
};
