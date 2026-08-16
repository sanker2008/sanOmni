import { join } from "@tauri-apps/api/path";
import { getLabsRoot, openPath } from "@/lib/pathUtils";
import { mkdir, writeFile, authorizeFsPaths, exists } from '@/services/secureFs';

/**
 * Get the default export path.
 */
export async function getDefaultExportPath(): Promise<string> {
  const labsRoot = await getLabsRoot();
  return await join(labsRoot, 'image_compressor', 'exports');
}

/**
 * Ensure a directory path exists. Works with both relative AppData and absolute paths.
 */
export async function ensureDirectory(path: string): Promise<void> {
  try {
    await authorizeFsPaths([path]);
    await mkdir(path, { recursive: true });
  } catch (e: any) {
    if (!String(e).includes('exists') && !String(e).includes('存在')) {
      console.error('Failed to create directory:', path, e);
      throw e;
    }
  }
}

export async function getAvailableFilePath(dirPath: string, fileName: string): Promise<string> {
  await authorizeFsPaths([dirPath]);
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const ext = dotIndex > 0 ? fileName.slice(dotIndex) : '';

  let candidateName = fileName;
  let candidatePath = await join(dirPath, candidateName);
  let suffix = 1;

  try {
    while (await exists(candidatePath)) {
      candidateName = `${baseName}_${suffix}${ext}`;
      candidatePath = await join(dirPath, candidateName);
      suffix += 1;
    }
  } catch (e) {
    console.warn('Failed to check file existence:', e);
  }

  return candidatePath;
}

/**
 * Save binary file to specified path without overwriting.
 */
export async function saveFile(dirPath: string, fileName: string, data: Uint8Array): Promise<string> {
  await ensureDirectory(dirPath);
  const fullPath = await getAvailableFilePath(dirPath, fileName);
  await writeFile(fullPath, data);
  return fullPath;
}

/**
 * Open target export folder in system explorer.
 */
export async function openExportFolder(dirPath: string): Promise<void> {
  await ensureDirectory(dirPath);
  console.log('Opening export directory:', dirPath);
  await openPath(dirPath);
}
