/**
 * Product Image Maker — Type Definitions
 * 
 * Standalone types for the product image maker tool.
 * No dependencies on any existing sanMediaBox types.
 */

// ─── Canvas Settings ───────────────────────────────────────

export interface CanvasSettings {
  width: number;
  height: number;
  backgroundColor: string;
  exportFormat: 'png' | 'jpeg' | 'webp';
  exportQuality: number;
  borderWidth: number;
  borderColor: string;
  /** Background color of the workspace area behind the canvas */
  workspaceColor?: string;
  /** Background color of the right settings panel */
  panelColor?: string;
  transparent?: boolean;
}

// ─── Layer Types ───────────────────────────────────────────

export interface TextLayer {
  id: string;
  type: 'text';
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  opacity: number;
  x: number;
  y: number;
  textAlign: 'left' | 'center' | 'right';
  letterSpacing: number;
  visible: boolean;
  textTransform?: 'none' | 'uppercase' | 'lowercase';
  /** Optional: show decorative lines on both sides of text */
  decorationLine: boolean;
  decorationLineColor: string;
  decorationLineWidth: number;
  decorationLineLength: number;
  decorationLineGap: number;
  locked?: boolean;
  rotation?: number;
}

export interface ImageLayer {
  id: string;
  type: 'image';
  /** data URL or object URL of the image */
  src: string;
  /** Original filename for display purposes */
  filename: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Natural (original) dimensions, used for aspect ratio lock */
  naturalWidth: number;
  naturalHeight: number;
  opacity: number;
  visible: boolean;
  /** Optional border */
  borderWidth: number;
  borderColor: string;
  locked?: boolean;
  rotation?: number;
}

export interface ShapeLayer {
  id: string;
  type: 'shape';
  shapeType: 'rectangle' | 'circle' | 'triangle';
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  visible: boolean;
  locked?: boolean;
  rotation?: number;
}

export type Layer = TextLayer | ImageLayer | ShapeLayer;

// ─── Preset Canvas Sizes ──────────────────────────────────

export interface CanvasPreset {
  label: string;
  width: number;
  height: number;
}

export const CANVAS_PRESETS: CanvasPreset[] = [
  { label: '1000 × 1000 (正方形)', width: 1000, height: 1000 },
  { label: '800 × 800', width: 800, height: 800 },
  { label: '1200 × 628 (社交媒体)', width: 1200, height: 628 },
  { label: '1080 × 1080 (Instagram)', width: 1080, height: 1080 },
  { label: '1920 × 1080 (横屏)', width: 1920, height: 1080 },
  { label: '1080 × 1920 (竖屏)', width: 1080, height: 1920 },
];

// ─── Default Values ────────────────────────────────────────

export const DEFAULT_CANVAS: CanvasSettings = {
  width: 1000,
  height: 1000,
  backgroundColor: '#FFFFFF',
  exportFormat: 'png',
  exportQuality: 0.9,
  borderWidth: 0,
  borderColor: '#FF6B00',
  workspaceColor: '',
  panelColor: '',
  transparent: false,
};

export const DEFAULT_TEXT_LAYER: Omit<TextLayer, 'id'> = {
  type: 'text',
  content: 'New Text',
  fontFamily: 'Inter',
  fontSize: 48,
  fontWeight: 700,
  color: '#1B2A4A',
  opacity: 1,
  x: 500,
  y: 500,
  textAlign: 'center',
  letterSpacing: 0,
  visible: true,
  textTransform: 'none',
  decorationLine: false,
  decorationLineColor: '#AAAAAA',
  decorationLineWidth: 1,
  decorationLineLength: 60,
  decorationLineGap: 20,
};

export const DEFAULT_IMAGE_LAYER: Omit<ImageLayer, 'id' | 'src' | 'filename' | 'naturalWidth' | 'naturalHeight'> = {
  type: 'image',
  x: 500,
  y: 500,
  width: 200,
  height: 200,
  opacity: 1,
  visible: true,
  borderWidth: 0,
  borderColor: '#1B2A4A',
};

export const DEFAULT_SHAPE_LAYER: Omit<ShapeLayer, 'id'> = {
  type: 'shape',
  shapeType: 'rectangle',
  x: 500,
  y: 500,
  width: 200,
  height: 200,
  fillColor: '#E5E7EB',
  strokeColor: '#000000',
  strokeWidth: 0,
  opacity: 1,
  visible: true,
  locked: false,
};

// ─── Font Weight Labels ────────────────────────────────────

export const FONT_WEIGHT_OPTIONS = [
  { value: 100, label: 'Thin' },
  { value: 200, label: 'Extra Light' },
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semi Bold' },
  { value: 700, label: 'Bold' },
  { value: 800, label: 'Extra Bold' },
  { value: 900, label: 'Black' },
] as const;
