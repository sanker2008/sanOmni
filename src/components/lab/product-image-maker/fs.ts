import {
  mkdir,
  readDir,
  writeTextFile,
  readTextFile,
  writeFile,
  remove,
  rename,
  BaseDirectory,
} from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { useUIStore } from '@/stores';

/**
 * Helper to get the actual tool root directory and Tauri FS baseDir options.
 * If user set a custom absolute path, baseDir is undefined and root is the custom path.
 * If not, baseDir is AppData and root is relative 'labs'.
 */
async function getBaseConfig() {
  const customRoot = useUIStore.getState().settings.labsCustomRootPath;
  if (customRoot) {
    return {
      root: await join(customRoot, 'product_image_maker'),
      options: {} as any, // When baseDir is omitted, path is absolute
    };
  }
  return {
    root: await join('labs', 'product_image_maker'),
    options: { baseDir: BaseDirectory.AppData },
  };
}

export async function ensureToolDirectories() {
  const { root, options } = await getBaseConfig();
  const dirs = [
    await join(root, 'projects'),
    await join(root, 'templates'),
    await join(root, 'exports'),
  ];
  for (const dir of dirs) {
    try {
      await mkdir(dir, { ...options, recursive: true });
    } catch (e: any) {
      if (!String(e).includes('exists') && !String(e).includes('存在')) {
        console.error('Failed to create dir:', dir, e);
        throw e;
      }
    }
  }
}

export async function saveProject(
  type: 'project' | 'template',
  id: string,
  name: string,
  data: any
) {
  await ensureToolDirectories();
  const { root, options } = await getBaseConfig();
  const filePath = await join(root, `${type}s`, `${id}.json`);
  const payload = {
    id,
    name,
    updatedAt: Date.now(),
    canvas: data?.canvas || null,
    layers: data?.layers || [],
  };
  await writeTextFile(filePath, JSON.stringify(payload, null, 2), options);
}

export async function loadProject(type: 'project' | 'template', id: string) {
  const { root, options } = await getBaseConfig();
  const filePath = await join(root, `${type}s`, `${id}.json`);
  const content = await readTextFile(filePath, options);
  return JSON.parse(content);
}

export async function listProjects(type: 'project' | 'template') {
  const { root, options } = await getBaseConfig();
  const dirPath = await join(root, `${type}s`);
  try {
    const entries = await readDir(dirPath, options);
    const projects = [];

    for (const entry of entries) {
      if (entry.isFile && entry.name?.endsWith('.json')) {
        try {
          const filePath = await join(dirPath, entry.name);
          const content = await readTextFile(filePath, options);
          const parsed = JSON.parse(content);
          projects.push({
            id: parsed.id || entry.name.replace(/\.json$/, ''),
            name: parsed.name,
            updatedAt: parsed.updatedAt,
            canvas: parsed.canvas,
            layers: parsed.layers,
          });
        } catch (e) {
          console.error(`Failed to read/parse ${entry.name}`, e);
        }
      }
    }

    return projects.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (e) {
    console.error(`Failed to list ${type}s`, e);
    return [];
  }
}

export async function deleteFile(type: 'project' | 'template', id: string) {
  const { root, options } = await getBaseConfig();
  const filePath = await join(root, type === 'project' ? 'projects' : 'templates', `${id}.json`);
  await remove(filePath, options);
}

export async function renameFile(type: 'project' | 'template', id: string, newName: string) {
  const { root, options } = await getBaseConfig();
  const filePath = await join(root, `${type}s`, `${id}.json`);
  const content = await readTextFile(filePath, options);
  const parsed = JSON.parse(content);
  parsed.name = newName;
  parsed.updatedAt = Date.now();
  await writeTextFile(filePath, JSON.stringify(parsed, null, 2), options);
}

export async function saveExport(filename: string, data: Uint8Array) {
  await ensureToolDirectories();
  const { root, options } = await getBaseConfig();
  const filePath = await join(root, 'exports', filename);
  await writeFile(filePath, data, options);
}

import { getAppRoot } from "@/lib/pathUtils";

export async function listExports() {
  const { root, options } = await getBaseConfig();
  const dirPath = await join(root, 'exports');
  try {
    const entries = await readDir(dirPath, options);
    const exports = [];
    let appData = '';
    if (options.baseDir === BaseDirectory.AppData) {
      appData = await getAppRoot();
    }
    for (const e of entries) {
      if (e.isFile) {
        let absPath = '';
        if (options.baseDir === BaseDirectory.AppData) {
          absPath = await join(appData, root, 'exports', e.name);
        } else {
          absPath = await join(root, 'exports', e.name);
        }
        exports.push({ name: e.name, absolutePath: absPath });
      }
    }
    return exports;
  } catch (e) {
    console.error('Failed to list exports', e);
    return [];
  }
}

export async function renameExport(oldName: string, newName: string) {
  const { root, options } = await getBaseConfig();
  const oldPath = await join(root, 'exports', oldName);
  const newPath = await join(root, 'exports', newName);
  // Rename options require baseDir specific to old and new paths.
  // We can just spread options for both
  const renameOptions = options.baseDir 
    ? { oldPathBaseDir: options.baseDir, newPathBaseDir: options.baseDir }
    : {};
  await rename(oldPath, newPath, renameOptions);
}

export async function deleteExport(name: string) {
  const { root, options } = await getBaseConfig();
  const filePath = await join(root, 'exports', name);
  await remove(filePath, options);
}

import { open, Command } from '@tauri-apps/plugin-shell';

export async function openExportFolder() {
  await ensureToolDirectories();
  const { root, options } = await getBaseConfig();
  let dirPath = '';
  if (options.baseDir === BaseDirectory.AppData) {
    const appData = await getAppRoot();
    dirPath = await join(appData, root, 'exports');
  } else {
    dirPath = await join(root, 'exports');
  }
  console.log('Opening export folder:', dirPath);
  
  try {
    await open(dirPath);
  } catch (e) {
    console.error('Failed to open with open(), trying explorer...', e);
    try {
      const cmd = Command.create('explorer', [dirPath]);
      await cmd.execute();
    } catch (e2) {
      throw e2;
    }
  }
}
