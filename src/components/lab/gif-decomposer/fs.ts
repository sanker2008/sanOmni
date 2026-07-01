import { join } from "@tauri-apps/api/path";
import { getLabsRoot, openPath } from "@/lib/pathUtils";
import { mkdir, writeFile, exists } from '@/services/secureFs';

/** 获取 GifDecomposer 根目录 */
export async function getBasePath(): Promise<string> {
  const labsRoot = await getLabsRoot();
  return await join(labsRoot, 'gif_decomposer');
}

/** 获取输出目录 */
export async function getOutputPath(): Promise<string> {
  const base = await getBasePath();
  return await join(base, 'exports');
}

/** 确保目录存在 */
export async function ensureDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true });
  } catch (e: any) {
    if (!String(e).includes('exists') && !String(e).includes('存在')) {
      console.error('Failed to create directory:', path, e);
      throw e;
    }
  }
}

/** 保存图片到指定目录 */
export async function saveFrameImage(dirPath: string, filename: string, data: Uint8Array): Promise<string> {
  const dir = dirPath || await getOutputPath();
  await ensureDirectory(dir);
  
  let finalFilename = filename;
  let fullPath = await join(dir, finalFilename);
  let counter = 1;
  
  const extMatch = filename.match(/(\.[^.]+)$/);
  const ext = extMatch ? extMatch[1] : '';
  const base = extMatch ? filename.slice(0, -ext.length) : filename;

  while (await exists(fullPath)) {
    finalFilename = `${base}_${counter}${ext}`;
    fullPath = await join(dir, finalFilename);
    counter++;
  }
  
  await writeFile(fullPath, data);
  return fullPath;
}

/** 打开输出目录 */
export async function openOutputFolder(dirPath?: string): Promise<void> {
  const dir = dirPath || await getOutputPath();
  await ensureDirectory(dir);
  await openPath(dir);
}
