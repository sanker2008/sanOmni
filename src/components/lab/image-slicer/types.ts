export interface Guideline {
  id: string;
  type: 'horizontal' | 'vertical';
  position: number; // Position in pixels relative to original image dimensions
  isAuto?: boolean;
  gutterSide?: 'start' | 'end'; // For double guidelines: start of gutter or end of gutter
  pairId?: string; // Links the double guideline pair together
}

export interface SliceItem {
  id: string;
  x: number; // Starting X coordinate in pixels relative to original image
  y: number; // Starting Y coordinate in pixels relative to original image
  width: number; // Width in pixels
  height: number; // Height in pixels
  row: number; // Grid row (1-based)
  col: number; // Grid col (1-based)
  selected: boolean; // Whether the user wants to keep and export this slice
  isGutter?: boolean; // Tag if this slice represents a gutter gap (default discarded)
}

export type AdaptMode = 'center' | 'scale-down';
export type ExportFormat = 'png' | 'jpeg' | 'webp';

export interface ExportConfig {
  width: number; // Target canvas width in pixels
  height: number; // Target canvas height in pixels
  mode: AdaptMode; // Adapting mode for fits
  backgroundColor: string; // Transparent, #FFFFFF, etc.
  format: ExportFormat; // png, jpeg, webp
  quality: number; // 0.1 to 1.0 for lossy formats
  namingPattern: string; // e.g. "{filename}_slice_{index}"
  exportPath: string; // Designated export folder
}
