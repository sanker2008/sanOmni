import { mkdir, writeFile } from '@tauri-apps/plugin-fs';
import { join, appDataDir } from '@tauri-apps/api/path';
import { useUIStore } from '@/stores';

/**
 * Get the default export path.
 * If labsCustomRootPath is set in global settings, use it.
 * Otherwise, fallback to AppDataDir/labs/image_slicer/exports.
 */
export async function getDefaultExportPath(): Promise<string> {
  const customRoot = useUIStore.getState().settings.labsCustomRootPath;
  if (customRoot) {
    return await join(customRoot, 'image_slicer', 'exports');
  }
  const appDir = await appDataDir();
  return await join(appDir, 'labs', 'image_slicer', 'exports');
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

import { open as openShell, Command } from '@tauri-apps/plugin-shell';

/**
 * Open target export folder in system explorer (Finder/Explorer).
 */
export async function openExportFolder(dirPath: string): Promise<void> {
  await ensureDirectory(dirPath);
  console.log('Opening export directory:', dirPath);
  
  try {
    // 1. Try standard openShell (works if path is accepted by the sandbox)
    await openShell(dirPath);
  } catch (e) {
    console.warn('openShell failed, trying registered OS command fallback:', e);
    try {
      // 2. Detect OS to invoke the correct allowed native shell command
      const ua = navigator.userAgent.toLowerCase();
      let cmdName = 'open'; // default to Mac
      
      if (ua.includes('win')) {
        cmdName = 'explorer';
      } else if (ua.includes('mac')) {
        cmdName = 'open';
      } else {
        cmdName = 'xdg-open';
      }

      console.log(`Executing Tauri native command: ${cmdName} [${dirPath}]`);
      const cmd = Command.create(cmdName, [dirPath]);
      await cmd.execute();
    } catch (e2) {
      console.error('All folder opening methods failed:', e2);
      throw e2;
    }
  }
}
