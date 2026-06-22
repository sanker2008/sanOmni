/**
 * useAiImageEditorStore.ts — Zustand 状态管理
 */
import { create } from 'zustand';
import type { EditorNode, EditorEdge, Viewport, ProjectMeta, ProjectData } from './types';
import * as fsUtil from './fs';
import { remove } from '@/services/secureFs';

interface AiImageEditorState {
  // ─── Node graph ──────────────────────────────────────────
  nodes: EditorNode[];
  edges: EditorEdge[];
  selectedNodeId: string | null;
  editingNodeId: string | null;   // 正在进行遮罩编辑的节点
  viewport: Viewport;

  // ─── Project management ──────────────────────────────────
  currentProjectId: string | null;
  currentProjectName: string;
  projectList: ProjectMeta[];
  isDirty: boolean;
  isLoadingProject: boolean;
  pendingDeleteFiles: string[];

  // ─── Node Actions ────────────────────────────────────────
  addSourceNode: (imageData: string, filename: string, width: number, height: number, filePath?: string) => void;
  addGeneratedNode: (
    parentNodeId: string,
    imageData: string,
    width: number,
    height: number,
    prompt: string,
    negativePrompt?: string,
    maskData?: string,
    providerId?: string,
    providerParams?: Record<string, any>,
    seed?: number,
  ) => void;
  removeNode: (nodeId: string, deleteFiles?: boolean) => Promise<void>;
  updateNode: (nodeId: string, updates: Partial<EditorNode>) => void;
  updateNodePosition: (nodeId: string, x: number, y: number) => void;
  setSelectedNode: (nodeId: string | null) => void;
  setEditingNode: (nodeId: string | null) => void;
  setViewport: (viewport: Partial<Viewport>) => void;
  organizeNodes: () => void;
  clearAllNodes: (deleteFiles?: boolean) => void;

  // ─── Project Actions ─────────────────────────────────────
  newProject: () => void;
  saveCurrentProject: () => Promise<void>;
  loadProject: (projectId: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  renameCurrentProject: (newName: string) => void;
  refreshProjectList: () => Promise<void>;
  setProjectInfo: (id: string | null, name: string) => void;
}

let nodeCounter = 0;

function generateNodeId(): string {
  return `node_${Date.now()}_${++nodeCounter}`;
}

function generateEdgeId(): string {
  return `edge_${Date.now()}_${++nodeCounter}`;
}

function generateProjectId(): string {
  return `proj_${Date.now()}`;
}

/** 为新的 source 节点计算位置：放在现有节点右侧 */
function getNextSourcePosition(nodes: EditorNode[]): { x: number; y: number } {
  if (nodes.length === 0) return { x: 100, y: 100 };
  const maxX = Math.max(...nodes.map((n) => n.x));
  return { x: maxX + 320, y: 100 };
}

/** 为新的 generated 节点计算位置：放在父节点下方 */
function getChildPosition(parentNode: EditorNode, existingSiblings: number): { x: number; y: number } {
  return {
    x: parentNode.x + 320,
    y: parentNode.y + existingSiblings * 260,
  };
}

export const useAiImageEditorStore = create<AiImageEditorState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  editingNodeId: null,
  viewport: { x: 0, y: 0, zoom: 1 },

  currentProjectId: null,
  currentProjectName: '未命名项目',
  projectList: [],
  isDirty: false,
  isLoadingProject: false,
  pendingDeleteFiles: [],

  // ─── Node Actions ────────────────────────────────────────

  addSourceNode: (imageData, filename, width, height, filePath) => {
    const pos = getNextSourcePosition(get().nodes);
    const node: EditorNode = {
      id: generateNodeId(),
      type: 'source',
      label: filename || '原图',
      x: pos.x,
      y: pos.y,
      imageData,
      width,
      height,
      filename,
      filePath,
    };
    set((s) => ({ nodes: [...s.nodes, node], isDirty: true }));
  },

  addGeneratedNode: (parentNodeId, imageData, width, height, prompt, negativePrompt, maskData, providerId, providerParams, seed) => {
    const state = get();
    const parent = state.nodes.find((n) => n.id === parentNodeId);
    if (!parent) return;

    // 计算此父节点已有多少子节点
    const siblings = state.edges.filter((e) => e.sourceId === parentNodeId).length;
    const genCount = state.nodes.filter((n) => n.type === 'generated').length;
    const pos = getChildPosition(parent, siblings);

    const node: EditorNode = {
      id: generateNodeId(),
      type: 'generated',
      label: `生成-${genCount + 1}`,
      x: pos.x,
      y: pos.y,
      imageData,
      width,
      height,
      prompt,
      negativePrompt,
      maskData,
      providerId,
      providerParams,
      seed,
      generatedAt: new Date().toISOString(),
    };
    const edge: EditorEdge = {
      id: generateEdgeId(),
      sourceId: parentNodeId,
      targetId: node.id,
    };
    set((s) => ({
      nodes: [...s.nodes, node],
      edges: [...s.edges, edge],
      isDirty: true,
    }));
  },

  removeNode: async (nodeId, deleteFiles) => {
    const state = get();
    const toRemove = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      toRemove.add(id);
      state.edges.filter((e) => e.sourceId === id).forEach((e) => queue.push(e.targetId));
    }

    if (deleteFiles) {
      const filesToDelete = state.nodes
        .filter(n => toRemove.has(n.id) && n.filePath)
        .map(n => n.filePath as string);
      
      if (filesToDelete.length > 0) {
        set((s) => ({ pendingDeleteFiles: [...s.pendingDeleteFiles, ...filesToDelete] }));
      }
    }

