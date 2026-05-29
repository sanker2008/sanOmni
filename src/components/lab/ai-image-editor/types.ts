/**
 * types.ts — Core type definitions for the AI Image Editor (AI P图工具).
 *
 * Defines node graph structures, mask data, brush settings,
 * API provider interfaces, and project serialization types.
 */

// ─── Node Graph ────────────────────────────────────────────

export type NodeType = 'source' | 'generated';

export interface EditorNode {
  id: string;
  type: NodeType;
  /** Display label, e.g. "原图", "生成-1", "生成-2" */
  label: string;
  /** Position on the node canvas (in canvas coordinates) */
  x: number;
  y: number;
  /** Image data as base64 data-URL */
  imageData: string;
  /** Thumbnail data-URL (smaller for canvas rendering performance) */
  thumbnailData?: string;
  /** Original filename (for source nodes) */
  filename?: string;
  /** Full file path on disk (source: original path; generated: saved output path) */
  filePath?: string;
  /** Image dimensions */
  width: number;
  height: number;

  // ─── Generation metadata (only for 'generated' nodes) ───
  /** Prompt used for generation */
  prompt?: string;
  /** Negative prompt */
  negativePrompt?: string;
  /** Mask data-URL (white = inpaint area, black = keep) */
  maskData?: string;
  /** Provider id used for generation */
  providerId?: string;
  /** Provider-specific params snapshot at generation time */
  providerParams?: Record<string, any>;
  /** Seed returned by the API */
  seed?: number;
  /** Generation timestamp */
  generatedAt?: string;
  /** Whether the node is currently generating */
  isGenerating?: boolean;
  /** Generation error message */
  error?: string;
}

export interface EditorEdge {
  id: string;
  /** Source node id (parent / input image) */
  sourceId: string;
  /** Target node id (child / generated image) */
  targetId: string;
}

// ─── Viewport ──────────────────────────────────────────────

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

// ─── Mask / Brush ──────────────────────────────────────────

export type BrushTool = 'brush' | 'eraser' | 'rect' | 'ellipse';

export interface BrushSettings {
  tool: BrushTool;
  size: number;        // px
  opacity: number;     // 0–1
}

// ─── API Provider ──────────────────────────────────────────

export type ProviderFieldType = 'text' | 'password' | 'number' | 'textarea' | 'select';

export interface ProviderFieldOption {
  label: string;
  value: string;
}

export interface ProviderField {
  key: string;
  label: string;
  type: ProviderFieldType;
  placeholder?: string;
  defaultValue?: any;
  description?: string;
  options?: ProviderFieldOption[];   // for 'select'
  min?: number;
  max?: number;
  step?: number;                     // for 'number'
}

export interface ProviderMeta {
  id: string;
  name: string;
  description: string;
  fields: ProviderField[];
}

export interface InpaintRequest {
  image: string;            // base64 (no data-url prefix)
  mask: string;             // base64 (no data-url prefix)
  prompt: string;
  negativePrompt?: string;
  providerConfig: Record<string, any>;
}

export interface InpaintResult {
  image: string;            // base64 result
  seed?: number;
  info?: string;
}

export interface ApiProvider {
  meta: ProviderMeta;
  generateInpaint(request: InpaintRequest): Promise<InpaintResult>;
}

// ─── Project Persistence ───────────────────────────────────

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Relative path to thumbnail within project dir */
  thumbnailPath?: string;
  nodeCount: number;
}

export interface ProjectData {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  viewport: Viewport;
  nodes: EditorNode[];
  edges: EditorEdge[];
}
