/**
 * Product Image Maker — State Management
 * 
 * Standalone Zustand store, completely independent from sanMediaBox stores.
 * This store is only used by the product-image-maker components.
 */

import { create } from 'zustand';
import type { CanvasSettings, Layer, TextLayer, ImageLayer, ShapeLayer } from './types';
import { DEFAULT_CANVAS, DEFAULT_TEXT_LAYER, DEFAULT_IMAGE_LAYER } from './types';

// ─── Utility ───────────────────────────────────────────────

let layerCounter = 0;
function generateLayerId(): string {
  return `layer_${Date.now()}_${++layerCounter}`;
}

// ─── Store Interface ───────────────────────────────────────

interface ProductImageStore {
  // State
  currentProjectId: string | null;
  currentProjectName: string | null;
  canvas: CanvasSettings;
  layers: Layer[];
  selectedLayerId: string | null;

  // History
  past: { canvas: CanvasSettings; layers: Layer[] }[];
  future: { canvas: CanvasSettings; layers: Layer[] }[];
  maxHistorySize: number;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  setMaxHistorySize: (size: number) => void;

  // Canvas actions
  updateCanvas: (updates: Partial<CanvasSettings>) => void;

  // Layer actions
  addTextLayer: (overrides?: Partial<TextLayer>) => string;
  addImageLayer: (src: string, filename: string, naturalWidth: number, naturalHeight: number) => string;
  addShapeLayer: (shapeType?: 'rectangle' | 'circle' | 'triangle') => string;
  updateLayer: <T extends Layer>(id: string, updates: Partial<T>) => void;
  /** Same as updateLayer but does NOT push to undo history — use during live drag/resize */
  updateLayerSilent: <T extends Layer>(id: string, updates: Partial<T>) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  moveLayerUp: (id: string) => void;
  moveLayerDown: (id: string) => void;

  // Selection
  setSelectedLayer: (id: string | null) => void;

  // Project actions
  loadProjectState: (id: string | null, name: string | null, canvas: CanvasSettings, layers: Layer[]) => void;
  setCurrentProjectInfo: (id: string | null, name: string | null) => void;

  // Bulk actions
  reset: () => void;
}

// ─── Store Implementation ──────────────────────────────────