    set((s) => ({
      nodes: s.nodes.filter((n) => !toRemove.has(n.id)),
      edges: s.edges.filter((e) => !toRemove.has(e.sourceId) && !toRemove.has(e.targetId)),
      selectedNodeId: toRemove.has(s.selectedNodeId || '') ? null : s.selectedNodeId,
      editingNodeId: toRemove.has(s.editingNodeId || '') ? null : s.editingNodeId,
      isDirty: true,
    }));
  },

  updateNode: (nodeId, updates) => {
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n)),
      isDirty: true,
    }));
  },

  updateNodePosition: (nodeId, x, y) => {
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
      isDirty: true,
    }));
  },

  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),
  setEditingNode: (nodeId) => set({ editingNodeId: nodeId }),
  setViewport: (vp) => set((s) => ({ viewport: { ...s.viewport, ...vp } })),

  organizeNodes: () => {
    set((state) => {
      let currentY = 100;
      const HORIZONTAL_SPACING = 340;
      const VERTICAL_SPACING = 300;
      const updates = new Map<string, { x: number; y: number }>();
      
      const roots = state.nodes.filter(n => n.type === 'source');
      
      function layout(nodeId: string, depth: number): number {
        const children = state.edges.filter(e => e.sourceId === nodeId).map(e => e.targetId);
        const x = 100 + depth * HORIZONTAL_SPACING;
        
        if (children.length === 0) {
          const y = currentY;
          currentY += VERTICAL_SPACING;
          updates.set(nodeId, { x, y });
          return y;
        }
        
        const childYs = children.map(childId => layout(childId, depth + 1));
        const avgY = childYs.reduce((sum, y) => sum + y, 0) / childYs.length;
        updates.set(nodeId, { x, y: avgY });
        return avgY;
      }
      
      roots.forEach(root => layout(root.id, 0));
      
      // Handle any orphaned nodes just in case
      const unvisited = state.nodes.filter(n => !updates.has(n.id));
      unvisited.forEach(n => {
        updates.set(n.id, { x: 100, y: currentY });
        currentY += VERTICAL_SPACING;
      });

      return {
        nodes: state.nodes.map(n => {
          const pos = updates.get(n.id);
          return pos ? { ...n, x: pos.x, y: pos.y } : n;
        }),
        isDirty: true,
      };
    });
  },

  clearAllNodes: (deleteFiles) => {
    const state = get();
    if (deleteFiles) {
      const filesToDelete = state.nodes.map(n => n.filePath).filter(Boolean) as string[];
      if (filesToDelete.length > 0) {
        set((s) => ({ pendingDeleteFiles: [...s.pendingDeleteFiles, ...filesToDelete] }));
      }
    }
    set({ nodes: [], edges: [], selectedNodeId: null, editingNodeId: null, isDirty: true });
  },

  // ─── Project Actions ─────────────────────────────────────

  newProject: () => {
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      editingNodeId: null,
      viewport: { x: 0, y: 0, zoom: 1 },
      currentProjectId: null,
      currentProjectName: '未命名项目',
      isDirty: false,
      pendingDeleteFiles: [],
    });
  },

  saveCurrentProject: async () => {
    const state = get();
    const id = state.currentProjectId || generateProjectId();
    const now = new Date().toISOString();
    const projectData: ProjectData = {
      id,
      name: state.currentProjectName,
      createdAt: state.currentProjectId ? '' : now, // 会在 load 时保留
      updatedAt: now,
      viewport: state.viewport,
      nodes: state.nodes,
      edges: state.edges,
    };

    // 如果是已有项目，保留 createdAt
    if (state.currentProjectId) {
      try {
        const existing = await fsUtil.loadProject(state.currentProjectId);
        projectData.createdAt = existing.createdAt;
      } catch {
        projectData.createdAt = now;
      }
    }

    await fsUtil.saveProject(projectData);
    
    // 执行延迟删除
    if (state.pendingDeleteFiles.length > 0) {
      for (const filePath of state.pendingDeleteFiles) {
        try {
          await remove(filePath);
          console.log('[AI Editor] Executed pending file deletion:', filePath);
        } catch (e) {
          console.error('[AI Editor] Failed to delete pending file:', filePath, e);
        }
      }
    }

    set({ currentProjectId: id, isDirty: false, pendingDeleteFiles: [] });
    // 刷新列表
    get().refreshProjectList();
  },

  loadProject: async (projectId) => {
    set({ isLoadingProject: true });
    try {
      const data = await fsUtil.loadProject(projectId);
      set({
        nodes: data.nodes,
        edges: data.edges,
        viewport: data.viewport,
        currentProjectId: data.id,
        currentProjectName: data.name,
        selectedNodeId: null,
        editingNodeId: null,
        isDirty: false,
        isLoadingProject: false,
        pendingDeleteFiles: [],
      });
    } catch (e) {
      set({ isLoadingProject: false });
      throw e;
    }
  },

  deleteProject: async (projectId) => {
    await fsUtil.deleteProject(projectId);
    const state = get();
    if (state.currentProjectId === projectId) {
      get().newProject();
    }
    get().refreshProjectList();
  },

  renameCurrentProject: (newName) => {
    set({ currentProjectName: newName, isDirty: true });
  },

  refreshProjectList: async () => {
    try {
      const list = await fsUtil.listProjects();
      set({ projectList: list });
    } catch (e) {
      console.error('Failed to refresh project list:', e);
    }
  },

  setProjectInfo: (id, name) => set({ currentProjectId: id, currentProjectName: name }),
}));
