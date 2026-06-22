import {
  mkdir,
  readDir,
  writeTextFile,
  readTextFile,
  writeFile,
  remove,
} from '@/services/secureFs';
import { join } from '@tauri-apps/api/path';
import { getLabsRoot, openPath } from "@/lib/pathUtils";

async function getBaseConfig() {
  const labsRoot = await getLabsRoot();
  return {
    root: await join(labsRoot, 'pose_studio'),
  };
}

export async function ensureToolDirectories() {
  const { root } = await getBaseConfig();
  const dirs = [
    await join(root, 'projects'),
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
  id: string,
  name: string,
  data: any
) {
  await ensureToolDirectories();
  const { root } = await getBaseConfig();
  const filePath = await join(root, `projects`, `${id}.json`);
  const payload = {
    id,
    name,
    updatedAt: Date.now(),
    objects: data?.objects || [],
    lights: data?.lights || {},
    camera: data?.camera || {},
  };
  await writeTextFile(filePath, JSON.stringify(payload, null, 2));
}

export async function loadProject(id: string) {
  const { root } = await getBaseConfig();
  const filePath = await join(root, `projects`, `${id}.json`);
  const content = await readTextFile(filePath);
  return JSON.parse(content);
}

export async function listProjects() {
  const { root } = await getBaseConfig();
  const dirPath = await join(root, `projects`);
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
          });
        } catch (e) {
          console.error(`Failed to read/parse ${entry.name}`, e);
        }
      }
    }

    return projects.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (e) {
    console.error(`Failed to list projects`, e);
    return [];
  }
}

export async function deleteProject(id: string) {
  const { root } = await getBaseConfig();
  const filePath = await join(root, 'projects', `${id}.json`);
  await remove(filePath);
}

export async function saveExport(filename: string, data: Uint8Array) {
  await ensureToolDirectories();
  const { root } = await getBaseConfig();
  const filePath = await join(root, 'exports', filename);
  await writeFile(filePath, data);
}

export async function openExportFolder() {
  await ensureToolDirectories();
  const { root } = await getBaseConfig();
  const dirPath = await join(root, 'exports');
  await openPath(dirPath);
}
