/**
 * CanvasPreview — Real-time canvas rendering for the product image maker.
 * 
 * Renders all layers onto an HTML5 Canvas element.
 * Supports click-to-select layers and drag-to-move.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { Maximize } from 'lucide-react';
import type { CanvasSettings, Layer, TextLayer, ImageLayer, ShapeLayer } from './types';

interface CanvasPreviewProps {
  canvas: CanvasSettings;
  layers: Layer[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onMoveLayer: (id: string, x: number, y: number) => void;
  onUpdateLayer?: (id: string, updates: Partial<Layer>) => void;
  /** Silent version of onUpdateLayer — used during live drag/resize (no undo snapshot) */
  onUpdateLayerSilent?: (id: string, updates: Partial<Layer>) => void;
  /** Called once when a drag/resize gesture begins, to snapshot undo state */
  onPushHistory?: () => void;
}

// ─── Image Cache ───────────────────────────────────────────

const imageCache = new Map<string, HTMLImageElement>();

function getCachedImage(src: string): HTMLImageElement | null {
  if (imageCache.has(src)) return imageCache.get(src)!;
  
  const img = new Image();
  img.src = src;
  img.onload = () => imageCache.set(src, img);
  
  // If already loaded (e.g., data URL), cache immediately
  if (img.complete) {
    imageCache.set(src, img);
    return img;
  }
  
  return null;
}

// ─── Render Functions ──────────────────────────────────────

function getTransformedText(content: string, transform?: string): string {
  if (transform === 'uppercase') return content.toUpperCase();
  if (transform === 'lowercase') return content.toLowerCase();
  return content;
}

function renderTextLayer(ctx: CanvasRenderingContext2D, layer: TextLayer) {
  if (!layer.visible || !layer.content) return;

  const textContent = getTransformedText(layer.content, layer.textTransform);

  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.globalCompositeOperation = (layer.blendMode as GlobalCompositeOperation) || 'source-over';
  ctx.font = `${layer.fontWeight} ${layer.fontSize}px "${layer.fontFamily}"`;
  ctx.fillStyle = layer.color;
  ctx.textAlign = layer.textAlign;
  ctx.textBaseline = 'middle';

  // Letter spacing (manual rendering if > 0)
  if (layer.letterSpacing > 0) {
    renderTextWithLetterSpacing(ctx, layer, textContent);
  } else {
    ctx.fillText(textContent, layer.x, layer.y);
  }

  // Decoration lines (lines on both sides of text)
  if (layer.decorationLine) {
    const textWidth = ctx.measureText(textContent).width;
    const lineY = layer.y;
    const gap = layer.decorationLineGap ?? 20;
    const lineLength = layer.decorationLineLength ?? 60;

    const decOpacity = layer.decorationLineOpacity ?? 1.0;
    ctx.globalAlpha = layer.opacity * decOpacity;
    ctx.strokeStyle = layer.decorationLineColor;
    ctx.lineWidth = layer.decorationLineWidth;

    let textStartX: number;
    if (layer.textAlign === 'center') {
      textStartX = layer.x - textWidth / 2;
    } else if (layer.textAlign === 'right') {
      textStartX = layer.x - textWidth;
    } else {
      textStartX = layer.x;
    }
    const textEndX = textStartX + textWidth;

    // Left line
    ctx.beginPath();
    ctx.moveTo(textStartX - gap - lineLength, lineY);
    ctx.lineTo(textStartX - gap, lineY);
    ctx.stroke();

    // Right line
    ctx.beginPath();
    ctx.moveTo(textEndX + gap, lineY);
    ctx.lineTo(textEndX + gap + lineLength, lineY);
    ctx.stroke();
  }

  ctx.restore();
}

/** Apply rotation transform around layer center, call fn, then restore */
function withRotation(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  fn: () => void,
) {
  const rotation = (layer as any).rotation ?? 0;
  if (rotation === 0) {
    fn();
    return;
  }
  ctx.save();
  ctx.translate(layer.x, layer.y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-layer.x, -layer.y);
  fn();
  ctx.restore();
}

function renderTextWithLetterSpacing(ctx: CanvasRenderingContext2D, layer: TextLayer, textContent: string) {
  const chars = textContent.split('');
  let totalWidth = 0;
  const charWidths: number[] = [];

  for (const char of chars) {
    const w = ctx.measureText(char).width;
    charWidths.push(w);
    totalWidth += w;
  }
  totalWidth += layer.letterSpacing * (chars.length - 1);

  let startX: number;
  if (layer.textAlign === 'center') {
    startX = layer.x - totalWidth / 2;
  } else if (layer.textAlign === 'right') {
    startX = layer.x - totalWidth;
  } else {
    startX = layer.x;
  }

  let currentX = startX;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], currentX, layer.y);
    currentX += charWidths[i] + layer.letterSpacing;
  }
}

