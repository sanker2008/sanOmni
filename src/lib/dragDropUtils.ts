/**
 * dragDropUtils.ts — Utility functions for handling cross-platform drag-and-drop file inputs on macOS & Windows.
 */

export const DEFAULT_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'];
export const DEFAULT_VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v'];

export interface DroppedFile {
  file: File;
  name: string;
  extension: string;
  path?: string;
}

/**
 * Extract files from a DragEvent, filtering by allowed extensions.
 */
export function extractDroppedFiles(
  event: React.DragEvent | DragEvent,
  allowedExtensions: string[] = DEFAULT_IMAGE_EXTENSIONS
): DroppedFile[] {
  event.preventDefault();
  event.stopPropagation();

  const fileList = event.dataTransfer?.files;
  if (!fileList || fileList.length === 0) return [];

  const results: DroppedFile[] = [];
  const normalizedExtensions = allowedExtensions.map((e) => e.toLowerCase());

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList.item(i);
    if (!file) continue;

    const path = (file as any).path && typeof (file as any).path === 'string' ? (file as any).path : undefined;
    const name = file.name || (path ? path.split(/[/\\]/).pop() || 'file' : 'file');
    const ext = name.split('.').pop()?.toLowerCase() || '';

    // Check extension or file type
    const extMatched = normalizedExtensions.length === 0 || normalizedExtensions.includes(ext);
    const typeMatched = normalizedExtensions.some((ext) => {
      if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext) && file.type.startsWith('image/')) return true;
      if (['mp4', 'webm', 'mov', 'm4v'].includes(ext) && file.type.startsWith('video/')) return true;
      return false;
    });

    if (extMatched || typeMatched) {
      results.push({
        file,
        name,
        extension: ext,
        path,
      });
    }
  }

  return results;
}

/**
 * Prevent default dragover behavior so browser doesn't navigate away.
 */
export function preventDragDefaults(event: React.DragEvent | DragEvent) {
  event.preventDefault();
  event.stopPropagation();
}

import { authorizeFsPaths, readFile } from '@/services/secureFs';

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  svg: 'image/svg+xml',
};

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert a File object to Data URL, supporting local and WSL/UNC paths safely.
 */
export async function fileToDataUrl(file: File, path?: string): Promise<string> {
  const filePath = path || (file as any).path;

  if (filePath && (filePath.startsWith('\\\\') || filePath.startsWith('//'))) {
    try {
      await authorizeFsPaths([filePath]);
      const bytes = await readFile(filePath);
      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const mime = file.type || MIME_MAP[ext] || 'image/png';
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mime });
      return await blobToDataUrl(blob);
    } catch (e) {
      console.warn(`[fileToDataUrl] secureFs read failed for UNC/WSL path ${filePath}:`, e);
    }
  }

  try {
    return await blobToDataUrl(file);
  } catch (err) {
    if (filePath) {
      try {
        await authorizeFsPaths([filePath]);
        const bytes = await readFile(filePath);
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const mime = file.type || MIME_MAP[ext] || 'image/png';
        const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mime });
        return await blobToDataUrl(blob);
      } catch (e) {
        console.error(`[fileToDataUrl] Fallback secureFs read failed for ${filePath}:`, e);
      }
    }
    throw err;
  }
}

/**
 * Convert a File object to Uint8Array.
 */
export async function fileToUint8Array(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}
