import { join } from "@tauri-apps/api/path";
import { getLabsRoot, openPath } from "@/lib/pathUtils";
import { mkdir, writeFile, exists, authorizeFsPaths } from '@/services/secureFs';

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
    await authorizeFsPaths([path]);
    await mkdir(path, { recursive: true });
  } catch (e: any) {
    if (!String(e).includes('exists') && !String(e).includes('存在')) {
      console.error('Failed to create directory:', path, e);
      throw e;
    }
  }
}

/** 保存 SVG 到 outputs 目录（自动避免重名覆盖） */
export async function saveSvg(svgContent: string, filename: string): Promise<string> {
  const outputDir = await getOutputPath();
  await ensureDirectory(outputDir);
  await authorizeFsPaths([outputDir]);

  const dotIndex = filename.lastIndexOf('.');
  const baseName = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const ext = dotIndex > 0 ? filename.slice(dotIndex) : '.svg';

  let candidateName = filename;
  let fullPath = await join(outputDir, candidateName);
  let suffix = 1;

  try {
    while (await exists(fullPath)) {
      candidateName = `${baseName}_${suffix}${ext}`;
      fullPath = await join(outputDir, candidateName);
      suffix += 1;
    }
  } catch (e) {
    console.warn('Failed to check file existence:', e);
  }

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
