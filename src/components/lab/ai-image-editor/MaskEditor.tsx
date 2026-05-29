/**
 * MaskEditor.tsx — 遮罩涂鸦编辑器 (Overlay)
 *
 * 功能：画笔 / 矩形 / 椭圆 / 橡皮擦 / 撤回 / 重做
 * 底层显示原图，上层透明 Canvas 用于遮罩涂鸦。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAiImageEditorStore } from './useAiImageEditorStore';
import { generateInpaint } from './api';
import { saveGeneratedImage } from './fs';
import { toast } from '@/hooks/useToast';
import { useUIStore } from '@/stores';
import type { BrushTool } from './types';
import {
  Paintbrush, Eraser, Square, Circle as CircleIcon,
  Undo2, Redo2, Trash2, X, Send, Minus, Plus,
} from 'lucide-react';

const MASK_COLOR = 'rgba(255, 0, 0, 0.45)';

export default function MaskEditor() {
  const { editingNodeId, nodes, setEditingNode, addGeneratedNode, updateNode } = useAiImageEditorStore();
  const node = nodes.find((n) => n.id === editingNodeId);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<BrushTool>('brush');
  const [brushSize, setBrushSize] = useState(30);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 绘画状态
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const shapeStart = useRef<{ x: number; y: number } | null>(null);
  const shapePreviewCanvas = useRef<HTMLCanvasElement | null>(null);

  // 图片加载
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });

  // 加载图片并初始化 canvas
  useEffect(() => {
    if (!node) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);

      // 适配容器尺寸
      const container = containerRef.current;
      if (!container) return;
      const maxW = container.clientWidth - 40;
      const maxH = container.clientHeight - 40;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      setDisplaySize({ w, h });

      // 初始化 canvas
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;

      // 如果已有遮罩数据，加载
      if (node.maskData) {
        const maskImg = new Image();
        maskImg.onload = () => {
          ctx.drawImage(maskImg, 0, 0);
          saveSnapshot();
        };
        maskImg.src = node.maskData;
      } else {
        saveSnapshot();
      }
    };
    img.src = node.imageData;

    // 填充已有 prompt
    setPrompt(node.prompt || '');
    setNegativePrompt(node.negativePrompt || '');
  }, [node?.id]);

  // ─── 历史快照 ────────────────────────────────────────────
  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => {
      const newHist = prev.slice(0, historyIndex + 1);
      newHist.push(data);
      return newHist.length > 50 ? newHist.slice(-50) : newHist;
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 49));
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIdx = historyIndex - 1;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(history[newIdx], 0, 0);
    setHistoryIndex(newIdx);
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const newIdx = historyIndex + 1;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(history[newIdx], 0, 0);
    setHistoryIndex(newIdx);
  }, [history, historyIndex]);

  const clearMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveSnapshot();
  }, [saveSnapshot]);

  // ─── 坐标转换 ────────────────────────────────────────────
  const getCanvasPos = useCallback((e: React.MouseEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  // ─── 绘制逻辑 ────────────────────────────────────────────
  const drawLine = useCallback((ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }) => {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const pos = getCanvasPos(e);
    if (!pos) return;
    isDrawing.current = true;
    lastPos.current = pos;

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    if (tool === 'brush' || tool === 'eraser') {
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = MASK_COLOR;
      }
      // 画一个点
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = tool === 'eraser' ? 'rgba(0,0,0,1)' : MASK_COLOR;
      ctx.fill();
    } else {
      // 矩形/椭圆: 保存起始点和当前画面
      shapeStart.current = pos;
      const preview = document.createElement('canvas');
      preview.width = canvas.width;
      preview.height = canvas.height;
      preview.getContext('2d')!.drawImage(canvas, 0, 0);
      shapePreviewCanvas.current = preview;
    }
  }, [tool, brushSize, getCanvasPos]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing.current) return;
    const pos = getCanvasPos(e);
    if (!pos) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    if (tool === 'brush' || tool === 'eraser') {
      if (lastPos.current) drawLine(ctx, lastPos.current, pos);
      lastPos.current = pos;
    } else if (shapeStart.current && shapePreviewCanvas.current) {
      // 还原到拖拽前状态再画预览
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(shapePreviewCanvas.current, 0, 0);
      ctx.fillStyle = MASK_COLOR;
      const sx = shapeStart.current.x, sy = shapeStart.current.y;
      const w = pos.x - sx, h = pos.y - sy;
      if (tool === 'rect') {
        ctx.fillRect(sx, sy, w, h);
      } else {
        ctx.beginPath();
        ctx.ellipse(sx + w / 2, sy + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [tool, getCanvasPos, drawLine]);

  const handleMouseUp = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPos.current = null;
    shapeStart.current = null;
    shapePreviewCanvas.current = null;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.globalCompositeOperation = 'source-over';

    saveSnapshot();
  }, [saveSnapshot]);

  // ─── 快捷键 ──────────────────────────────────────────────
  useEffect(() => {
    if (!editingNodeId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '[') setBrushSize((s) => Math.max(2, s - 5));
      else if (e.key === ']') setBrushSize((s) => Math.min(200, s + 5));
      else if (e.key.toLowerCase() === 'e') setTool('eraser');
      else if (e.key.toLowerCase() === 'b') setTool('brush');
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
      else if (e.key === 'Escape') setEditingNode(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingNodeId, undo, redo, setEditingNode]);

  // ─── 导出遮罩并生成 ─────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!node || !canvasRef.current) return;
    if (!prompt.trim()) {
      toast({ title: '请输入 Prompt', description: '描述你想要的编辑效果', variant: 'destructive' });
      return;
    }

    // 导出纯白/黑遮罩
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = canvasRef.current.width;
    maskCanvas.height = canvasRef.current.height;
    const maskCtx = maskCanvas.getContext('2d')!;
    // 黑底
    maskCtx.fillStyle = '#000000';
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    // 将涂鸦区域转为白色
    const srcCtx = canvasRef.current.getContext('2d')!;
    const srcData = srcCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    for (let i = 0; i < srcData.data.length; i += 4) {
      if (srcData.data[i + 3] > 10) { // 有内容的像素
        maskData.data[i] = 255;
        maskData.data[i + 1] = 255;
        maskData.data[i + 2] = 255;
        maskData.data[i + 3] = 255;
      }
    }
    maskCtx.putImageData(maskData, 0, 0);
    const maskDataUrl = maskCanvas.toDataURL('image/png');
    const maskOverlayUrl = canvasRef.current.toDataURL('image/png');

    // 获取供应商配置
    const settings = useUIStore.getState().settings;
    const providerId = settings.aiImageEditorProvider || 'mock';
    const providerConfig = settings.aiImageEditorProviderConfig || {};

    setIsGenerating(true);
    updateNode(node.id, { isGenerating: true, error: undefined });

    try {
      const result = await generateInpaint(node.imageData, maskDataUrl, prompt.trim(), negativePrompt.trim() || undefined);

      const resultDataUrl = `data:image/png;base64,${result.image}`;

      // 保存到本地
      const filename = `gen_${Date.now()}.png`;
      try {
        await saveGeneratedImage(result.image, filename);
      } catch (e) {
        console.warn('Failed to save generated image to disk:', e);
      }

      // 创建子节点
      addGeneratedNode(
        node.id,
        resultDataUrl,
        node.width,
        node.height,
        prompt.trim(),
        negativePrompt.trim() || undefined,
        maskOverlayUrl,
        providerId,
        providerConfig,
        result.seed,
      );

      updateNode(node.id, { isGenerating: false });
      toast({ title: '生成成功', description: `Seed: ${result.seed ?? 'N/A'}` });
      setEditingNode(null);
    } catch (e: any) {
      console.error('Generation failed:', e);
      updateNode(node.id, { isGenerating: false, error: e?.message || String(e) });
      toast({ title: '生成失败', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  }, [node, prompt, negativePrompt, addGeneratedNode, updateNode, setEditingNode]);

  if (!editingNodeId || !node) return null;

  const tools: { id: BrushTool; icon: any; label: string }[] = [
    { id: 'brush', icon: Paintbrush, label: '画笔 (B)' },
    { id: 'eraser', icon: Eraser, label: '橡皮擦 (E)' },
    { id: 'rect', icon: Square, label: '矩形遮罩' },
    { id: 'ellipse', icon: CircleIcon, label: '椭圆遮罩' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-card border-b border-border">
        <div className="flex items-center gap-1">
          {/* 绘图工具 */}
          {tools.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.label}
              className={`p-2 rounded-none transition-colors ${
                tool === t.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
              }`}
              onClick={() => setTool(t.id)}
            >
              <t.icon className="w-4 h-4" />
            </button>
          ))}

          <div className="w-px h-6 bg-border mx-2" />

          {/* 画笔大小 */}
          <button type="button" className="p-1 hover:bg-muted" onClick={() => setBrushSize((s) => Math.max(2, s - 5))}>
            <Minus className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-1.5 min-w-[80px]">
            <input
              type="range"
              min={2}
              max={200}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-16 accent-primary"
            />
            <span className="text-xs text-muted-foreground w-8 text-right">{brushSize}px</span>
          </div>
          <button type="button" className="p-1 hover:bg-muted" onClick={() => setBrushSize((s) => Math.min(200, s + 5))}>
            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          </button>

          <div className="w-px h-6 bg-border mx-2" />

          {/* 撤回/重做/清除 */}
          <button type="button" title="撤回 (Ctrl+Z)" className="p-2 hover:bg-muted text-muted-foreground disabled:opacity-30" disabled={historyIndex <= 0} onClick={undo}>
            <Undo2 className="w-4 h-4" />
          </button>
          <button type="button" title="重做 (Ctrl+Y)" className="p-2 hover:bg-muted text-muted-foreground disabled:opacity-30" disabled={historyIndex >= history.length - 1} onClick={redo}>
            <Redo2 className="w-4 h-4" />
          </button>
          <button type="button" title="清除全部" className="p-2 hover:bg-muted text-muted-foreground" onClick={clearMask}>
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* 关闭按钮 */}
        <button
          type="button"
          className="p-2 hover:bg-muted text-muted-foreground"
          onClick={() => setEditingNode(null)}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 画布区域 */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center overflow-hidden">
        {imgLoaded && (
          <div className="relative" style={{ width: displaySize.w, height: displaySize.h }}>
            {/* 底层原图 */}
            <img
              src={node.imageData}
              alt="原图"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
            {/* 遮罩 Canvas */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ cursor: tool === 'eraser' ? 'crosshair' : 'crosshair' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          </div>
        )}
      </div>

      {/* 底部 Prompt 输入栏 */}
      <div className="bg-card border-t border-border px-4 py-3">
        <div className="flex items-end gap-3 max-w-4xl mx-auto">
          <div className="flex-1 space-y-2">
            <input
              type="text"
              className="w-full bg-muted border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
              placeholder="描述你想要的编辑效果..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
            />
            <input
              type="text"
              className="w-full bg-muted border border-border px-3 py-1.5 text-xs text-muted-foreground focus:outline-none focus:border-primary transition-colors"
              placeholder="负面提示词 (可选)..."
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
            />
          </div>
          <button
            type="button"
            disabled={isGenerating || !prompt.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            onClick={handleGenerate}
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                生成
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
