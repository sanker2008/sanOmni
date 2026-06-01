/**
 * fs.ts — 文件系统工具 & 项目持久化
 */
import { mkdir, writeFile, readFile, readDir, remove } from '@tauri-apps/plugin-fs';
import { join } from "@tauri-apps/api/path";
import { getAppRoot } from "@/lib/pathUtils";
import { useUIStore } from '@/stores';
import type { ProjectData, ProjectMeta } from './types';

// ─── 路径工具 ──────────────────────────────────────────────

/** 获取 AI Image Editor 根目录 */
export async function getBasePath(): Promise<string> {
  const customRoot = useUIStore.getState().settings.labsCustomRootPath;
  if (customRoot) return await join(customRoot, 'ai_image_editor');
  const appDir = await getAppRoot();
  return await join(appDir, 'labs', 'ai_image_editor');
}

/** 获取输出目录 */
export async function getOutputPath(): Promise<string> {
  const base = await getBasePath();
  return await join(base, 'outputs');
}

/** 获取输入图片目录（用于缓存拖拽导入的图片） */
export async function getInputsPath(): Promise<string> {
  const base = await getBasePath();
  return await join(base, 'inputs');
}

/** 获取项目存储目录 */
export async function getProjectsPath(): Promise<string> {
  const base = await getBasePath();
  return await join(base, 'projects');
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

// ─── 图片保存 ──────────────────────────────────────────────

/** 保存生成的图片到 outputs 目录 */
export async function saveGeneratedImage(base64Data: string, filename: string): Promise<string> {
  const outputDir = await getOutputPath();
  await ensureDirectory(outputDir);
  const fullPath = await join(outputDir, filename);
  const binary = base64ToBinary(base64Data);
  await writeFile(fullPath, binary);
  return fullPath;
}

/** 保存导入的图片到 inputs 目录（主要用于拖拽导入时生成物理路径） */
export async function saveInputImage(base64Data: string, filename: string): Promise<string> {
  const inputDir = await getInputsPath();
  await ensureDirectory(inputDir);
  const uniqueFilename = `${Date.now()}_${filename}`;
  const fullPath = await join(inputDir, uniqueFilename);
  const binary = base64ToBinary(base64Data);
  await writeFile(fullPath, binary);
  return fullPath;
}

// ─── 项目持久化（核心） ────────────────────────────────────

/** 保存完整项目 */
export async function saveProject(project: ProjectData): Promise<void> {
  const projDir = await getProjectDir(project.id);
  await ensureDirectory(projDir);
  const imagesDir = await join(projDir, 'images');
  const masksDir = await join(projDir, 'masks');
  await ensureDirectory(imagesDir);
  await ensureDirectory(masksDir);

  // 将节点中的 base64 图片提取为文件，project.json 中只保留文件引用
  const serializedNodes = [];
  for (const node of project.nodes) {
    const nodeCopy = { ...node };

    // 保存主图片
    if (nodeCopy.imageData) {
      const imgFilename = `${node.id}.png`;
      const imgPath = await join(imagesDir, imgFilename);
      const binary = base64ToBinary(stripDataUrlPrefix(nodeCopy.imageData));
      await writeFile(imgPath, binary);
      nodeCopy.imageData = `images/${imgFilename}`; // 替换为相对路径
    }

    // 保存缩略图
    if (nodeCopy.thumbnailData) {
      const thumbFilename = `${node.id}_thumb.png`;
      const thumbPath = await join(imagesDir, thumbFilename);
      const binary = base64ToBinary(stripDataUrlPrefix(nodeCopy.thumbnailData));
      await writeFile(thumbPath, binary);
      nodeCopy.thumbnailData = `images/${thumbFilename}`;
    }

    // 保存遮罩
    if (nodeCopy.maskData) {
      const maskFilename = `${node.id}_mask.png`;
      const maskPath = await join(masksDir, maskFilename);
      const binary = base64ToBinary(stripDataUrlPrefix(nodeCopy.maskData));
      await writeFile(maskPath, binary);
      nodeCopy.maskData = `masks/${maskFilename}`;
    }

    serializedNodes.push(nodeCopy);
  }

  const projectJson: ProjectData = {
    ...project,
    nodes: serializedNodes as any,
  };

  const jsonPath = await join(projDir, 'project.json');
  const encoder = new TextEncoder();
  await writeFile(jsonPath, encoder.encode(JSON.stringify(projectJson, null, 2)));
}

/** 加载项目 */
export async function loadProject(projectId: string): Promise<ProjectData> {
  const projDir = await getProjectDir(projectId);
  const jsonPath = await join(projDir, 'project.json');
  const data = await readFile(jsonPath);
  const decoder = new TextDecoder();
  const project: ProjectData = JSON.parse(decoder.decode(data));

  // 还原文件引用为 base64 data-URL
  for (const node of project.nodes) {
    if (node.imageData && !node.imageData.startsWith('data:')) {
      const imgPath = await join(projDir, node.imageData);
      const imgBin = await readFile(imgPath);
      node.imageData = `data:image/png;base64,${binaryToBase64(imgBin)}`;
    }
    if (node.thumbnailData && !node.thumbnailData.startsWith('data:')) {
      const thumbPath = await join(projDir, node.thumbnailData);
      const thumbBin = await readFile(thumbPath);
      node.thumbnailData = `data:image/png;base64,${binaryToBase64(thumbBin)}`;
    }
    if (node.maskData && !node.maskData.startsWith('data:')) {
      const maskPath = await join(projDir, node.maskData);
      const maskBin = await readFile(maskPath);
      node.maskData = `data:image/png;base64,${binaryToBase64(maskBin)}`;
    }
  }

  return project;
}

/** 列出所有项目 */
export async function listProjects(): Promise<ProjectMeta[]> {
  const projsDir = await getProjectsPath();
  await ensureDirectory(projsDir);

  try {
    const entries = await readDir(projsDir);
    const projects: ProjectMeta[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory) continue;
      try {
        const jsonPath = await join(projsDir, entry.name, 'project.json');
        const data = await readFile(jsonPath);
        const decoder = new TextDecoder();
        const p = JSON.parse(decoder.decode(data)) as ProjectData;
        projects.push({
          id: p.id,
          name: p.name,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          nodeCount: p.nodes.length,
        });
      } catch {
        // 跳过损坏的项目
      }
    }
    // 按更新时间倒序
    projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return projects;
  } catch {
    return [];
  }
}