function renderImageLayer(ctx: CanvasRenderingContext2D, layer: ImageLayer) {
  if (!layer.visible) return;

  const img = getCachedImage(layer.src);
  if (!img) return;

  ctx.save();
  ctx.globalAlpha = layer.opacity;
  ctx.globalCompositeOperation = (layer.blendMode as GlobalCompositeOperation) || 'source-over';

  // Draw image centered at (x, y)
  const drawX = layer.x - layer.width / 2;
  const drawY = layer.y - layer.height / 2;

  if (layer.borderWidth > 0) {
    ctx.strokeStyle = layer.borderColor;
    ctx.lineWidth = layer.borderWidth;
    ctx.strokeRect(
      drawX - layer.borderWidth / 2,
      drawY - layer.borderWidth / 2,
      layer.width + layer.borderWidth,
      layer.height + layer.borderWidth
    );
  }

  ctx.drawImage(img, drawX, drawY, layer.width, layer.height);
  ctx.restore();
}

function renderShapeLayer(ctx: CanvasRenderingContext2D, layer: ShapeLayer) {
  if (!layer.visible) return;

  ctx.save();
  ctx.globalAlpha = layer.opacity ?? 1;
  ctx.globalCompositeOperation = (layer.blendMode as GlobalCompositeOperation) || 'source-over';

  const w = layer.width ?? 200;
  const h = layer.height ?? 200;
  const x = layer.x;
  const y = layer.y;

  ctx.beginPath();
  const shape = layer.shapeType || 'rectangle';
  if (shape === 'rectangle') {
    ctx.rect(x - w / 2, y - h / 2, w, h);
  } else if (shape === 'circle') {
    ctx.arc(x, y, Math.min(w, h) / 2, 0, Math.PI * 2);
  } else if (shape === 'triangle') {
    ctx.moveTo(x, y - h / 2);
    ctx.lineTo(x + w / 2, y + h / 2);
    ctx.lineTo(x - w / 2, y + h / 2);
    ctx.closePath();
  }

  const fill = layer.fillColor || '#E5E7EB';
  if (fill !== 'transparent') {
    ctx.fillStyle = fill;
    ctx.fill();
  }

  if (layer.strokeWidth && layer.strokeWidth > 0) {
    ctx.strokeStyle = layer.strokeColor || '#000000';
    ctx.lineWidth = layer.strokeWidth;
    ctx.stroke();
  }

  ctx.restore();
}

// ─── Resize & Rotate Handle Types ─────────────────────────

type HandleDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

const HANDLE_SIZE = 8;
const ROTATION_HANDLE_DISTANCE = 25; // px distance above top center

function getHandlePositions(bounds: Bounds, canvasScale: number): { dir: HandleDirection; x: number; y: number }[] {
  const { x, y, width: w, height: h } = bounds;
  const rotDist = ROTATION_HANDLE_DISTANCE / canvasScale;
  return [
    { dir: 'nw', x: x,         y: y },
    { dir: 'n',  x: x + w / 2, y: y },
    { dir: 'ne', x: x + w,     y: y },
    { dir: 'e',  x: x + w,     y: y + h / 2 },
    { dir: 'se', x: x + w,     y: y + h },
    { dir: 's',  x: x + w / 2, y: y + h },
    { dir: 'sw', x: x,         y: y + h },
    { dir: 'w',  x: x,         y: y + h / 2 },
    { dir: 'rotate', x: x + w / 2, y: y - rotDist },
  ];
}

