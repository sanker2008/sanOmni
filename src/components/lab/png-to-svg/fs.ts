import { join } from "@tauri-apps/api/path";
import { getLabsRoot, openPath } from "@/lib/pathUtils";
import { mkdir, writeFile } from '@/services/secureFs';

/** 获取 PngToSvg 根目录 */
export async function getBasePath(): Promise<string> {
  const labsRoot = await getLabsRoot();
  return await join(labsRoot, 'png_to_svg');
}

/** 获取输出目录 */
export async function getOutputPath(): Promise<string> {
  const base = await getBasePath();
  return await join(base, 'outputs');
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

/** 保存 SVG 到 outputs 目录 */
export async function saveSvg(svgContent: string, filename: string): Promise<string> {
  const outputDir = await getOutputPath();
  await ensureDirectory(outputDir);
  const fullPath = await join(outputDir, filename);
  const encoder = new TextEncoder();
  await writeFile(fullPath, encoder.encode(svgContent));
  return fullPath;
}

/** 打开输出目录 */
export async function openOutputFolder(): Promise<void> {
  const dir = await getOutputPath();
  await ensureDirectory(dir);
  await openPath(dir);
}
