import { mkdir, writeFile } from '@tauri-apps/plugin-fs';
import { join, appDataDir } from '@tauri-apps/api/path';
import { useUIStore } from '@/stores';
import { open as openShell, Command } from '@tauri-apps/plugin-shell';

/**
 * Get the default export path.
 */
export async function getDefaultExportPath(): Promise<string> {
  const customRoot = useUIStore.getState().settings.labsCustomRootPath;
  if (customRoot) {
    return await join(customRoot, 'image_compressor', 'exports');
  }
  const appDir = await appDataDir();
  return await join(appDir, 'labs', 'image_compressor', 'exports');
}

/**
 * Ensure a directory path exists. Works with both relative AppData and absolute paths.
 */
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

/**
 * Save binary file to specified path.
 */
export async function saveFile(dirPath: string, fileName: string, data: Uint8Array): Promise<string> {
  await ensureDirectory(dirPath);
  const fullPath = await join(dirPath, fileName);
  await writeFile(fullPath, data);
  return fullPath;
}

/**
 * Open target export folder in system explorer.
 */
export async function openExportFolder(dirPath: string): Promise<void> {
  await ensureDirectory(dirPath);
  console.log('Opening export directory:', dirPath);
  
  try {
    await openShell(dirPath);
  } catch (e) {
    console.warn('openShell failed, trying registered OS command fallback:', e);
    try {
      const ua = navigator.userAgent.toLowerCase();
      let cmdName = 'open';
      
      if (ua.includes('win')) {
        cmdName = 'explorer';
      } else if (ua.includes('mac')) {
        cmdName = 'open';
      } else {
        cmdName = 'xdg-open';
      }

      const cmd = Command.create(cmdName, [dirPath]);
      await cmd.execute();
    } catch (e2) {
      console.error('All folder opening methods failed:', e2);
      throw e2;
    }
  }
}
