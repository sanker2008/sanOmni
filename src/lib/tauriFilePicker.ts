/**
 * tauriFilePicker.ts — Cross-platform file picker using Tauri dialog API.
 *
 * In Tauri v2 production builds, the standard HTML `<input type="file">` often
 * does not work because the webview serves content via a custom protocol
 * (`tauri://localhost`), which can prevent the native file picker from
 * triggering. This utility wraps the Tauri dialog `open()` API and reads the
 * selected files through the secure FS layer, converting them to `File`
 * objects so they can drop-in replace `<input type="file">` usage.
 */

import { open } from '@tauri-apps/plugin-dialog';
import { authorizeFsPaths, readFile } from '@/services/secureFs';
import { basename } from '@tauri-apps/api/path';

/** MIME types by file extension */
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

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return MIME_MAP[ext] || 'application/octet-stream';
}

export interface PickerOptions {
  /** Allow selecting multiple files (default: false) */
  multiple?: boolean;
  /** File filter extensions, e.g. ['png', 'jpg', 'webp'] */
  extensions?: string[];
  /** Filter display name shown in native dialog (default: "Images") */
  filterName?: string;
}

export interface PickedFile {
  /** A standard `File` object constructed from the raw bytes */
  file: File;
  /** The original absolute file path on disk */
  path: string;
  /** A data URL representation of the file */
  dataUrl: string;
}

/**
 * Open the native file picker via Tauri dialog API, read selected files,
 * and return them as `PickedFile[]`.
 *
 * Returns an empty array if the user cancels the dialog.
 */
export async function pickFiles(opts: PickerOptions = {}): Promise<PickedFile[]> {
  const {
    multiple = false,
    extensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'],
    filterName = 'Images',
  } = opts;

  const selected = await open({
    multiple,
    filters: [{ name: filterName, extensions }],
  });

  if (!selected) return [];

  const paths = (Array.isArray(selected) ? selected : [selected]) as string[];
  if (paths.length === 0) return [];

  // Authorize FS access for the selected paths
  await authorizeFsPaths(paths);

  const results: PickedFile[] = [];

  for (const filePath of paths) {
    try {
      const fileName = await basename(filePath);
      const bytes = await readFile(filePath);
      const mime = getMimeType(fileName);

      // Build File object
      const file = new File([bytes.buffer as ArrayBuffer], fileName, { type: mime });

      // Build data URL
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const dataUrl = `data:${mime};base64,${btoa(binary)}`;

      results.push({ file, path: filePath, dataUrl });
    } catch (error) {
      console.error(`[tauriFilePicker] Failed to read ${filePath}:`, error);
      // Skip this file, continue with others
    }
  }

  return results;
}

/**
 * Convenience: open picker for a single image file.
 * Returns `null` if the user cancels or the file cannot be read.
 */
export async function pickSingleFile(opts: Omit<PickerOptions, 'multiple'> = {}): Promise<PickedFile | null> {
  const files = await pickFiles({ ...opts, multiple: false });
  return files.length > 0 ? files[0] : null;
}
