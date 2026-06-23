import { useState, useRef, useCallback } from 'react';
import { generateInpaint } from '../ai-image-editor/api';
import { saveFile, getDefaultExportPath } from '../image-compressor/fs';
import { toast } from '@/hooks/useToast';
import { Upload, Eraser, Download, Paintbrush, PlayCircle, Loader2 } from 'lucide-react';
import { pickSingleFile } from '@/lib/tauriFilePicker';

export default function WatermarkRemover() {
  const [image, setImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [brushSize, setBrushSize] = useState(20);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const handlePickImage = useCallback(async () => {
    try {
      const picked = await pickSingleFile({
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'],
        filterName: '图片文件',
      });
      if (picked) {
        setImage(picked.dataUrl);
        setResultImage(null);
      }
    } catch (error) {
      console.error('Failed to pick image:', error);
    }
  }, []);

  const getCanvasPos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getCanvasPos(e);
    if (!pos) return;
    isDrawing.current = true;
    lastPos.current = pos;

    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
      ctx.fill();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing.current) return;
    const pos = getCanvasPos(e);
    if (!pos || !lastPos.current) return;
    
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
    lastPos.current = pos;
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
    lastPos.current = null;
  };

  const clearMask = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const removeWatermark = async () => {
    if (!image || !canvasRef.current) return;
    
    // Create binary mask for API
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = canvasRef.current.width;
    maskCanvas.height = canvasRef.current.height;
    const maskCtx = maskCanvas.getContext('2d')!;
    
    // Fill black
    maskCtx.fillStyle = '#000000';
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    
    // Copy painted areas as white
    const srcCtx = canvasRef.current.getContext('2d')!;
    const srcData = srcCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    
    let hasMask = false;
    for (let i = 0; i < srcData.data.length; i += 4) {
      if (srcData.data[i + 3] > 10) { // If painted
        maskData.data[i] = 255;
        maskData.data[i + 1] = 255;
        maskData.data[i + 2] = 255;
        maskData.data[i + 3] = 255;
        hasMask = true;
      }
    }
    
    if (!hasMask) {
      toast({ title: '未检测到涂抹区域', description: '请先在图片上涂抹水印区域', variant: 'destructive' });
      return;
    }
    
    maskCtx.putImageData(maskData, 0, 0);
    const maskDataUrl = maskCanvas.toDataURL('image/png');
    
    setIsProcessing(true);
    try {
      const result = await generateInpaint(
        image, 
        maskDataUrl, 
        "Remove watermark, heal the image, seamlessly blend with the background", 
        "watermark, text, logo"
      );
      setResultImage(`data:image/png;base64,${result.image}`);
      toast({ title: '去水印成功', description: '已成功移除涂抹区域的水印' });
    } catch (e: any) {
      toast({ title: '处理失败', description: e.message || '去水印失败', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const saveResult = async () => {
    if (!resultImage) return;
    try {
      const path = await getDefaultExportPath();
      const res = await fetch(resultImage);
      const blob = await res.blob();
      const buffer = await blob.arrayBuffer();
      const filename = `watermark_removed_${Date.now()}.png`;
      await saveFile(path, filename, new Uint8Array(buffer));
      toast({ title: '保存成功', description: `文件已保存至: ${path}` });
    } catch (e) {
      console.error(e);
      toast({ title: '保存失败', variant: 'destructive' });
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/40 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-md font-medium text-sm">
            <Eraser className="w-4 h-4" />
            智能去水印
          </div>
          <div className="text-xs text-muted-foreground">
            上传图片，涂抹水印区域，AI 一键无痕去除。
          </div>
        </div>
        <div className="flex items-center gap-2">
          {image && !resultImage && (
            <>
              <button 
                onClick={() => { setImage(null); clearMask(); }} 
                className="text-xs px-3 py-1.5 rounded bg-muted hover:bg-muted/80 text-foreground transition-colors"
              >
                重新选择
              </button>
              <button onClick={clearMask} className="text-xs px-3 py-1.5 rounded bg-muted hover:bg-muted/80 text-foreground transition-colors">
                清空涂鸦
              </button>
              <button 
                onClick={removeWatermark} 
                disabled={isProcessing}
                className="text-xs px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground transition-colors flex items-center gap-1"
              >
                {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                {isProcessing ? '处理中...' : '开始去水印'}
              </button>
            </>
          )}
          {resultImage && (
            <button 
              onClick={saveResult} 
              className="text-xs px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-600 text-white transition-colors flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              保存结果
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden bg-slate-900/5 dark:bg-black/10">
        {!image ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 select-none">
            <div
              className="w-full max-w-lg aspect-[16/10] bg-card border-2 border-dashed border-border/80 hover:border-primary/50 hover:shadow-lg rounded-xl flex flex-col items-center justify-center p-8 text-center transition-all cursor-pointer group"
              onClick={handlePickImage}
            >
              <div className="w-16 h-16 rounded-full bg-primary/5 group-hover:bg-primary/10 text-primary/70 flex items-center justify-center transition-all mb-5 group-hover:scale-105">
                <Upload className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-foreground mb-2">
                上传需要去水印的图片
              </h3>
              <p className="text-xs text-muted-foreground">
                支持拖拽或点击上传本地图片。
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-4 relative" ref={containerRef}>
            <div className="relative max-w-full max-h-full border border-border/50 shadow-sm rounded overflow-hidden flex bg-transparent">
              {resultImage ? (
                <img src={resultImage} alt="Result" className="max-w-full max-h-[80vh] object-contain" />
              ) : (
                <>
                  <img 
                    src={image} 
                    alt="Source" 
                    className="max-w-full max-h-[80vh] object-contain pointer-events-none" 
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      const canvas = canvasRef.current;
                      if (canvas) {
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                      }
                    }}
                  />
                  <canvas
                    ref={canvasRef}
                    className="absolute top-0 left-0 w-full h-full cursor-crosshair opacity-70"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  />
                </>
              )}
            </div>
            
            {/* Toolbar overlay */}
            {!resultImage && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-card border border-border shadow-lg rounded-full px-4 py-2 flex items-center gap-3 select-none">
                <Paintbrush className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium">画笔大小</span>
                <input 
                  type="range" 
                  min="5" 
                  max="100" 
                  value={brushSize} 
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-24 accent-primary"
                />
              </div>
            )}
            
            {/* Go back button overlay */}
            {resultImage && (
              <div className="absolute top-4 left-4">
                <button 
                  onClick={() => { setResultImage(null); clearMask(); }}
                  className="px-3 py-1.5 bg-card border border-border shadow text-xs rounded hover:bg-muted transition-colors"
                >
                  返回重试
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
