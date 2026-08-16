import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ExportConfig, SliceItem } from './types';
import { processSliceToCanvas } from './utils';
import {
  Move,
  Eraser,
  Paintbrush,
  RotateCcw,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Check,
  X,
  Crosshair,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Sun,
  Moon,
  Grid,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TooltipProvider } from '@/components/ui/tooltip';

interface SliceEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  slice: SliceItem | null;
  sliceIndex: number;
  imageSrc: string;
  exportConfig: ExportConfig;
  onSave: (sliceId: string, customDataUrl: string | null) => void;
}

type EditTool = 'move' | 'eraser' | 'brush';
type CanvasBg = 'transparent' | 'white' | 'dark';

export default function SliceEditorModal({
  isOpen,
  onClose,
  slice,
  sliceIndex,
  imageSrc,
  exportConfig,
  onSave,
}: SliceEditorModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Tools & settings
  const [tool, setTool] = useState<EditTool>('move');
  const [eraserSize, setEraserSize] = useState<number>(20);
  const [brushSize, setBrushSize] = useState<number>(10);
  const [brushColor, setBrushColor] = useState<string>('#ffffff');
  const [canvasBg, setCanvasBg] = useState<CanvasBg>('transparent');
  const [showCrosshair, setShowCrosshair] = useState<boolean>(true);
  const [viewZoom, setViewZoom] = useState<number>(1.5);

  // Position transform params (for Move tool)
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  const [scale, setScale] = useState<number>(1);

  // History stack
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Interaction states
  const [isInteracting, setIsInteracting] = useState<boolean>(false);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  // Cached base slice image for move/scale redraws before eraser modifications
  const rawCroppedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialDataUrlRef = useRef<string | null>(null);

  // Resolve target dimensions
  const targetW = slice
    ? exportConfig.width > 0
      ? exportConfig.width
      : slice.width
    : 240;
  const targetH = slice
    ? exportConfig.height > 0
      ? exportConfig.height
      : slice.height
    : 240;

  // Initialize slice when modal opens or slice changes
  const initSliceCanvas = useCallback(() => {
    if (!slice || !imageSrc) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // 1. Prepare raw slice canvas from original source
      const rawCanvas = document.createElement('canvas');
      rawCanvas.width = slice.width;
      rawCanvas.height = slice.height;
      const rawCtx = rawCanvas.getContext('2d');
      if (rawCtx) {
        rawCtx.drawImage(
          img,
          slice.x,
          slice.y,
          slice.width,
          slice.height,
          0,
          0,
          slice.width,
          slice.height
        );
      }
      rawCroppedCanvasRef.current = rawCanvas;

      // 2. Setup the working canvas
      const workingCanvas = canvasRef.current;
      if (!workingCanvas) return;
      workingCanvas.width = targetW;
      workingCanvas.height = targetH;
      const ctx = workingCanvas.getContext('2d');
      if (!ctx) return;

      if (slice.customDataUrl) {
        // Load user's previous edits
        initialDataUrlRef.current = slice.customDataUrl;
        const customImg = new Image();
        customImg.onload = () => {
          ctx.clearRect(0, 0, targetW, targetH);
          ctx.drawImage(customImg, 0, 0, targetW, targetH);
          const initialSnapshot = ctx.getImageData(0, 0, targetW, targetH);
          setHistory([initialSnapshot]);
          setHistoryIndex(0);
        };
        customImg.src = slice.customDataUrl;
      } else {
        // Generate default processed slice
        const defaultCanvas = processSliceToCanvas(img, slice, {
          width: targetW,
          height: targetH,
          mode: exportConfig.mode,
          backgroundColor: 'transparent',
          format: 'png',
        });

        ctx.clearRect(0, 0, targetW, targetH);
        ctx.drawImage(defaultCanvas, 0, 0);
        initialDataUrlRef.current = defaultCanvas.toDataURL('image/png');

        const initialSnapshot = ctx.getImageData(0, 0, targetW, targetH);
        setHistory([initialSnapshot]);
        setHistoryIndex(0);
      }

      setOffsetX(0);
      setOffsetY(0);
      setScale(1);
    };
    img.src = imageSrc;
  }, [exportConfig.mode, imageSrc, slice, targetH, targetW]);

  useEffect(() => {
    if (isOpen && slice) {
      initSliceCanvas();
    }
  }, [isOpen, slice, initSliceCanvas]);

  // Push current canvas state to history
  const pushHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      if (trimmed.length >= 25) trimmed.shift();
      return [...trimmed, snapshot];
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 24));
  }, [historyIndex]);

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    const prevIndex = historyIndex - 1;
    const snapshot = history[prevIndex];
    if (snapshot && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.putImageData(snapshot, 0, 0);
        setHistoryIndex(prevIndex);
      }
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    const snapshot = history[nextIndex];
    if (snapshot && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.putImageData(snapshot, 0, 0);
        setHistoryIndex(nextIndex);
      }
    }
  }, [history, historyIndex]);

  // Keyboard shortcuts (Undo: Ctrl+Z, Redo: Ctrl+Y)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'v' || e.key === 'm') {
        setTool('move');
      } else if (e.key === 'e') {
        setTool('eraser');
      } else if (e.key === 'b') {
        setTool('brush');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleRedo, handleUndo]);

  // Get canvas coordinates from mouse event
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  // Redraw image with transformed position & scale (Move tool)
  const applyTransform = (newDx: number, newDy: number, newScale: number) => {
    if (!rawCroppedCanvasRef.current || !canvasRef.current || !slice) return;
    const rawCanvas = rawCroppedCanvasRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Base fitting
    let dw = slice.width;
    let dh = slice.height;
    if (slice.width > targetW || slice.height > targetH || exportConfig.mode === 'scale-down') {
      const ratio = Math.min(targetW / slice.width, targetH / slice.height);
      dw = slice.width * ratio;
      dh = slice.height * ratio;
    }

    // Apply scale multiplier
    dw *= newScale;
    dh *= newScale;

    // Centered base offset + user delta
    const baseX = (targetW - dw) / 2 + newDx;
    const baseY = (targetH - dh) / 2 + newDy;

    ctx.clearRect(0, 0, targetW, targetH);
    ctx.drawImage(rawCanvas, baseX, baseY, dw, dh);
  };

  // Mouse Handlers for Canvas
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Only left click
    const pt = getCanvasCoords(e);
    setIsInteracting(true);
    setLastPoint(pt);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (tool === 'eraser') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, eraserSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (tool === 'brush') {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = brushColor;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getCanvasCoords(e);
    setCursorPos(pt);

    if (!isInteracting || !lastPoint) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (tool === 'move') {
      const deltaX = pt.x - lastPoint.x;
      const deltaY = pt.y - lastPoint.y;
      const nextX = offsetX + deltaX;
      const nextY = offsetY + deltaY;
      setOffsetX(nextX);
      setOffsetY(nextY);
      applyTransform(nextX, nextY, scale);
      setLastPoint(pt);
    } else if (tool === 'eraser') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.lineWidth = eraserSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
      setLastPoint(pt);
    } else if (tool === 'brush') {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = brushColor;
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
      setLastPoint(pt);
    }
  };

  const handleMouseUp = () => {
    if (isInteracting) {
      setIsInteracting(false);
      setLastPoint(null);
      pushHistory();
    }
  };

  const handleMouseLeave = () => {
    setCursorPos(null);
    if (isInteracting) {
      setIsInteracting(false);
      setLastPoint(null);
      pushHistory();
    }
  };

  // Reset to original automatic slice
  const handleResetToDefault = () => {
    if (!rawCroppedCanvasRef.current || !slice || !canvasRef.current) return;
    setOffsetX(0);
    setOffsetY(0);
    setScale(1);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const defaultCanvas = processSliceToCanvas(img, slice, {
        width: targetW,
        height: targetH,
        mode: exportConfig.mode,
        backgroundColor: 'transparent',
        format: 'png',
      });
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, targetW, targetH);
        ctx.drawImage(defaultCanvas, 0, 0);
        pushHistory();
      }
    };
    img.src = imageSrc;
  };

  // Save current slice
  const handleApplySave = () => {
    if (!slice || !canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSave(slice.id, dataUrl);
    onClose();
  };

  // Revert / Clear custom edits completely
  const handleRevertOriginal = () => {
    if (!slice) return;
    onSave(slice.id, null);
    onClose();
  };

  if (!isOpen || !slice) return null;

  return (
    <TooltipProvider>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none animate-in fade-in duration-200">
        <div className="bg-card text-card-foreground border border-border w-full max-w-5xl h-[88vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-border bg-muted/40 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold">切片精细调整与擦除</h2>
                  <Badge variant="outline" className="font-mono text-xs">
                    #{sliceIndex + 1} (R{slice.row} C{slice.col})
                  </Badge>
                  {slice.isEdited && (
                    <Badge variant="default" className="bg-blue-600 text-white text-[10px]">
                      已自定义编辑
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  目标画布: {targetW} × {targetH} px · 源切片: {Math.round(slice.width)} × {Math.round(slice.height)} px
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Main workspace */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Toolbar & Controls */}
            <div className="w-80 border-r border-border bg-card/60 flex flex-col justify-between overflow-y-auto p-4 gap-4 custom-scrollbar">
              <div className="flex flex-col gap-4">
                {/* Tool Selector */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                    操作工具
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted/70 rounded-lg border border-border/50">
                    <button
                      type="button"
                      onClick={() => setTool('move')}
                      className={`flex flex-col items-center justify-center py-2 px-1 rounded-md text-xs font-medium transition-all ${
                        tool === 'move'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      <Move className="w-4 h-4 mb-1" />
                      位置微调
                    </button>
                    <button
                      type="button"
                      onClick={() => setTool('eraser')}
                      className={`flex flex-col items-center justify-center py-2 px-1 rounded-md text-xs font-medium transition-all ${
                        tool === 'eraser'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      <Eraser className="w-4 h-4 mb-1" />
                      橡皮擦
                    </button>
                    <button
                      type="button"
                      onClick={() => setTool('brush')}
                      className={`flex flex-col items-center justify-center py-2 px-1 rounded-md text-xs font-medium transition-all ${
                        tool === 'brush'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      <Paintbrush className="w-4 h-4 mb-1" />
                      修补画笔
                    </button>
                  </div>
                </div>

                {/* Tool specific settings */}
                {tool === 'move' && (
                  <div className="p-3 bg-muted/30 rounded-lg border border-border/50 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">位置偏移 (X, Y)</span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {Math.round(offsetX)}px, {Math.round(offsetY)}px
                      </span>
                    </div>

                    {/* D-Pad controls */}
                    <div className="flex flex-col items-center gap-1 my-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          const nextY = offsetY - 2;
                          setOffsetY(nextY);
                          applyTransform(offsetX, nextY, scale);
                          pushHistory();
                        }}
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            const nextX = offsetX - 2;
                            setOffsetX(nextX);
                            applyTransform(nextX, offsetY, scale);
                            pushHistory();
                          }}
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => {
                            setOffsetX(0);
                            setOffsetY(0);
                            applyTransform(0, 0, scale);
                            pushHistory();
                          }}
                        >
                          居中
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            const nextX = offsetX + 2;
                            setOffsetX(nextX);
                            applyTransform(nextX, offsetY, scale);
                            pushHistory();
                          }}
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          const nextY = offsetY + 2;
                          setOffsetY(nextY);
                          applyTransform(offsetX, nextY, scale);
                          pushHistory();
                        }}
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {/* Scale */}
                    <div className="space-y-1.5 pt-1 border-t border-border/40">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">缩放比例</span>
                        <span className="font-mono text-muted-foreground">
                          {Math.round(scale * 100)}%
                        </span>
                      </div>
                      <Slider
                        value={[scale]}
                        min={0.3}
                        max={2.5}
                        step={0.05}
                        onValueChange={([val]) => {
                          setScale(val);
                          applyTransform(offsetX, offsetY, val);
                        }}
                        onValueCommit={() => pushHistory()}
                      />
                    </div>
                  </div>
                )}

                {tool === 'eraser' && (
                  <div className="p-3 bg-muted/30 rounded-lg border border-border/50 flex flex-col gap-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">橡皮擦粗细</span>
                      <span className="font-mono text-muted-foreground">{eraserSize} px</span>
                    </div>
                    <Slider
                      value={[eraserSize]}
                      min={2}
                      max={80}
                      step={1}
                      onValueChange={([val]) => setEraserSize(val)}
                    />
                    <div className="flex items-center justify-between gap-1 pt-1">
                      {[4, 12, 24, 40, 60].map((size) => (
                        <Button
                          key={size}
                          variant={eraserSize === size ? 'default' : 'outline'}
                          size="sm"
                          className="h-6 text-[10px] px-1.5 flex-1"
                          onClick={() => setEraserSize(size)}
                        >
                          {size}
                        </Button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      💡 提示：在画布上涂抹可直接擦除不需要的边缘或背景。
                    </p>
                  </div>
                )}

                {tool === 'brush' && (
                  <div className="p-3 bg-muted/30 rounded-lg border border-border/50 flex flex-col gap-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">画笔粗细</span>
                      <span className="font-mono text-muted-foreground">{brushSize} px</span>
                    </div>
                    <Slider
                      value={[brushSize]}
                      min={1}
                      max={50}
                      step={1}
                      onValueChange={([val]) => setBrushSize(val)}
                    />
                    <div className="space-y-1.5 pt-1 border-t border-border/40">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">颜色</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={brushColor}
                            onChange={(e) => setBrushColor(e.target.value)}
                            className="w-5 h-5 rounded cursor-pointer border border-border p-0 bg-transparent"
                          />
                          <span className="font-mono text-[11px] uppercase">{brushColor}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 pt-1">
                        {['#ffffff', '#000000', '#ff0000', '#ffff00', '#00ff00', '#0000ff'].map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setBrushColor(c)}
                            className={`w-5 h-5 rounded-full border border-border/60 ${
                              brushColor.toLowerCase() === c ? 'ring-2 ring-primary ring-offset-1' : ''
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Canvas Background & Crosshair */}
                <div className="p-3 bg-muted/30 rounded-lg border border-border/50 flex flex-col gap-2.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    视图设置
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-xs">背景预览底色</span>
                    <div className="flex items-center gap-1 bg-muted p-0.5 rounded-md border border-border">
                      <Button
                        variant={canvasBg === 'transparent' ? 'default' : 'ghost'}
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setCanvasBg('transparent')}
                        title="透明棋盘"
                      >
                        <Grid className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant={canvasBg === 'white' ? 'default' : 'ghost'}
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setCanvasBg('white')}
                        title="纯白底色"
                      >
                        <Sun className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant={canvasBg === 'dark' ? 'default' : 'ghost'}
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setCanvasBg('dark')}
                        title="深黑底色"
                      >
                        <Moon className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs">中心十字参考线</span>
                    <Button
                      variant={showCrosshair ? 'default' : 'outline'}
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => setShowCrosshair(!showCrosshair)}
                    >
                      <Crosshair className="w-3.5 h-3.5 mr-1" />
                      {showCrosshair ? '显示' : '隐藏'}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs">视图放大</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setViewZoom((z) => Math.max(0.8, z - 0.25))}
                        disabled={viewZoom <= 0.8}
                      >
                        <ZoomOut className="w-3 h-3" />
                      </Button>
                      <span className="text-xs font-mono w-10 text-center">
                        {Math.round(viewZoom * 100)}%
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setViewZoom((z) => Math.min(3.5, z + 0.25))}
                        disabled={viewZoom >= 3.5}
                      >
                        <ZoomIn className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Undo / Redo & Reset Actions */}
              <div className="pt-3 border-t border-border flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUndo}
                    disabled={historyIndex <= 0}
                    className="text-xs h-8"
                  >
                    <Undo2 className="w-3.5 h-3.5 mr-1" />
                    撤销 (Ctrl+Z)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRedo}
                    disabled={historyIndex >= history.length - 1}
                    className="text-xs h-8"
                  >
                    <Redo2 className="w-3.5 h-3.5 mr-1" />
                    重做 (Ctrl+Y)
                  </Button>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetToDefault}
                  className="text-xs h-8 text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  重置为初始状态
                </Button>
              </div>
            </div>

            {/* Center Canvas Viewport */}
            <div
              ref={containerRef}
              className="flex-1 bg-slate-950/30 dark:bg-black/40 flex items-center justify-center p-8 overflow-auto relative select-none"
            >
              {/* Canvas Container with scaled display */}
              <div
                className="relative rounded-lg shadow-2xl border border-border/80 overflow-hidden transition-shadow"
                style={{
                  width: targetW * viewZoom,
                  height: targetH * viewZoom,
                }}
              >
                {/* Background Texture Layer */}
                <div
                  className={`absolute inset-0 pointer-events-none ${
                    canvasBg === 'transparent'
                      ? 'bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%),linear-gradient(-45deg,#e5e7eb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e7eb_75%),linear-gradient(-45deg,transparent_75%,#e5e7eb_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] dark:bg-[linear-gradient(45deg,#262626_25%,transparent_25%),linear-gradient(-45deg,#262626_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#262626_75%),linear-gradient(-45deg,transparent_75%,#262626_75%)]'
                      : canvasBg === 'white'
                        ? 'bg-white'
                        : 'bg-zinc-950'
                  }`}
                />

                {/* Primary Interactive Canvas */}
                <canvas
                  ref={canvasRef}
                  width={targetW}
                  height={targetH}
                  className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseLeave}
                />

                {/* Center Crosshair Overlay */}
                {showCrosshair && (
                  <div className="absolute inset-0 pointer-events-none opacity-40">
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-rose-500/80 border-t border-dashed border-rose-500" />
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-rose-500/80 border-l border-dashed border-rose-500" />
                  </div>
                )}

                {/* Eraser / Brush Cursor Ring Indicator */}
                {cursorPos && (tool === 'eraser' || tool === 'brush') && (
                  <div
                    className="absolute pointer-events-none rounded-full border border-foreground/80 -translate-x-1/2 -translate-y-1/2 shadow-sm"
                    style={{
                      left: (cursorPos.x / targetW) * (targetW * viewZoom),
                      top: (cursorPos.y / targetH) * (targetH * viewZoom),
                      width: (tool === 'eraser' ? eraserSize : brushSize) * viewZoom,
                      height: (tool === 'eraser' ? eraserSize : brushSize) * viewZoom,
                      backgroundColor:
                        tool === 'eraser' ? 'rgba(239, 68, 68, 0.15)' : `${brushColor}33`,
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-muted/40 shrink-0">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] font-normal">
                提示
              </Badge>
              <span>在【位置微调】模式下可拖动调整居中，在【橡皮擦】模式下涂抹可擦除相邻切片的杂边。</span>
            </div>

            <div className="flex items-center gap-2.5">
              {slice.isEdited && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRevertOriginal}
                  className="text-xs h-9 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                >
                  清除自定义恢复原图
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onClose} className="text-xs h-9 px-4">
                取消
              </Button>
              <Button size="sm" onClick={handleApplySave} className="text-xs h-9 px-5 font-semibold">
                <Check className="w-4 h-4 mr-1.5" />
                应用保存此切片
              </Button>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