function hitTestHandle(
  mx: number,
  my: number,
  bounds: Bounds,
  canvasScale: number,
  rotation: number = 0,
  layerCenterX: number = 0,
  layerCenterY: number = 0,
): HandleDirection | null {
  // Un-rotate mouse coords into layer-local space
  let lx = mx, ly = my;
  if (rotation !== 0) {
    const rad = (-rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = mx - layerCenterX;
    const dy = my - layerCenterY;
    lx = layerCenterX + dx * cos - dy * sin;
    ly = layerCenterY + dx * sin + dy * cos;
  }
  const handles = getHandlePositions(bounds, canvasScale);
  const radius = (HANDLE_SIZE / 2 + 3) / canvasScale;
  for (const h of handles) {
    if (Math.abs(lx - h.x) <= radius && Math.abs(ly - h.y) <= radius) {
      return h.dir;
    }
  }
  return null;
}

function getHandleCursor(dir: HandleDirection): string {
  const map: Record<HandleDirection, string> = {
    nw: 'nwse-resize', ne: 'nesw-resize',
    se: 'nwse-resize', sw: 'nesw-resize',
    n: 'ns-resize',    s: 'ns-resize',
    e: 'ew-resize',    w: 'ew-resize',
    rotate: 'crosshair',
  };
  return map[dir];
}

function renderSelectionIndicator(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  canvasScale: number,
) {
  if (!layer.visible) return;

  const bounds = getLayerBounds(layer, ctx);
  if (!bounds) return;

  const rotation = (layer as any).rotation ?? 0;

  ctx.save();

  // Rotate around layer center
  if (rotation !== 0) {
    ctx.translate(layer.x, layer.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-layer.x, -layer.y);
  }

  // Dashed bounding box
  ctx.strokeStyle = '#3B82F6';
  ctx.lineWidth = 2 / canvasScale;
  ctx.setLineDash([6 / canvasScale, 4 / canvasScale]);
  ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

  // Resize handles
  ctx.setLineDash([]);
  const hs = HANDLE_SIZE / canvasScale;
  const handles = getHandlePositions(bounds, canvasScale);
  for (const h of handles) {
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 1.5 / canvasScale;
    if (h.dir === 'rotate') {
      // Draw line from top-center to rotation handle
      ctx.beginPath();
      ctx.setLineDash([3 / canvasScale, 3 / canvasScale]);
      ctx.moveTo(bounds.x + bounds.width / 2, bounds.y);
      ctx.lineTo(h.x, h.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Draw circle
      ctx.beginPath();
      ctx.arc(h.x, h.y, hs / 2 + 1 / canvasScale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
      ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
    }
  }

  ctx.restore();
}

// ─── Hit Testing ───────────────────────────────────────────

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getLayerBounds(layer: Layer, ctx?: CanvasRenderingContext2D): Bounds | null {
  if (layer.type === 'image') {
    return {
      x: layer.x - layer.width / 2,
      y: layer.y - layer.height / 2,
      width: layer.width,
      height: layer.height,
    };
  }

  if (layer.type === 'text' && ctx) {
    const textContent = getTransformedText(layer.content, layer.textTransform);
    ctx.save();
    ctx.font = `${layer.fontWeight} ${layer.fontSize}px "${layer.fontFamily}"`;
    ctx.textBaseline = 'middle'; // match renderTextLayer
    const metrics = ctx.measureText(textContent);
    ctx.restore();

    const textWidth = metrics.width + layer.letterSpacing * Math.max(0, textContent.length - 1);
    
    // Fallbacks just in case the browser doesn't support actualBoundingBox*
    const ascent = metrics.actualBoundingBoxAscent ?? (layer.fontSize * 0.6);
    const descent = metrics.actualBoundingBoxDescent ?? (layer.fontSize * 0.6);
    const textHeight = ascent + descent;

    let startX: number;
    if (layer.textAlign === 'center') {
      startX = layer.x - textWidth / 2;
    } else if (layer.textAlign === 'right') {
      startX = layer.x - textWidth;
    } else {
      startX = layer.x;
    }

    return {
      x: startX - 4,
      y: layer.y - ascent - 4,
      width: textWidth + 8,
      height: textHeight + 8,
    };
  }

  if (layer.type === 'shape') {
    return {
      x: layer.x - layer.width / 2,
      y: layer.y - layer.height / 2,
      width: layer.width,
      height: layer.height,
    };
  }

  return null;
}

function hitTest(
  x: number,
  y: number,
  layers: Layer[],
  ctx: CanvasRenderingContext2D,
): string | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer.visible || layer.locked) continue;

    const bounds = getLayerBounds(layer, ctx);
    if (!bounds) continue;

    const rotation = (layer as any).rotation ?? 0;

    // Un-rotate mouse coords into layer-local space
    let lx = x, ly = y;
    if (rotation !== 0) {
      const rad = (-rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const dx = x - layer.x;
      const dy = y - layer.y;
      lx = layer.x + dx * cos - dy * sin;
      ly = layer.y + dx * sin + dy * cos;
    }

    if (
      lx >= bounds.x &&
      lx <= bounds.x + bounds.width &&
      ly >= bounds.y &&
      ly <= bounds.y + bounds.height
    ) {
      return layer.id;
    }
  }
  return null;
}

// ─── Component ─────────────────────────────────────────────

export default function CanvasPreview({
  canvas,
  layers,
  selectedLayerId,
  onSelectLayer,
  onMoveLayer,
  onUpdateLayer,
  onUpdateLayerSilent,
  onPushHistory,
}: CanvasPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const lastPanMouse = useRef<{ x: number; y: number } | null>(null);
  const stateRef = useRef({ scale, pan });
  const isViewInitialized = useRef(false);
  const lastMoveTimeRef = useRef<number>(0);

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [handleCursor, setHandleCursor] = useState<string | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [snapLines, setSnapLines] = useState<{ x?: number; y?: number; xIsCenter?: boolean; yIsCenter?: boolean } | null>(null);
  const dragStartRef = useRef<{
    layerId: string;
    mode: 'move' | 'resize' | 'rotate';
    handleDir?: HandleDirection;
    startX: number;
    startY: number;
    layerX: number;
    layerY: number;
    layerW: number;
    layerH: number;
    fontSize?: number;
    initialRotation?: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  useEffect(() => {
    stateRef.current = { scale, pan };
  }, [scale, pan]);

  const fitToView = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    
    const targetW = containerW - 64;
    const targetH = containerH - 64;
    
    const newScale = Math.min(targetW / canvas.width, targetH / canvas.height, 1);
    const newPanX = (containerW - canvas.width * newScale) / 2;
    const newPanY = (containerH - canvas.height * newScale) / 2;
    
    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  }, [canvas.width, canvas.height]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      if (!isViewInitialized.current) {
        fitToView();
        isViewInitialized.current = true;
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [fitToView]);

  // Re-fit when canvas dimensions change
  useEffect(() => {
    fitToView();
  }, [canvas.width, canvas.height, fitToView]);

  // Wheel for zoom / pan
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number | null = null;
    let pendingScale: number | null = null;
    let pendingPan: { x: number; y: number } | null = null;

    const flush = () => {
      rafId = null;
      if (pendingScale !== null && pendingPan !== null) {
        // Batch both updates into a single render cycle
        setScale(pendingScale);
        setPan(pendingPan);
        stateRef.current = { scale: pendingScale, pan: pendingPan };
      } else if (pendingPan !== null) {
        setPan(pendingPan);
        stateRef.current = { ...stateRef.current, pan: pendingPan };
      }
      pendingScale = null;
      pendingPan = null;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { scale: currentScale, pan: currentPan } = stateRef.current;
      
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const zoomSensitivity = 0.005;
        const zoomFactor = 1 - e.deltaY * zoomSensitivity;
        let newScale = currentScale * zoomFactor;
        newScale = Math.max(0.05, Math.min(newScale, 10));
        
        const rect = container.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        
        const newPanX = cursorX - ((cursorX - currentPan.x) / currentScale) * newScale;
        const newPanY = cursorY - ((cursorY - currentPan.y) / currentScale) * newScale;
        
        pendingScale = newScale;
        pendingPan = { x: newPanX, y: newPanY };
        // Update ref immediately so rapid successive events read correct values
        stateRef.current = { scale: newScale, pan: { x: newPanX, y: newPanY } };
      } else {
        // Pan
        const newPan = { x: currentPan.x - e.deltaX, y: currentPan.y - e.deltaY };
        pendingPan = newPan;
        stateRef.current = { ...stateRef.current, pan: newPan };
      }

      if (rafId === null) {
        rafId = requestAnimationFrame(flush);
      }
    };
    
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  // Keyboard Spacebar for panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isSpacePressed) {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        setIsSpacePressed(true);
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isSpacePressed]);

  const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
    if (isSpacePressed || e.button === 1) { // Middle click or Space
      setIsPanning(true);
      lastPanMouse.current = { x: e.clientX, y: e.clientY };
      return;
    }
    
    // Clear selection if clicking directly on the container (outside canvas)
    if (e.target === e.currentTarget) {
      onSelectLayer(null);
    }
  }, [isSpacePressed, onSelectLayer]);
  
  const handleContainerMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning && lastPanMouse.current) {
      const dx = e.clientX - lastPanMouse.current.x;
      const dy = e.clientY - lastPanMouse.current.y;
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastPanMouse.current = { x: e.clientX, y: e.clientY };
    }
  }, [isPanning]);
  
  const handleContainerMouseUp = useCallback(() => {
    setIsPanning(false);
    lastPanMouse.current = null;
  }, []);

  // Render canvas
  const render = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;

    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    // Clear and draw background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!canvas.transparent) {
      ctx.fillStyle = canvas.backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Render layers bottom to top
    for (const layer of layers) {
      if (layer.id === editingLayerId) continue;
      withRotation(ctx, layer, () => {
        if (layer.type === 'text') {
          renderTextLayer(ctx, layer);
        } else if (layer.type === 'image') {
          renderImageLayer(ctx, layer);
        } else if (layer.type === 'shape') {
          renderShapeLayer(ctx, layer);
        }
      });
    }

    // Draw canvas border if set
    if (canvas.borderWidth && canvas.borderWidth > 0) {
      const bw = canvas.borderWidth;
      ctx.strokeStyle = canvas.borderColor || '#000000';
      ctx.lineWidth = bw;
      // Inward stroke by inseting half of the border width
      ctx.strokeRect(bw / 2, bw / 2, canvas.width - bw, canvas.height - bw);
    }

    // Selection indicator
    if (selectedLayerId && selectedLayerId !== editingLayerId) {
      const selectedLayer = layers.find((l) => l.id === selectedLayerId);
      if (selectedLayer) {
        renderSelectionIndicator(ctx, selectedLayer, stateRef.current.scale);
      }
    }

    // Snap lines
    if (snapLines && isDragging) {
      ctx.save();
      ctx.lineWidth = 1 / stateRef.current.scale;
      ctx.setLineDash([4 / stateRef.current.scale, 4 / stateRef.current.scale]);

      if (snapLines.x !== undefined) {
        ctx.strokeStyle = snapLines.xIsCenter ? '#60A5FA' : '#F87171'; // blue for center, red for layer
        ctx.beginPath();
        ctx.moveTo(snapLines.x, 0);
        ctx.lineTo(snapLines.x, canvas.height);
        ctx.stroke();
      }
      if (snapLines.y !== undefined) {
        ctx.strokeStyle = snapLines.yIsCenter ? '#60A5FA' : '#F87171';
        ctx.beginPath();
        ctx.moveTo(0, snapLines.y);
        ctx.lineTo(canvas.width, snapLines.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [canvas, layers, selectedLayerId, editingLayerId, snapLines, isDragging]);

  useEffect(() => {
    // Use requestAnimationFrame for smooth rendering
    const frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [render]);

  // Also re-render when images load
  useEffect(() => {
    const interval = setInterval(() => {
      const hasUnloaded = layers.some(
        (l) => l.type === 'image' && !imageCache.has(l.src)
      );
      if (hasUnloaded) {
        // Try to cache images
        layers.forEach((l) => {
          if (l.type === 'image') getCachedImage(l.src);
        });
        render();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [layers, render]);

  // Mouse handlers for drag
  const getCanvasCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
      const cvs = canvasRef.current;
      if (!cvs) return { x: 0, y: 0 };
      const rect = cvs.getBoundingClientRect();
      const displayScale = rect.width / canvas.width;
      return {
        x: (e.clientX - rect.left) / displayScale,
        y: (e.clientY - rect.top) / displayScale,
      };
    },
    [canvas.width],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const coords = getCanvasCoords(e);
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;

      const hitId = hitTest(coords.x, coords.y, layers, ctx);
      if (hitId) {
        const layer = layers.find((l) => l.id === hitId);
        if (layer && layer.type === 'text') {
          setEditingLayerId(hitId);
        }
      }
    },
    [layers, getCanvasCoords]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isSpacePressed || e.button === 1) return;
      const coords = getCanvasCoords(e);
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;

      // 1. Check if clicking a resize/rotate handle on the already-selected layer
      if (selectedLayerId) {
        const selLayer = layers.find((l) => l.id === selectedLayerId);
        if (selLayer && selLayer.visible && !selLayer.locked) {
          const bounds = getLayerBounds(selLayer, ctx);
          if (bounds) {
            const rotation = (selLayer as any).rotation ?? 0;
            const handleDir = hitTestHandle(coords.x, coords.y, bounds, scale, rotation, selLayer.x, selLayer.y);
            if (handleDir) {
              // Snapshot undo state once before the gesture begins
              onPushHistory?.();
              setIsResizing(true);
              const w = selLayer.type === 'text' ? bounds.width : (selLayer as any).width ?? bounds.width;
              const h = selLayer.type === 'text' ? bounds.height : (selLayer as any).height ?? bounds.height;
              dragStartRef.current = {
                layerId: selectedLayerId,
                mode: handleDir === 'rotate' ? 'rotate' : 'resize',
                handleDir,
                startX: coords.x,
                startY: coords.y,
                layerX: selLayer.x,
                layerY: selLayer.y,
                layerW: w,
                layerH: h,
                fontSize: selLayer.type === 'text' ? (selLayer as TextLayer).fontSize : undefined,
                initialRotation: (selLayer as any).rotation ?? 0,
                offsetX: 0,
                offsetY: 0,
              };
              return;
            }
          }
        }
      }

      // 2. Normal hit test for layer body
      const hitId = hitTest(coords.x, coords.y, layers, ctx);
      onSelectLayer(hitId);

      if (hitId) {
        const layer = layers.find((l) => l.id === hitId);
        if (layer) {
          // Snapshot undo state once before the move gesture begins
          onPushHistory?.();
          setIsDragging(true);

          let offsetX = 0;
          let offsetY = 0;
          const bounds = getLayerBounds(layer, ctx);
          if (bounds) {
            const visualCenterX = bounds.x + bounds.width / 2;
            const visualCenterY = bounds.y + bounds.height / 2;
            offsetX = layer.x - visualCenterX;
            offsetY = layer.y - visualCenterY;
          }

          dragStartRef.current = {
            layerId: hitId,
            mode: 'move',
            startX: coords.x,
            startY: coords.y,
            layerX: layer.x,
            layerY: layer.y,
            layerW: (layer as any).width ?? 0,
            layerH: (layer as any).height ?? 0,
            offsetX,
            offsetY,
          };
        }
      }
    },
    [layers, getCanvasCoords, onSelectLayer, selectedLayerId, scale, isSpacePressed],
  );

  // Hover cursor for resize handles
  const handleCanvasHover = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isDragging || isResizing) return;
      if (!selectedLayerId) { setHandleCursor(null); return; }

      const coords = getCanvasCoords(e);
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;

      const selLayer = layers.find((l) => l.id === selectedLayerId);
      if (!selLayer || selLayer.locked) { setHandleCursor(null); return; }

      const bounds = getLayerBounds(selLayer, ctx);
      if (!bounds) { setHandleCursor(null); return; }

      const rotation = (selLayer as any).rotation ?? 0;
      const dir = hitTestHandle(coords.x, coords.y, bounds, scale, rotation, selLayer.x, selLayer.y);
      setHandleCursor(dir ? getHandleCursor(dir) : null);
    },
    [selectedLayerId, layers, getCanvasCoords, scale, isDragging, isResizing],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Always update hover cursor
      handleCanvasHover(e);

      const drag = dragStartRef.current;
      if (!drag) return;

      const now = performance.now();
      if (now - lastMoveTimeRef.current < 16) {
        return; // Throttle to ~60fps
      }
      lastMoveTimeRef.current = now;

      const coords = getCanvasCoords(e);
      const dx = coords.x - drag.startX;
      const dy = coords.y - drag.startY;

      // ── ROTATE MODE ──
      if (drag.mode === 'rotate' && onUpdateLayerSilent) {
        const layer = layers.find(l => l.id === drag.layerId);
        if (!layer) return;

        // Calculate angle from layer center to current mouse
        const angleNow = Math.atan2(coords.y - drag.layerY, coords.x - drag.layerX);
        const angleStart = Math.atan2(drag.startY - drag.layerY, drag.startX - drag.layerX);
        let angleDelta = ((angleNow - angleStart) * 180) / Math.PI;
        let newRotation = (drag.initialRotation ?? 0) + angleDelta;

        // Snap to 15-degree increments when Shift is held
        if (e.shiftKey) {
          newRotation = Math.round(newRotation / 15) * 15;
        }

        // Normalize to -180..180
        newRotation = ((newRotation % 360) + 540) % 360 - 180;

        onUpdateLayerSilent(drag.layerId, { rotation: Math.round(newRotation * 10) / 10 });
        return;
      }

      // ── RESIZE MODE ──
      if (drag.mode === 'resize' && onUpdateLayerSilent) {
        const dir = drag.handleDir!;
        const layer = layers.find(l => l.id === drag.layerId);
        if (!layer) return;

        let newW = drag.layerW;
        let newH = drag.layerH;
        let newX = drag.layerX;
        let newY = drag.layerY;

        // Determine which axes this handle affects
        const affectsLeft = dir.includes('w');
        const affectsRight = dir.includes('e');
        const affectsTop = dir.includes('n');
        const affectsBottom = dir.includes('s');

        if (affectsRight) newW = Math.max(10, drag.layerW + dx);
        if (affectsLeft)  newW = Math.max(10, drag.layerW - dx);
        if (affectsBottom) newH = Math.max(10, drag.layerH + dy);
        if (affectsTop)    newH = Math.max(10, drag.layerH - dy);

        // For text: always maintain aspect ratio since we only scale fontSize
        // For image and shape: maintain aspect ratio ONLY when Shift is held
        const isCorner = ['nw', 'ne', 'se', 'sw'].includes(dir);
        const keepRatio = (isCorner && layer.type === 'text') || e.shiftKey;

        if (keepRatio && drag.layerW > 0 && drag.layerH > 0) {
          const ratio = drag.layerW / drag.layerH;
          const isHorizontalEdge = dir === 'e' || dir === 'w';
          const isVerticalEdge = dir === 'n' || dir === 's';

          if (isHorizontalEdge) {
            newH = Math.max(10, Math.round(newW / ratio));
          } else if (isVerticalEdge) {
            newW = Math.max(10, Math.round(newH * ratio));
          } else {
            // Corner handles
            if (Math.abs(dx) > Math.abs(dy)) {
              newH = Math.max(10, Math.round(newW / ratio));
            } else {
              newW = Math.max(10, Math.round(newH * ratio));
            }
          }
        }

        // Adjust position so the opposite edge stays anchored
        // layer.x/y is the center point
        if (affectsLeft)   newX = drag.layerX + (drag.layerW - newW) / 2;
        if (affectsRight)  newX = drag.layerX + (newW - drag.layerW) / 2;
        if (affectsTop)    newY = drag.layerY + (drag.layerH - newH) / 2;
        if (affectsBottom) newY = drag.layerY + (newH - drag.layerH) / 2;

        const updates: Partial<Layer> = { x: Math.round(newX), y: Math.round(newY) };

        if (layer.type === 'text') {
          // Scale fontSize proportionally
          const scaleFactor = newW / drag.layerW;
          const newFontSize = Math.max(8, Math.round((drag.fontSize ?? 24) * scaleFactor));
          (updates as Partial<TextLayer>).fontSize = newFontSize;
        } else {
          (updates as any).width = Math.round(newW);
          (updates as any).height = Math.round(newH);
        }

        onUpdateLayerSilent(drag.layerId, updates);
        return;
      }

      // ── MOVE MODE ──
      if (!isDragging) return;

      const { layerId, layerX, layerY, offsetX, offsetY } = drag;

      let newLayerX = layerX + dx;
      let newLayerY = layerY + dy;

      let visualCenterX = newLayerX - offsetX;
      let visualCenterY = newLayerY - offsetY;

      const canvasCenterX = canvas.width / 2;
      const canvasCenterY = canvas.height / 2;

      let snapX: number | undefined;
      let snapY: number | undefined;
      let snapXIsCenter = false;
      let snapYIsCenter = false;
      const SNAP_THRESHOLD = 10 / scale;
      
      // Canvas center targets (marked as center)
      const snapTargetsX: { value: number; isCenter: boolean }[] = [
        { value: canvasCenterX, isCenter: true },
      ];
      const snapTargetsY: { value: number; isCenter: boolean }[] = [
        { value: canvasCenterY, isCenter: true },
      ];

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        const otherLayerCenters: { x: number; y: number }[] = [];
        const otherLayers = layers.filter(l => l.id !== layerId && l.visible && !l.locked);
        
        for (const l of otherLayers) {
          const bounds = getLayerBounds(l, ctx);
          if (bounds) {
            otherLayerCenters.push({
              x: bounds.x + bounds.width / 2,
              y: bounds.y + bounds.height / 2
            });
          }
        }

        for (let i = 0; i < otherLayerCenters.length; i++) {
          snapTargetsX.push({ value: otherLayerCenters[i].x, isCenter: false });
          snapTargetsY.push({ value: otherLayerCenters[i].y, isCenter: false });
          for (let j = i + 1; j < otherLayerCenters.length; j++) {
            snapTargetsX.push({ value: (otherLayerCenters[i].x + otherLayerCenters[j].x) / 2, isCenter: false });
            snapTargetsY.push({ value: (otherLayerCenters[i].y + otherLayerCenters[j].y) / 2, isCenter: false });
          }
        }
      }

      let minDiffX = Infinity;
      for (const target of snapTargetsX) {
        const diff = Math.abs(visualCenterX - target.value);
        if (diff < SNAP_THRESHOLD && diff < minDiffX) {
          minDiffX = diff;
          snapX = target.value;
          snapXIsCenter = target.isCenter;
        }
      }
      if (snapX !== undefined) {
        visualCenterX = snapX;
        newLayerX = visualCenterX + offsetX;
      }

      let minDiffY = Infinity;
      for (const target of snapTargetsY) {
        const diff = Math.abs(visualCenterY - target.value);
        if (diff < SNAP_THRESHOLD && diff < minDiffY) {
          minDiffY = diff;
          snapY = target.value;
          snapYIsCenter = target.isCenter;
        }
      }
      if (snapY !== undefined) {
        visualCenterY = snapY;
        newLayerY = visualCenterY + offsetY;
      }

      setSnapLines({ x: snapX, y: snapY, xIsCenter: snapXIsCenter, yIsCenter: snapYIsCenter });
      onMoveLayer(layerId, Math.round(newLayerX), Math.round(newLayerY));
    },
    [isDragging, isResizing, getCanvasCoords, onMoveLayer, onUpdateLayer, handleCanvasHover, canvas.width, canvas.height, scale, layers],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
    dragStartRef.current = null;
    setSnapLines(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden relative"
      style={{ 
        cursor: isSpacePressed ? 'grab' : (isPanning ? 'grabbing' : 'default'),
        backgroundColor: canvas.workspaceColor || 'hsl(var(--muted) / 0.3)',
        backgroundImage: 'radial-gradient(hsl(var(--muted-foreground) / 0.2) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
      onMouseDown={handleContainerMouseDown}
      onMouseMove={handleContainerMouseMove}
      onMouseUp={handleContainerMouseUp}
      onMouseLeave={handleContainerMouseUp}
    >
      <div
        className="absolute top-0 left-0 shadow-lg"
        style={{
          width: canvas.width * scale,
          height: canvas.height * scale,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          transformOrigin: '0 0',
        }}
      >
        {/* Checkerboard pattern for transparent background indication */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(45deg, #e5e5e5 25%, transparent 25%),
              linear-gradient(-45deg, #e5e5e5 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #e5e5e5 75%),
              linear-gradient(-45deg, transparent 75%, #e5e5e5 75%)
            `,
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
          }}
        />
        <canvas
          ref={canvasRef}
          width={canvas.width}
          height={canvas.height}
          style={{
            width: canvas.width * scale,
            height: canvas.height * scale,
            position: 'relative',
            cursor: isSpacePressed || isPanning ? 'inherit' : handleCursor ? handleCursor : (isDragging || isResizing ? 'grabbing' : 'default'),
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
        />
        {/* Direct Text Editing Overlay */}
        {editingLayerId && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {(() => {
              const layer = layers.find((l) => l.id === editingLayerId) as TextLayer | undefined;
              if (!layer) return null;

              const textContent = getTransformedText(layer.content, layer.textTransform);
              const cvs = canvasRef.current;
              const ctx = cvs?.getContext('2d');
              let w = 200;
              if (ctx) {
                ctx.save();
                ctx.font = `${layer.fontWeight} ${layer.fontSize}px "${layer.fontFamily}"`;
                w = ctx.measureText(textContent || ' ').width + 40; // padding
                ctx.restore();
              }

              const sFontSize = layer.fontSize * scale;
              const sLetterSpacing = layer.letterSpacing * scale;
              const sWidth = Math.max(w * scale, 100);
              
              let left = layer.x * scale;
              if (layer.textAlign === 'center') left -= sWidth / 2;
              else if (layer.textAlign === 'right') left -= sWidth;
              
              const top = layer.y * scale;

              return (
                <>
                  <style>{`
                    .canvas-editor::selection {
                      background-color: rgba(59, 130, 246, 0.4) !important;
                      color: ${layer.color} !important;
                    }
                  `}</style>
                  <input
                    type="text"
                    autoFocus
                    value={layer.content}
                    onChange={(e) => {
                      if (onUpdateLayer) onUpdateLayer(layer.id, { content: e.target.value });
                    }}
                    onBlur={() => {
                      setEditingLayerId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    className="canvas-editor absolute pointer-events-auto bg-transparent outline-none m-0 p-0 overflow-hidden"
                    style={{
                      left: `${left}px`,
                      top: `${top}px`,
                      transform: 'translateY(-50%)',
                      width: `${sWidth}px`,
                      height: `${sFontSize * 1.5}px`,
                      fontFamily: `"${layer.fontFamily}", sans-serif`,
                      fontSize: `${sFontSize}px`,
                      fontWeight: layer.fontWeight,
                      color: layer.color,
                      textAlign: layer.textAlign,
                      letterSpacing: `${sLetterSpacing}px`,
                      textTransform: layer.textTransform === 'uppercase' ? 'uppercase' : layer.textTransform === 'lowercase' ? 'lowercase' : 'none',
                      lineHeight: `${sFontSize * 1.5}px`,
                      caretColor: layer.color,
                    }}
                  />
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Canvas info & Zoom controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 font-medium text-muted-foreground bg-background/90 px-2 py-1.5 rounded shadow-md backdrop-blur-sm border border-border/50 z-10">
        <span className="text-xs">尺寸: {canvas.width} × {canvas.height}</span>
        <div className="w-px h-3 bg-border" />
        <span className="text-xs w-10 text-center">{Math.round(scale * 100)}%</span>
        <button 
          onClick={fitToView}
          className="hover:text-foreground hover:bg-muted p-1 rounded transition-colors"
          title="适应屏幕并居中 (Fit to View)"
        >
          <Maximize className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Export the canvas content as a PNG blob.
 * This is a utility function called from outside the component.
 */
export function exportCanvasToBlob(
  canvasSettings: CanvasSettings,
  layers: Layer[],
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const cvs = document.createElement('canvas');
    cvs.width = canvasSettings.width;
    cvs.height = canvasSettings.height;
    const ctx = cvs.getContext('2d');
    if (!ctx) {
      resolve(null);
      return;
    }

    // Background
    if (!canvasSettings.transparent) {
      ctx.fillStyle = canvasSettings.backgroundColor;
      ctx.fillRect(0, 0, canvasSettings.width, canvasSettings.height);
    } else if (canvasSettings.exportFormat === 'jpeg') {
      // JPEG does not support transparency, fallback to the background color or white
      ctx.fillStyle = canvasSettings.backgroundColor || '#FFFFFF';
      ctx.fillRect(0, 0, canvasSettings.width, canvasSettings.height);
    }

    // Render layers
    for (const layer of layers) {
      if (!layer.visible) continue;
      withRotation(ctx, layer, () => {
        if (layer.type === 'text') {
          renderTextLayer(ctx, layer);
        } else if (layer.type === 'image') {
          renderImageLayer(ctx, layer);
        } else if (layer.type === 'shape') {
          renderShapeLayer(ctx, layer);
        }
      });
    }

    // Draw canvas border if set
    if (canvasSettings.borderWidth && canvasSettings.borderWidth > 0) {
      const bw = canvasSettings.borderWidth;
      ctx.strokeStyle = canvasSettings.borderColor || '#000000';
      ctx.lineWidth = bw;
      ctx.strokeRect(bw / 2, bw / 2, canvasSettings.width - bw, canvasSettings.height - bw);
    }

    const format = canvasSettings.exportFormat === 'jpeg' ? 'image/jpeg' 
      : canvasSettings.exportFormat === 'webp' ? 'image/webp' 
      : 'image/png';
    const quality = canvasSettings.exportQuality ?? 0.9;

    cvs.toBlob((blob) => resolve(blob), format, quality);
  });
}
