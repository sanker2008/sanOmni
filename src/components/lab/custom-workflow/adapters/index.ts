import type { WorkflowAdapter } from '../types';
import { geminiWatermarkAdapter } from './gemini-watermark';
import { imageCompressAdapter } from './image-compress';
import { backgroundRemovalAdapter } from './background-removal';
import { pngToSvgAdapter } from './png-to-svg';
import { imageSliceAdapter } from './image-slice';
import { gifDecomposeAdapter } from './gif-decompose';
import { formatConvertAdapter } from './format-convert';

const WORKFLOW_ADAPTERS = new Map<string, WorkflowAdapter>([
  ['gemini-watermark-auto', geminiWatermarkAdapter],
  ['image-compress', imageCompressAdapter],
  ['background-removal', backgroundRemovalAdapter],
  ['png-to-svg', pngToSvgAdapter],
  ['image-slice', imageSliceAdapter],
  ['gif-decompose', gifDecomposeAdapter],
  ['format-convert', formatConvertAdapter],
]);

export function getAdapter(id: string): WorkflowAdapter | undefined {
  return WORKFLOW_ADAPTERS.get(id);
}

export function getAllAdapters(): WorkflowAdapter[] {
  return Array.from(WORKFLOW_ADAPTERS.values());
}

export function getAdaptersByInputType(type: 'image' | 'images'): WorkflowAdapter[] {
  return getAllAdapters().filter(a => a.inputType === type);
}
