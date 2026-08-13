// ─── Workflow I/O ─────────────────────────────────

export interface WorkflowIO {
  paths: string[];        // file paths array (single image: length=1)
  metadata?: {
    width?: number;
    height?: number;
    format?: string;
  };
}

// ─── Adapter Config ───────────────────────────────

export interface AdapterConfigField {
  key: string;
  label: string;
  type: 'number' | 'select' | 'boolean' | 'range';
  defaultValue: number | string | boolean;
  options?: { label: string; value: string | number }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

// ─── Workflow Adapter ─────────────────────────────

export interface WorkflowAdapter {
  id: string;
  name: string;
  description: string;
  icon: string;                 // Lucide icon component name
  inputType: 'image' | 'images';
  outputType: 'image' | 'images';
  configSchema: AdapterConfigField[];
  process(input: WorkflowIO, config: Record<string, any>): Promise<WorkflowIO>;
  validate?(input: WorkflowIO): { valid: boolean; reason?: string };
}

// ─── Canvas Graph Node & Edge (Persistence) ───────

export type NodeStatus = 'idle' | 'processing' | 'completed' | 'error';

export interface CanvasNodeDef {
  id: string;                   // unique node instance id
  type: 'tool' | 'input' | 'output';
  adapterId: string;            // references adapter registry or 'input-image'
  x: number;
  y: number;
  config: Record<string, any>;  // adapter-specific config values
  inputPaths?: string[];
  outputPaths?: string[];
  outputPreview?: string;       // convertFileSrc URL for preview inside node card
  status?: NodeStatus;
  durationMs?: number;
  error?: string;
}

export interface CanvasEdgeDef {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface WorkflowDef {
  id: string;
  name: string;
  description: string;
  nodes: CanvasNodeDef[];
  edges: CanvasEdgeDef[];
  viewport?: Viewport;
  createdAt: string;
  updatedAt: string;
}

// ─── Engine Execution Types ───────────────────────

export interface NodeProgress {
  nodeId: string;
  adapterName: string;
  status: NodeStatus;
  outputPreview?: string;
  outputPaths?: string[];
  error?: string;
  durationMs?: number;
}

export interface ExecutionProgress {
  executionId: string;
  currentNodeId: string;
  totalNodes: number;
  completedNodes: number;
  nodeProgress: Record<string, NodeProgress>;
  status: 'idle' | 'running' | 'completed' | 'error' | 'aborted';
  error?: string;
}

export interface ExecutionResult {
  success: boolean;
  executionId: string;
  nodeResults: Record<string, NodeProgress>;
  finalOutputPaths: string[];
  totalDurationMs: number;
  error?: string;
}
