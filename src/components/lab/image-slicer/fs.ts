import { mkdir, readDir, readFile, remove, stat, writeFile } from '@tauri-apps/plugin-fs';
import { join } from "@tauri-apps/api/path";
import { getLabsRoot, openPath } from "@/lib/pathUtils";

export interface TempImageEntry {
  name: string;
  path: string;
  modifiedAt: number;
  size: number;
}

/**
 * Get the default export path.
 * If labsCustomRootPath is set in global settings, use it.
 * Otherwise, fallback to AppDataDir/labs/image_slicer/exports.
 */
export async function getDefaultExportPath(): Promise<string> {
  const labsRoot = await getLabsRoot();
  return await join(labsRoot, 'image_slicer', 'exports');
}

export async function getTempImagePath(): Promise<string> {
  const labsRoot = await getLabsRoot();
  return await join(labsRoot, 'image_slicer', 'temp');
}

/**
 * Ensure a directory path exists. Works with both relative AppData and absolute paths.
 */
export async function ensureDirectory(path: string): Promise<void> {
  // If the path is absolute (e.g. custom user selection), we create it with standard options.
  // We can just call mkdir with { recursive: true }.
  try {
    await mkdir(path, { recursive: true });
  } catch (e: any) {
    if (!String(e).includes('exists') && !String(e).includes('存在')) {
      console.error('Failed to create directory:', path, e);
      throw e;
    }
  }
}

/**
 * Save binary file to specified path.
 */
export async function saveFile(dirPath: string, fileName: string, data: Uint8Array): Promise<string> {
  await ensureDirectory(dirPath);
  const fullPath = await join(dirPath, fileName);
  await writeFile(fullPath, data);
  return fullPath;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);

function getImageMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'image/png';
}

export async function listTempImages(): Promise<TempImageEntry[]> {
  const tempDir = await getTempImagePath();
  await ensureDirectory(tempDir);

  const entries = await readDir(tempDir);
  const images = await Promise.all(entries.map(async (entry: any) => {
    const name = entry.name || '';
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (!name || !IMAGE_EXTENSIONS.has(ext)) return null;

    const path = entry.path || await join(tempDir, name);
    const info = await stat(path).catch(() => null);
    return {
      name,
      path,
      modifiedAt: info?.mtime?.getTime() ?? 0,
      size: info?.size ?? 0,
    } satisfies TempImageEntry;
  }));

  return images
    .filter((item): item is TempImageEntry => Boolean(item))
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export async function loadTempImage(entry: TempImageEntry): Promise<string> {
  const data = await readFile(entry.path);
  const blob = new Blob([data], { type: getImageMimeType(entry.name) });
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function clearTempImages(): Promise<number> {
  const images = await listTempImages();
  await Promise.all(images.map(image => remove(image.path).catch((error) => {
    console.warn('Failed to remove temp image:', image.path, error);
  })));
  return images.length;
}

/**
 * Open target export folder in system explorer (Finder/Explorer).
 */
export async function openExportFolder(dirPath: string): Promise<void> {
  await ensureDirectory(dirPath);
  console.log('Opening export directory:', dirPath);
  await openPath(dirPath);
}
