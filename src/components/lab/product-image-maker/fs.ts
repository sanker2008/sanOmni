import {
  mkdir,
  readDir,
  writeTextFile,
  readTextFile,
  writeFile,
  remove,
  rename,
} from '@/services/secureFs';
import { join } from '@tauri-apps/api/path';
import { getLabsRoot, openPath } from "@/lib/pathUtils";

async function getBaseConfig() {
  const labsRoot = await getLabsRoot();
  return {
    root: await join(labsRoot, 'product_image_maker'),
  };
}

export async function ensureToolDirectories() {
  const { root } = await getBaseConfig();
  const dirs = [
    await join(root, 'projects'),
    await join(root, 'templates'),
    await join(root, 'exports'),
  ];
  for (const dir of dirs) {
    try {
      await mkdir(dir, { recursive: true });
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
  const { root } = await getBaseConfig();
  const filePath = await join(root, `${type}s`, `${id}.json`);
  const payload = {
    id,
    name,
    updatedAt: Date.now(),
    canvas: data?.canvas || null,
    layers: data?.layers || [],
  };
  await writeTextFile(filePath, JSON.stringify(payload, null, 2));
}

export async function loadProject(type: 'project' | 'template', id: string) {
  const { root } = await getBaseConfig();
  const filePath = await join(root, `${type}s`, `${id}.json`);
  const content = await readTextFile(filePath);
  return JSON.parse(content);
}

export async function listProjects(type: 'project' | 'template') {
  const { root } = await getBaseConfig();
  const dirPath = await join(root, `${type}s`);
  try {
    const entries = await readDir(dirPath);
    const projects = [];

    for (const entry of entries) {
      if (entry.isFile && entry.name?.endsWith('.json')) {
        try {
          const filePath = await join(dirPath, entry.name);
          const content = await readTextFile(filePath);
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
  const { root } = await getBaseConfig();
  const filePath = await join(root, type === 'project' ? 'projects' : 'templates', `${id}.json`);
  await remove(filePath);
}

export async function renameFile(type: 'project' | 'template', id: string, newName: string) {
  const { root } = await getBaseConfig();
  const filePath = await join(root, `${type}s`, `${id}.json`);
  const content = await readTextFile(filePath);
  const parsed = JSON.parse(content);
  parsed.name = newName;
  parsed.updatedAt = Date.now();
  await writeTextFile(filePath, JSON.stringify(parsed, null, 2));
}

export async function saveExport(filename: string, data: Uint8Array) {
  await ensureToolDirectories();
  const { root } = await getBaseConfig();
  const filePath = await join(root, 'exports', filename);
  await writeFile(filePath, data);
}

export async function listExports() {
  const { root } = await getBaseConfig();
  const dirPath = await join(root, 'exports');
  try {
    const entries = await readDir(dirPath);
    const exports = [];
    for (const e of entries) {
      if (e.isFile) {
        let absPath = await join(root, 'exports', e.name);
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
  const { root } = await getBaseConfig();
  const oldPath = await join(root, 'exports', oldName);
  const newPath = await join(root, 'exports', newName);
  await rename(oldPath, newPath);
}

export async function deleteExport(name: string) {
  const { root } = await getBaseConfig();
  const filePath = await join(root, 'exports', name);
  await remove(filePath);
}

export async function openExportFolder() {
  await ensureToolDirectories();
  const { root } = await getBaseConfig();
  const dirPath = await join(root, 'exports');
  console.log('Opening export folder:', dirPath);
  await openPath(dirPath);
}
