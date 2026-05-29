import { Guideline, SliceItem } from './types';

/**
 * Generate equal-division guidelines for an image dimension.
 * Supports single division lines and double division lines (with a gutter distance).
 */
export function calculateEqualGuidelines(
  totalSize: number,
  divisions: number,
  type: 'horizontal' | 'vertical',
  doubleLines: boolean,
  gutter: number
): Guideline[] {
  if (divisions <= 1) return [];

  const guidelines: Guideline[] = [];
  const baseId = `${type}_auto_${Date.now()}`;

  if (!doubleLines) {
    // Single division line mode: divide totalSize into `divisions` parts.
    const partSize = totalSize / divisions;
    for (let i = 1; i < divisions; i++) {
      guidelines.push({
        id: `${baseId}_${i}`,
        type,
        position: Math.round(i * partSize),
        isAuto: true,
      });
    }
  } else {
    // Double division line mode:
    // divisions * sliceSize + (divisions - 1) * gutter = totalSize
    // sliceSize = (totalSize - (divisions - 1) * gutter) / divisions
    const totalGutterSpace = (divisions - 1) * gutter;
    const totalSliceSpace = Math.max(0, totalSize - totalGutterSpace);
    const sliceSize = totalSliceSpace / divisions;

    for (let i = 1; i < divisions; i++) {
      const startPos = Math.round(i * sliceSize + (i - 1) * gutter);
      const endPos = Math.round(startPos + gutter);
      const pairId = `${baseId}_pair_${i}`;

      guidelines.push(
        {
          id: `${baseId}_${i}_start`,
          type,
          position: startPos,
          isAuto: true,
          gutterSide: 'start',
          pairId,
        },
        {
          id: `${baseId}_${i}_end`,
          type,
          position: endPos,
          isAuto: true,
          gutterSide: 'end',
          pairId,
        }
      );
    }
  }

  return guidelines;
}

/**
 * Compute the grid cells (slices) resulting from the horizontal and vertical guidelines.
 * Detects whether each grid cell falls inside a gutter boundary.
 */
export function computeSlices(
  imageWidth: number,
  imageHeight: number,
  guidelines: Guideline[]
): SliceItem[] {
  const vGuides = guidelines.filter((g) => g.type === 'vertical');
  const hGuides = guidelines.filter((g) => g.type === 'horizontal');

  // Sort and add boundary points
  const rawVLines = [
    { id: 'v_boundary_start', type: 'vertical' as const, position: 0 },
    ...vGuides.sort((a, b) => a.position - b.position),
    { id: 'v_boundary_end', type: 'vertical' as const, position: imageWidth },
  ];

  const rawHLines = [
    { id: 'h_boundary_start', type: 'horizontal' as const, position: 0 },
    ...hGuides.sort((a, b) => a.position - b.position),
    { id: 'h_boundary_end', type: 'horizontal' as const, position: imageHeight },
  ];

  // Clean up adjacent lines that are too close (less than 1px apart) and clamp
  const cleanVLines: typeof rawVLines = [];
  for (const line of rawVLines) {
    const clampedPos = Math.max(0, Math.min(imageWidth, Math.round(line.position)));
    const updatedLine = { ...line, position: clampedPos };

    if (
      cleanVLines.length === 0 ||
      Math.abs(updatedLine.position - cleanVLines[cleanVLines.length - 1].position) >= 1
    ) {
      cleanVLines.push(updatedLine);
    }
  }

  const cleanHLines: typeof rawHLines = [];
  for (const line of rawHLines) {
    const clampedPos = Math.max(0, Math.min(imageHeight, Math.round(line.position)));
    const updatedLine = { ...line, position: clampedPos };

    if (
      cleanHLines.length === 0 ||
      Math.abs(updatedLine.position - cleanHLines[cleanHLines.length - 1].position) >= 1
    ) {
      cleanHLines.push(updatedLine);
    }
  }

  const slices: SliceItem[] = [];

  // Track row and column indices for regular slices (excluding gutters from indices if desired,
  // but to keep it simple, we just use absolute grid indexing and let the user see the grid).
  // Wait, let's count only "non-gutter" rows/columns for the index, or absolute grid index?
  // Let's use absolute indices for coordinates, but we can also count non-gutter indices for the numbering.
  // It is cleaner to use standard 1-based sequential grid indices.
  for (let r = 0; r < cleanHLines.length - 1; r++) {
    const yStart = cleanHLines[r].position;
    const yEnd = cleanHLines[r + 1].position;
    const height = yEnd - yStart;

    // A row interval is a gutter if it starts with a 'start' and ends with an 'end' gutter guideline belonging to the same pair
    const isRowGutter =
      cleanHLines[r].gutterSide === 'start' &&
      cleanHLines[r + 1].gutterSide === 'end' &&
      cleanHLines[r].pairId === cleanHLines[r + 1].pairId;

    for (let c = 0; c < cleanVLines.length - 1; c++) {
      const xStart = cleanVLines[c].position;
      const xEnd = cleanVLines[c + 1].position;
      const width = xEnd - xStart;

      const isColGutter =
        cleanVLines[c].gutterSide === 'start' &&
        cleanVLines[c + 1].gutterSide === 'end' &&
        cleanVLines[c].pairId === cleanVLines[c + 1].pairId;

      const isGutter = isRowGutter || isColGutter;

      slices.push({
        id: `slice_${r}_${c}`,
        x: xStart,
        y: yStart,
        width,
        height,
        row: r + 1,
        col: c + 1,
        selected: !isGutter, // Gutters are deselected by default
        isGutter,
      });
    }
  }

  return slices;
}