/** 删除项目 */
export async function deleteProject(projectId: string): Promise<void> {
  const projDir = await getProjectDir(projectId);
  await remove(projDir, { recursive: true });
}

/** 重命名项目 */
export async function renameProject(projectId: string, newName: string): Promise<void> {
  const projDir = await getProjectDir(projectId);
  const jsonPath = await join(projDir, 'project.json');
  const data = await readFile(jsonPath);
  const decoder = new TextDecoder();
  const project = JSON.parse(decoder.decode(data));
  project.name = newName;
  project.updatedAt = new Date().toISOString();
  const encoder = new TextEncoder();
  await writeFile(jsonPath, encoder.encode(JSON.stringify(project, null, 2)));
}

/** 打开输出目录 */
export async function openOutputFolder(): Promise<void> {
  const dir = await getOutputPath();
  await ensureDirectory(dir);
  try {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(dir);
  } catch (e) {
    console.warn('openShell failed, trying fallback:', e);
    try {
      const { Command } = await import('@tauri-apps/plugin-shell');
      const cmd = Command.create('open', [dir]);
      await cmd.execute();
    } catch (e2) {
      console.error('All folder opening methods failed:', e2);
      throw e2;
    }
  }
}

// ─── 内部工具 ──────────────────────────────────────────────

async function getProjectDir(projectId: string): Promise<string> {
  const projsDir = await getProjectsPath();
  return await join(projsDir, projectId);
}

function stripDataUrlPrefix(data: string): string {
  return data.replace(/^data:image\/\w+;base64,/, '');
}

function base64ToBinary(base64: string): Uint8Array {
  const cleaned = base64.replace(/^data:image\/\w+;base64,/, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function binaryToBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
  return btoa(binary);
}