export const useProductImageStore = create<ProductImageStore>((set, get) => ({
  currentProjectId: null,
  currentProjectName: null,
  canvas: { ...DEFAULT_CANVAS },
  layers: [],
  selectedLayerId: null,
  past: [],
  future: [],
  maxHistorySize: 50,

  setMaxHistorySize: (size) => set({ maxHistorySize: Math.max(1, Math.round(size)) }),

  pushHistory: () => {
    const { canvas, layers, past, maxHistorySize } = get();
    set({
      past: [{ canvas: { ...canvas }, layers: [...layers] }, ...past].slice(0, maxHistorySize),
      future: [],
    });
  },

  undo: () => {
    const { past, future, canvas, layers } = get();
    if (past.length === 0) return;
    const previous = past[0];
    set({
      past: past.slice(1),
      future: [{ canvas: { ...canvas }, layers: [...layers] }, ...future],
      canvas: previous.canvas,
      layers: previous.layers,
      selectedLayerId: null,
    });
  },

  redo: () => {
    const { past, future, canvas, layers } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      past: [{ canvas: { ...canvas }, layers: [...layers] }, ...past],
      future: future.slice(1),
      canvas: next.canvas,
      layers: next.layers,
      selectedLayerId: null,
    });
  },

  updateCanvas: (updates) => {
    get().pushHistory();
    set((state) => ({ canvas: { ...state.canvas, ...updates } }));
  },

  addTextLayer: (overrides) => {
    get().pushHistory();
    const id = generateLayerId();
    const canvasState = get().canvas;
    const newLayer: TextLayer = {
      ...DEFAULT_TEXT_LAYER,
      id,
      x: canvasState.width / 2,
      y: canvasState.height / 2,
      ...overrides,
    };
    set((state) => ({
      layers: [...state.layers, newLayer],
      selectedLayerId: id,
    }));
    return id;
  },

  addImageLayer: (src, filename, naturalWidth, naturalHeight) => {
    get().pushHistory();
    const id = generateLayerId();
    const canvasState = get().canvas;
    const maxSize = Math.min(canvasState.width, canvasState.height) * 0.5;
    const scale = Math.min(maxSize / naturalWidth, maxSize / naturalHeight, 1);
    const newLayer: ImageLayer = {
      ...DEFAULT_IMAGE_LAYER,
      id,
      src,
      filename,
      naturalWidth,
      naturalHeight,
      width: Math.round(naturalWidth * scale),
      height: Math.round(naturalHeight * scale),
      x: canvasState.width / 2,
      y: canvasState.height / 2,
    };
    set((state) => ({
      layers: [...state.layers, newLayer],
      selectedLayerId: id,
    }));
    return id;
  },

  addShapeLayer: (shapeType = 'rectangle') => {
    get().pushHistory();
    const id = generateLayerId();
    const canvasState = get().canvas;
    const newLayer: ShapeLayer = {
      type: 'shape',
      id,
      shapeType,
      x: canvasState.width / 2,
      y: canvasState.height / 2,
      width: 200,
      height: 200,
      fillColor: '#E5E7EB',
      strokeColor: '#000000',
      strokeWidth: 0,
      opacity: 1,
      visible: true,
      locked: false,
    };
    set((state) => ({
      layers: [...state.layers, newLayer],
      selectedLayerId: id,
    }));
    return id;
  },

  updateLayer: (id, updates) => {
    get().pushHistory();
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, ...updates } : layer
      ),
    }));
  },

  updateLayerSilent: (id, updates) =>
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, ...updates } : layer
      ),
    })),

  removeLayer: (id) => {
    get().pushHistory();
    set((state) => ({
      layers: state.layers.filter((l) => l.id !== id),
      selectedLayerId: state.selectedLayerId === id ? null : state.selectedLayerId,
    }));
  },

  duplicateLayer: (id) => {
    get().pushHistory();
    const state = get();
    const layer = state.layers.find((l) => l.id === id);
    if (!layer) return;

    const newId = generateLayerId();
    const duplicated = {
      ...layer,
      id: newId,
      x: layer.x + 20,
      y: layer.y + 20,
    };

    const idx = state.layers.findIndex((l) => l.id === id);
    const newLayers = [...state.layers];
    newLayers.splice(idx + 1, 0, duplicated);

    set({ layers: newLayers, selectedLayerId: newId });
  },

  toggleLayerVisibility: (id) => {
    get().pushHistory();
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id ? { ...layer, visible: !layer.visible } : layer
      ),
    }));
  },

  reorderLayers: (fromIndex, toIndex) => {
    get().pushHistory();
    set((state) => {
      const newLayers = [...state.layers];
      const [moved] = newLayers.splice(fromIndex, 1);
      newLayers.splice(toIndex, 0, moved);
      return { layers: newLayers };
    });
  },

  moveLayerUp: (id) => {
    const state = get();
    const idx = state.layers.findIndex((l) => l.id === id);
    if (idx < state.layers.length - 1) {
      state.reorderLayers(idx, idx + 1);
    }
  },

  moveLayerDown: (id) => {
    const state = get();
    const idx = state.layers.findIndex((l) => l.id === id);
    if (idx > 0) {
      state.reorderLayers(idx, idx - 1);
    }
  },

  setSelectedLayer: (id) => set({ selectedLayerId: id }),

  loadProjectState: (id, name, canvas, layers) =>
    set({
      currentProjectId: id,
      currentProjectName: name,
      canvas,
      layers,
      selectedLayerId: null,
      past: [],
      future: [],
    }),

  setCurrentProjectInfo: (id, name) =>
    set({
      currentProjectId: id,
      currentProjectName: name,
    }),

  reset: () =>
    set({
      currentProjectId: null,
      currentProjectName: null,
      canvas: { ...DEFAULT_CANVAS },
      layers: [],
      selectedLayerId: null,
      past: [],
      future: [],
    }),
}));