/**
 * Generate slice file name based on naming pattern template.
 */
export function generateSliceFileName(
  pattern: string,
  originalName: string,
  index: number,
  row: number,
  col: number,
  x: number,
  y: number,
  width: number,
  height: number,
  format: string
): string {
  const filenameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
  let name = pattern
    .replace(/{filename}/g, filenameWithoutExt)
    .replace(/{index}/g, String(index))
    .replace(/{row}/g, String(row))
    .replace(/{col}/g, String(col))
    .replace(/{x}/g, String(Math.round(x)))
    .replace(/{y}/g, String(Math.round(y)))
    .replace(/{width}/g, String(Math.round(width)))
    .replace(/{height}/g, String(Math.round(height)));

  // Sanitize filename: replace invalid characters
  name = name.replace(/[\\/:*?"<>|]/g, '_');
  return `${name}.${format}`;
}

/**
 * Process a single slice: Crop the slice from image, adapt to target size (centering / scaling-down),
 * and draw on a canvas.
 */
export function processSliceToCanvas(
  img: HTMLImageElement | HTMLCanvasElement,
  slice: { x: number; y: number; width: number; height: number },
  config: { width: number; height: number; mode: 'center' | 'scale-down'; backgroundColor: string; format?: string }
): HTMLCanvasElement {
  const sw = slice.width;
  const sh = slice.height;

  // Resolve target size: if config size is 0 or less, fallback to slice's original cropped size
  const tw = config.width > 0 ? config.width : sw;
  const th = config.height > 0 ? config.height : sh;

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Draw background color
  // JPEGs do not support transparency. Force white background if format is jpeg and backgroundColor is transparent.
  let bgColor = config.backgroundColor;
  if (config.format === 'jpeg' && bgColor === 'transparent') {
    bgColor = '#FFFFFF';
  }

  if (bgColor && bgColor !== 'transparent') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, tw, th);
  } else {
    ctx.clearRect(0, 0, tw, th);
  }

  let dw = sw;
  let dh = sh;

  // Adapting Rule:
  // "小于尺寸就居中，大于尺寸就按比例缩小到完整显示"
  // If target mode is center but the slice is larger than target, we MUST scale down to fit it (to display completely).
  // If target mode is scale-down or slice is larger than canvas size, scale down.
  if (sw > tw || sh > th || config.mode === 'scale-down') {
    const ratio = Math.min(tw / sw, th / sh);
    dw = sw * ratio;
    dh = sh * ratio;
  }

  // Centering coordinates
  const dx = (tw - dw) / 2;
  const dy = (th - dh) / 2;

  ctx.drawImage(
    img,
    slice.x,
    slice.y,
    sw,
    sh, // Source bounds
    dx,
    dy,
    dw,
    dh // Target centered bounds
  );

  return canvas;
}
