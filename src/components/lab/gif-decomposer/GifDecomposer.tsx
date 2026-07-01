import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Film,
  Play, 
  Pause,
  SkipBack, 
  SkipForward, 
  RotateCcw,
  FolderOpen,
  CheckSquare,
  Square,
  Upload,
  Download,
  XCircle,
  Layers
} from 'lucide-react';
import { decodeAnimatedImage, DecodedAnimation } from './decoder';
import { saveFrameImage, openOutputFolder } from './fs';
import { toast } from '@/hooks/useToast';
import { pickSingleFile } from '@/lib/tauriFilePicker';

const CHECKERED_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath fill='%23e5e7eb' d='M0 0h8v8H0zM8 8h8v8H8z'/%3E%3C/svg%3E")`;

export default function GifDecomposer() {
  const [isDecoding, setIsDecoding] = useState(false);
  const [animation, setAnimation] = useState<DecodedAnimation | null>(null);
  const [filename, setFilename] = useState<string>('');
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 0.25, 0.5, 1, 2
  const [playSelectedOnly, setPlaySelectedOnly] = useState(false);
  
  // Export state
  const [selectedFrames, setSelectedFrames] = useState<Set<number>>(new Set());
  const [exportInterval, setExportInterval] = useState(1);
  const [exportFormat, setExportFormat] = useState<'png' | 'webp'>('png');
  const [exportMode, setExportMode] = useState<'sequence' | 'spritesheet' | 'animated'>('sequence');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playbackRef = useRef<number>();
  const lastFrameTimeRef = useRef<number>(0);
  const currentFrameIndexRef = useRef(0);
  const selectedFramesRef = useRef<Set<number>>(selectedFrames);
  const playSelectedOnlyRef = useRef(false);

  useEffect(() => {
    currentFrameIndexRef.current = currentFrameIndex;
  }, [currentFrameIndex]);

  useEffect(() => {
    selectedFramesRef.current = selectedFrames;
  }, [selectedFrames]);

  useEffect(() => {
    playSelectedOnlyRef.current = playSelectedOnly;
  }, [playSelectedOnly]);

  // Cleanup object URLs on unmount or reset
  useEffect(() => {
    return () => {
      if (animation) {
        animation.frames.forEach(f => {
          if (f.dataUrl.startsWith('blob:')) {
            URL.revokeObjectURL(f.dataUrl);
          }
        });
      }
    };
  }, [animation]);

  // Load image
  const handleLoadFile = useCallback(async (file: File) => {
    setIsDecoding(true);
    try {
      const decoded = await decodeAnimatedImage(file);
      setAnimation(decoded);
      setFilename(file.name);
      setCurrentFrameIndex(0);
      setIsPlaying(true);
      setSelectedFrames(new Set());
      setExportInterval(1);
      toast({
        title: '解码成功',
        description: `成功解析 ${decoded.frames.length} 帧 (${decoded.format.toUpperCase()})`,
      });
    } catch (e: any) {
      console.error(e);
      toast({
        title: '解码失败',
        description: e.message || String(e),
        variant: 'destructive'
      });
    } finally {
      setIsDecoding(false);
    }
  }, []);

  const handlePickFile = async () => {
    try {
      const picked = await pickSingleFile({
        extensions: ['gif', 'png', 'apng', 'webp'],
        filterName: '动图文件 (GIF/APNG/WebP)',
      });
      if (picked && picked.file) {
        handleLoadFile(picked.file);
      }
    } catch (error) {
      console.error('Failed to pick file:', error);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleLoadFile(e.dataTransfer.files[0]);
    }
  };

  // Playback Loop
  useEffect(() => {
    if (!animation || !isPlaying) {
      if (playbackRef.current) cancelAnimationFrame(playbackRef.current);
      return;
    }

    const loop = (timestamp: number) => {
      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = timestamp;
      }

      const elapsed = timestamp - lastFrameTimeRef.current;
      const currentFrame = animation.frames[currentFrameIndexRef.current];
      const targetDelay = currentFrame.delay / playbackSpeed;

      if (elapsed >= targetDelay) {
        let nextIndex = (currentFrameIndexRef.current + 1) % animation.frames.length;
        
        // Loop over selected frames only
        if (playSelectedOnlyRef.current && selectedFramesRef.current.size > 0) {
          let found = false;
          for (let i = 1; i <= animation.frames.length; i++) {
            const checkIndex = (currentFrameIndexRef.current + i) % animation.frames.length;
            if (selectedFramesRef.current.has(checkIndex)) {
              nextIndex = checkIndex;
              found = true;
              break;
            }
          }
          if (!found) {
            nextIndex = (currentFrameIndexRef.current + 1) % animation.frames.length;
          }
        }

        setCurrentFrameIndex(nextIndex);
        lastFrameTimeRef.current = timestamp - (elapsed % targetDelay);
      }

      playbackRef.current = requestAnimationFrame(loop);
    };

    playbackRef.current = requestAnimationFrame(loop);

    return () => {
      if (playbackRef.current) {
        cancelAnimationFrame(playbackRef.current);
      }
    };
  }, [animation, isPlaying, playbackSpeed]);

  // Render current frame to canvas
  useEffect(() => {
    if (!animation || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    
    const frame = animation.frames[currentFrameIndex];
    if (frame && frame.imageData) {
      ctx.putImageData(frame.imageData, 0, 0);
    }
  }, [animation, currentFrameIndex]);

  // Frame selection
  const toggleFrameSelection = (index: number, e?: React.MouseEvent) => {
    const newSet = new Set(selectedFrames);
    
    if (e?.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      // Fill the range
      for (let i = start; i <= end; i++) {
        newSet.add(i);
      }
    } else {
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
    }
    
    setSelectedFrames(newSet);
    setLastSelectedIndex(index);
  };

  const selectAll = () => {
    if (!animation) return;
    const all = new Set(animation.frames.map(f => f.index));
    setSelectedFrames(all);
    setLastSelectedIndex(null);
  };

  const selectNone = () => {
    setSelectedFrames(new Set());
    setLastSelectedIndex(null);
  };

  const selectByInterval = () => {
    if (!animation) return;
    const newSet = new Set<number>();
    for (let i = 0; i < animation.frames.length; i += exportInterval) {
      newSet.add(i);
    }
    setSelectedFrames(newSet);
    setLastSelectedIndex(null);
  };

  // Export
  const handleExport = async () => {
    if (!animation || selectedFrames.size === 0) {
      toast({ title: '无导出项', description: '请先勾选需要导出的帧' });
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      const framesToExport = Array.from(selectedFrames).sort((a, b) => a - b);
      const baseName = filename.replace(/\.[^/.]+$/, '');
      const total = framesToExport.length;
      
      const mimeType = exportFormat === 'png' ? 'image/png' : 'image/webp';

      if (exportMode === 'sequence') {
        for (let i = 0; i < total; i++) {
          const frameIndex = framesToExport[i];
          const frame = animation.frames[frameIndex];
          
          // Render to temporary canvas to convert to blob
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = animation.width;
          tempCanvas.height = animation.height;
          const ctx = tempCanvas.getContext('2d')!;
          ctx.putImageData(frame.imageData, 0, 0);

          const blob = await new Promise<Blob | null>(resolve => 
            tempCanvas.toBlob(resolve, mimeType)
          );

          if (blob) {
            const buffer = await blob.arrayBuffer();
            // e.g. "mygif_frame_001.png"
            const padIndex = String(frameIndex + 1).padStart(3, '0');
            const exportFilename = `${baseName}_frame_${padIndex}.${exportFormat}`;
            
            await saveFrameImage('', exportFilename, new Uint8Array(buffer));
          }

          setExportProgress(Math.round(((i + 1) / total) * 100));
        }
        
        toast({
          title: '导出序列成功',
          description: `已成功导出 ${total} 帧图片`,
        });
      } else if (exportMode === 'spritesheet') {
        // Calculate grid dimensions (roughly square)
        const cols = Math.ceil(Math.sqrt(total));
        const rows = Math.ceil(total / cols);
        
        const sheetCanvas = document.createElement('canvas');
        sheetCanvas.width = animation.width * cols;
        sheetCanvas.height = animation.height * rows;
        const sheetCtx = sheetCanvas.getContext('2d')!;
        
        for (let i = 0; i < total; i++) {
          const frameIndex = framesToExport[i];
          const frame = animation.frames[frameIndex];
          
          const col = i % cols;
          const row = Math.floor(i / cols);
          const dx = col * animation.width;
          const dy = row * animation.height;
          
          sheetCtx.putImageData(frame.imageData, dx, dy);
          setExportProgress(Math.round(((i + 1) / total) * 100));
        }
        
        const blob = await new Promise<Blob | null>(resolve => 
          sheetCanvas.toBlob(resolve, mimeType)
        );
        
        if (blob) {
          const buffer = await blob.arrayBuffer();
          const exportFilename = `${baseName}_spritesheet.${exportFormat}`;
          await saveFrameImage('', exportFilename, new Uint8Array(buffer));
        }
        
        toast({
          title: '导出长图成功',
          description: `已成功生成包含 ${total} 帧的拼图`,
        });
      } else if (exportMode === 'animated') {
        const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
        const gif = GIFEncoder();
        
        for (let i = 0; i < total; i++) {
          const frameIndex = framesToExport[i];
          const frame = animation.frames[frameIndex];
          const pixels = frame.imageData.data;
          
          // Quantize image to 256 colors
          const palette = quantize(pixels, 256, { format: 'rgba4444' });
          // Map image to palette
          const index = applyPalette(pixels, palette, { format: 'rgba4444' });
          
          gif.writeFrame(index, animation.width, animation.height, {
            palette,
            delay: frame.delay,
            transparent: true,
            dispose: -1
          });
          
          setExportProgress(Math.round(((i + 1) / total) * 100));
        }
        
        gif.finish();
        const buffer = gif.bytes();
        const exportFilename = `${baseName}_animated.gif`;
        await saveFrameImage('', exportFilename, new Uint8Array(buffer));
        
        toast({
          title: '合成新动图成功',
          description: `已成功提取 ${total} 帧并合成新 GIF`,
        });
      }
      
      // Open folder
      openOutputFolder().catch(console.error);
      
    } catch (e: any) {
      console.error(e);
      toast({
        title: '导出失败',
        description: e.message || String(e),
        variant: 'destructive'
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Reset
  const handleReset = () => {
    setAnimation(null);
    setFilename('');
    setCurrentFrameIndex(0);
    setIsPlaying(false);
    setSelectedFrames(new Set());
    setExportInterval(1);
    setLastSelectedIndex(null);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Top Toolbar */}
      {animation && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/40 shrink-0 select-none">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors bg-muted/40 hover:bg-muted/80 px-2 py-1 rounded border"
              title="清除当前动图"
            >
              <XCircle className="w-3.5 h-3.5" />
              重新导入
            </button>
            <div className="w-px h-4 bg-border" />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-foreground/90 max-w-[200px] truncate" title={filename}>
                {filename}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {animation.width} × {animation.height} px • {animation.frames.length} 帧
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border">
             <button
                type="button"
                onClick={() => setPlaybackSpeed(0.5)}
                className={`px-2 py-0.5 text-[10px] rounded font-mono ${playbackSpeed === 0.5 ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
              >
                0.5x
              </button>
              <button
                type="button"
                onClick={() => setPlaybackSpeed(1)}
                className={`px-2 py-0.5 text-[10px] rounded font-mono ${playbackSpeed === 1 ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
              >
                1x
              </button>
              <button
                type="button"
                onClick={() => setPlaybackSpeed(2)}
                className={`px-2 py-0.5 text-[10px] rounded font-mono ${playbackSpeed === 2 ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
              >
                2x
              </button>
          </div>
          
          <div>
            <button
              type="button"
              onClick={() => openOutputFolder()}
              className="flex items-center gap-1.5 hover:bg-muted text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 text-xs font-semibold rounded-md transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              打开输出目录
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!animation ? (
        <div 
          className="flex-1 flex items-center justify-center p-8"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="max-w-md w-full border-2 border-dashed border-border/60 rounded-xl bg-card/30 p-10 flex flex-col items-center justify-center text-center transition-colors hover:border-primary/50 hover:bg-muted/20">
            {isDecoding ? (
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
                <h3 className="text-lg font-semibold text-foreground/90">正在解析动图...</h3>
                <p className="text-sm text-muted-foreground mt-2">处理帧数据中，请稍候</p>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 bg-muted/50 text-muted-foreground rounded-2xl flex items-center justify-center mb-4">
                  <Film className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold text-foreground/90 mb-2">
                  导入 GIF / APNG / WebP 动图
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  拖拽文件到这里，或点击选择文件<br/>
                  在浏览器端极速解析帧动画
                </p>
                <button
                  type="button"
                  onClick={handlePickFile}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2.5 rounded-lg font-semibold shadow-sm flex items-center gap-2 transition-all"
                >
                  <Upload className="w-4 h-4" />
                  选择文件
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Left Canvas Preview Area */}
          <div className="flex-1 flex flex-col bg-muted/20 relative">
            <div className="flex-1 flex items-center justify-center p-4 min-h-0 relative">
              <canvas
                ref={canvasRef}
                width={animation.width}
                height={animation.height}
                className="max-w-full max-h-full object-contain border border-border/50 shadow-sm"
                style={{ backgroundImage: CHECKERED_BG, imageRendering: 'pixelated' }}
              />
            </div>
            
            {/* Playback Controls */}
            <div className="h-16 bg-card border-t border-border flex items-center justify-between px-6 shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
               <div className="flex items-center gap-3">
                 <button
                   type="button"
                   onClick={() => {
                     setIsPlaying(false);
                     setCurrentFrameIndex((prev) => (prev - 1 + animation.frames.length) % animation.frames.length);
                   }}
                   className="p-2 hover:bg-muted text-muted-foreground hover:text-foreground rounded-full transition-colors"
                   title="上一帧"
                 >
                   <SkipBack className="w-4 h-4" />
                 </button>
                 
                 <button
                   type="button"
                   onClick={() => {
                     setIsPlaying(!isPlaying);
                     lastFrameTimeRef.current = 0; // reset delta
                   }}
                   className="p-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full shadow-sm transition-all hover:scale-105 active:scale-95"
                 >
                   {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                 </button>
                 
                 <button
                   type="button"
                   onClick={() => {
                     setIsPlaying(false);
                     setCurrentFrameIndex((prev) => (prev + 1) % animation.frames.length);
                   }}
                   className="p-2 hover:bg-muted text-muted-foreground hover:text-foreground rounded-full transition-colors"
                   title="下一帧"
                 >
                   <SkipForward className="w-4 h-4" />
                 </button>
               </div>
               
               <div className="flex-1 px-8 flex items-center gap-4">
                 <span className="text-xs font-mono text-muted-foreground w-12 text-right">
                   {currentFrameIndex + 1} / {animation.frames.length}
                 </span>
                 <input
                   type="range"
                   min={0}
                   max={animation.frames.length - 1}
                   value={currentFrameIndex}
                   onChange={(e) => {
                     setIsPlaying(false);
                     setCurrentFrameIndex(parseInt(e.target.value));
                   }}
                   className="flex-1 h-1.5 bg-muted rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                 />
               </div>
               
               <div className="text-xs font-mono text-muted-foreground flex flex-col items-end gap-1.5 shrink-0">
                 <span>延迟: {animation.frames[currentFrameIndex]?.delay}ms</span>
                 <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors select-none">
                   <input 
                     type="checkbox" 
                     checked={playSelectedOnly}
                     onChange={(e) => setPlaySelectedOnly(e.target.checked)}
                     className="accent-primary w-3.5 h-3.5"
                   />
                   仅播放选中帧
                 </label>
               </div>
            </div>
          </div>

          {/* Right Frames Sidebar */}
          <div className="w-[340px] border-l border-border bg-card flex flex-col overflow-hidden shrink-0">
            <div className="p-4 border-b border-border bg-card/60 flex flex-col gap-3 shrink-0">
               <div className="flex justify-between items-center">
                 <h3 className="text-sm font-semibold flex items-center gap-1.5">
                   <Layers className="w-4 h-4 text-primary" />
                   帧序列导出
                 </h3>
                 <span className="text-xs text-muted-foreground">
                   已选 {selectedFrames.size} / {animation.frames.length}
                 </span>
               </div>
               
               <div className="grid grid-cols-2 gap-2">
                 <button type="button" onClick={selectAll} className="text-xs py-1.5 border border-border rounded hover:bg-muted flex items-center justify-center gap-1 transition-colors">
                   <CheckSquare className="w-3.5 h-3.5" /> 全选
                 </button>
                 <button type="button" onClick={selectNone} className="text-xs py-1.5 border border-border rounded hover:bg-muted flex items-center justify-center gap-1 transition-colors">
                   <Square className="w-3.5 h-3.5" /> 清除
                 </button>
               </div>
               
               <div className="flex items-center gap-2 bg-muted/40 p-2 rounded border border-border/60">
                 <span className="text-xs text-muted-foreground whitespace-nowrap">间隔选取: 每</span>
                 <input 
                   type="number" 
                   min={1} 
                   max={animation.frames.length}
                   value={exportInterval}
                   onChange={(e) => setExportInterval(Math.max(1, parseInt(e.target.value) || 1))}
                   className="w-12 h-6 text-xs text-center border border-border rounded bg-background"
                 />
                 <span className="text-xs text-muted-foreground">帧</span>
                 <button type="button" onClick={selectByInterval} className="ml-auto text-xs bg-primary/10 text-primary hover:bg-primary/20 px-2 py-1 rounded transition-colors">
                   应用
                 </button>
               </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
              <div className="grid grid-cols-3 gap-2">
                {animation.frames.map((frame) => {
                  const isSelected = selectedFrames.has(frame.index);
                  const isCurrent = currentFrameIndex === frame.index;
                  
                  return (
                    <div 
                      key={frame.index}
                      onClick={() => {
                        setIsPlaying(false);
                        setCurrentFrameIndex(frame.index);
                      }}
                      className={`
                        relative group cursor-pointer rounded-lg border overflow-hidden
                        ${isSelected ? 'border-primary ring-1 ring-primary' : 'border-border'}
                        ${isCurrent ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}
                      `}
                      style={{ backgroundImage: CHECKERED_BG }}
                    >
                      <div className="aspect-square flex items-center justify-center">
                        <img 
                          src={frame.dataUrl} 
                          alt={`Frame ${frame.index}`}
                          className="max-w-full max-h-full object-contain"
                          loading="lazy"
                        />
                      </div>
                      
                      <div className="absolute top-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1.5 py-0.5 font-mono flex justify-between items-center">
                        <span>#{frame.index + 1}</span>
                        <span className="opacity-70">{frame.delay}ms</span>
                      </div>
                      
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFrameSelection(frame.index, e);
                        }}
                        className={`absolute bottom-1 right-1 w-5 h-5 rounded-full flex items-center justify-center shadow-sm border
                          ${isSelected ? 'bg-primary text-primary-foreground border-primary' : 'bg-background/80 text-transparent border-muted-foreground/40 group-hover:text-muted-foreground'}
                        `}
                      >
                        <CheckSquare className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="p-4 border-t border-border bg-card/80 shrink-0 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">类型:</span>
                  <select 
                    value={exportMode}
                    onChange={(e) => setExportMode(e.target.value as 'sequence'|'spritesheet')}
                    className="flex-1 text-xs border border-border rounded px-1.5 py-1 bg-background"
                  >
                    <option value="sequence">单图序列</option>
                    <option value="spritesheet">雪碧长图</option>
                    <option value="animated">新动图</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">格式:</span>
                  <select 
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value as 'png'|'webp')}
                    className="flex-1 text-xs border border-border rounded px-1.5 py-1 bg-background disabled:opacity-50"
                    disabled={exportMode === 'animated'}
                  >
                    <option value="png">{exportMode === 'animated' ? 'GIF' : 'PNG'}</option>
                    {exportMode !== 'animated' && <option value="webp">WebP</option>}
                  </select>
                </div>
              </div>
              
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting || selectedFrames.size === 0}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
              >
                {isExporting ? (
                  <>
                    <div 
                      className="absolute left-0 top-0 bottom-0 bg-white/20 transition-all duration-300" 
                      style={{ width: `${exportProgress}%` }}
                    />
                    <RotateCcw className="w-4 h-4 animate-spin" />
                    <span>导出中 {exportProgress}%</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    导出 {selectedFrames.size} 帧{exportMode === 'spritesheet' ? '为雪碧图' : (exportMode === 'animated' ? '为新动图' : '')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
