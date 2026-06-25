import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from '@/hooks/useToast';
import { Upload, Eraser, Download, PlayCircle, Loader2, ZoomIn, ZoomOut, Maximize, FolderOpen, ChevronDown, ChevronRight, RotateCcw, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { pickSingleFile } from '@/lib/tauriFilePicker';
import { revealFileInFolder, openPath, getLabsRoot } from '@/lib/pathUtils';
import { mkdir, writeFile, exists } from '@/services/secureFs';
import {
  executeBgRemoval,
  BgStrategy,
  StrategyAParams,
  StrategyBParams,
  DEFAULT_STRATEGY_A_PARAMS,
  DEFAULT_STRATEGY_B_PARAMS,
  PRESETS,
} from '@/services/bgRemovalService';
import { useUIStore } from '@/stores';
import { convertFileSrc } from '@tauri-apps/api/core';

// ── localStorage persistence ───────────────────────────────────────
const STORAGE_KEY = 'sanomni-bg-removal-params';

function loadSavedParams(): { a: StrategyAParams; b: StrategyBParams } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { a: { ...DEFAULT_STRATEGY_A_PARAMS }, b: { ...DEFAULT_STRATEGY_B_PARAMS } };
}

function persistParams(a: StrategyAParams, b: StrategyBParams) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ a, b }));
}

// ── Slider helper component ───────────────────────────────────────
function ParamSlider({ label, value, min, max, step, onChange, unit, tooltip }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; unit?: string; tooltip?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          {tooltip && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help transition-colors shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs leading-relaxed">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <span className="text-xs font-mono text-muted-foreground tabular-nums">
          {step < 1 ? value.toFixed(step < 0.001 ? 6 : 4) : value}{unit || ''}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 accent-primary cursor-pointer"
      />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────
export default function ProBackgroundRemoval() {
  const [image, setImage] = useState<string | null>(null);
  const [initialImage, setInitialImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [strategy, setStrategy] = useState<BgStrategy>('A');
  const [savedFilePath, setSavedFilePath] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [canvasBg, setCanvasBg] = useState<string | null>(null); // null = checkerboard
  const [exportDirExists, setExportDirExists] = useState(false);
  const [isModelDownloaded, setIsModelDownloaded] = useState(true);

  // Check if export dir exists
  useEffect(() => {
    getLabsRoot().then(root => {
      exists(`${root}\\bg_removal\\exports`).then(setExportDirExists).catch(() => {});
    });
  }, [savedFilePath]);

  // Check if IS-Net model exists to hide the download hint if already downloaded
  useEffect(() => {
    import('@tauri-apps/api/path').then(({ homeDir }) => {
      homeDir().then(home => {
        exists(`${home}\\.u2net\\isnet-general-use.onnx`).then(setIsModelDownloaded).catch(() => {});
      });
    });
  }, []);

  // Load saved params from localStorage
  const saved = useRef(loadSavedParams());
  const [paramsA, setParamsA] = useState<StrategyAParams>(saved.current.a);
  const [paramsB, setParamsB] = useState<StrategyBParams>(saved.current.b);

  // Persist whenever params change
  useEffect(() => { persistParams(paramsA, paramsB); }, [paramsA, paramsB]);

  // Zoom and Pan state
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (!image) return;
      e.preventDefault();
      const delta = -e.deltaY * 0.0015;
      setScale(s => Math.min(Math.max(0.1, s + delta), 20));
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [image]);

  const handleMouseDown = (e: React.MouseEvent) => { if (!image) return; e.preventDefault(); setIsDragging(true); setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y }); };
  const handleMouseMove = (e: React.MouseEvent) => { if (!isDragging) return; setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); };
  const handleMouseUp = () => { setIsDragging(false); };
  const resetView = () => { setScale(1); setPosition({ x: 0, y: 0 }); };

  // 从 UI Store 获取环境设置
  const settings = useUIStore((state) => state.settings);
  const engineMode = settings.bgRemovalEngineMode || 'local';
  const pythonPath = settings.bgRemovalPythonPath || '';

  // ── Preset handling ────────────────────────────────────────────
  const applyPreset = (name: string) => {
    setActivePreset(name);
    if (strategy === 'A') {
      const p = PRESETS.A[name];
      if (p) setParamsA({ ...p });
    } else {
      const p = PRESETS.B[name];
      if (p) setParamsB({ ...p });
    }
  };

  const resetToDefaults = () => {
    if (strategy === 'A') setParamsA({ ...DEFAULT_STRATEGY_A_PARAMS });
    else setParamsB({ ...DEFAULT_STRATEGY_B_PARAMS });
    setActivePreset(null);
  };

  // ── Updaters (clear preset label on manual change) ─────────────
  const updateA = (patch: Partial<StrategyAParams>) => { setParamsA(p => ({ ...p, ...patch })); setActivePreset(null); };
  const updateB = (patch: Partial<StrategyBParams>) => { setParamsB(p => ({ ...p, ...patch })); setActivePreset(null); };

  // ── Core actions ───────────────────────────────────────────────
  const handlePickImage = useCallback(async () => {
    try {
      const picked = await pickSingleFile({ extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'], filterName: '图片文件' });
      if (picked) {
        const path = picked.path || picked.dataUrl;
        setImage(path);
        setInitialImage(path);
        setResultImage(null);
      }
    } catch (error) { console.error('Failed to pick image:', error); }
  }, []);

  const handleRunBgRemoval = async () => {
    if (!image) return;
    setIsProcessing(true);
    try {
      const resPath = await executeBgRemoval({
        inputPath: image, strategy, pythonPath, engineMode,
        params: strategy === 'A' ? paramsA : paramsB,
      });
      import('@tauri-apps/api/core').then(({ convertFileSrc }) => { setResultImage(convertFileSrc(resPath)); });
      toast({ title: '抠图成功', description: '背景已成功移除！' });
    } catch (e: any) {
      console.error("Bg removal failed:", e);
      toast({ title: '抠图失败', description: typeof e === 'string' ? e : (e.message || String(e)), variant: 'destructive' });
    } finally { setIsProcessing(false); }
  };

  const saveResult = async () => {
    if (!resultImage) return;
    try {
      const { join } = await import('@tauri-apps/api/path');
      const labsRoot = await getLabsRoot();
      const exportDir = await join(labsRoot, "bg_removal", "exports");
      try { await mkdir(exportDir, { recursive: true }); } catch (e: any) { if (!String(e).includes('exists') && !String(e).includes('存在')) throw e; }
      const res = await fetch(resultImage);
      const blob = await res.blob();
      const buffer = await blob.arrayBuffer();
      const filename = `bg_removed_${Date.now()}.png`;
      const fullPath = await join(exportDir, filename);
      await writeFile(fullPath, new Uint8Array(buffer));
      setSavedFilePath(fullPath);
      toast({ title: '保存成功', description: `文件已保存至: ${exportDir}` });
    } catch (e) { console.error(e); toast({ title: '保存失败', variant: 'destructive' }); }
  };

  const handleOpenFolder = async () => {
    try {
      if (savedFilePath) { await revealFileInFolder(savedFilePath); }
      else {
        const { join } = await import('@tauri-apps/api/path');
        const labsRoot = await getLabsRoot();
        const exportDir = await join(labsRoot, "bg_removal", "exports");
        await openPath(exportDir);
      }
    } catch (e) { console.error(e); toast({ title: '打开目录失败', variant: 'destructive' }); }
  };

  // ── Preset names for current strategy ──────────────────────────
  const presetNames = Object.keys(strategy === 'A' ? PRESETS.A : PRESETS.B);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/40 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-md font-medium text-sm">
            <Eraser className="w-4 h-4" />
            高级抠图 (Pro)
          </div>
          <div className="text-xs text-muted-foreground flex gap-4">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="radio" checked={strategy === 'A'} onChange={() => setStrategy('A')} />
              表情包/纯色文字 (保留细节防丢)
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="radio" checked={strategy === 'B'} onChange={() => setStrategy('B')} />
              复杂人像/发丝 (IS-Net 模型)
            </label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {image && (
            <>
              <button onClick={handlePickImage} className="text-xs px-3 py-1.5 rounded bg-muted hover:bg-muted/80 text-foreground transition-colors">
                重新选择
              </button>
              {resultImage && (
                <button onClick={() => { setResultImage(null); setSavedFilePath(null); }} className="text-xs px-3 py-1.5 rounded bg-muted hover:bg-muted/80 transition-colors">
                  清除结果
                </button>
              )}
              <button onClick={handleRunBgRemoval} disabled={isProcessing} className="text-xs px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground transition-colors flex items-center gap-1">
                {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (resultImage ? <RotateCcw className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />)}
                {isProcessing ? (strategy === 'B' && !isModelDownloaded ? '处理中 (首次将自动下载模型)...' : '处理中...') : (resultImage ? '重新应用参数' : '开始抠图')}
              </button>
            </>
          )}
          {resultImage && (
            <button onClick={saveResult} className="text-xs px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-600 text-white transition-colors flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> 保存结果
            </button>
          )}
          {(savedFilePath || exportDirExists) && (
            <button onClick={handleOpenFolder} className="text-xs px-3 py-1.5 rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors flex items-center gap-1">
              <FolderOpen className="w-3.5 h-3.5" /> 打开目录
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden bg-slate-900/5 dark:bg-black/10">
        {!image ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 select-none">
            <div onClick={handlePickImage} className="w-full max-w-lg aspect-[16/10] bg-card border-2 border-dashed border-border/80 hover:border-primary/50 hover:shadow-lg rounded-xl flex flex-col items-center justify-center p-8 text-center transition-all cursor-pointer group">
              <div className="w-16 h-16 rounded-full bg-primary/5 group-hover:bg-primary/10 text-primary/70 flex items-center justify-center transition-all mb-5 group-hover:scale-105">
                <Upload className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-foreground mb-2">上传图片开始抠图</h3>
              <p className="text-xs text-muted-foreground mb-4">基于 rembg 和 Pillow 的无损发丝级抠图</p>
              {engineMode === 'download' && (
                <div className="px-3 py-1.5 bg-orange-500/10 text-orange-500 text-xs rounded border border-orange-500/20">
                  当前处于免环境独立引擎模式
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Canvas area */}
            <div
              ref={containerRef}
              className="flex-1 relative grid grid-cols-2 divide-x divide-border overflow-hidden"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Zoom Controls */}
              <div className="absolute bottom-6 right-6 z-10 flex items-center gap-1 bg-background/80 backdrop-blur-md border border-border p-1 rounded-lg shadow-sm">
                <button onClick={() => setScale(s => Math.max(0.1, s - 0.2))} className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors" title="缩小">
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs w-12 text-center select-none font-mono text-muted-foreground">{Math.round(scale * 100)}%</span>
                <button onClick={() => setScale(s => Math.min(20, s + 0.2))} className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors" title="放大">
                  <ZoomIn className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-border mx-1"></div>
                <button onClick={resetView} className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors" title="适应屏幕">
                  <Maximize className="w-4 h-4" />
                </button>
              </div>

              {/* Source Image */}
              <div className="relative flex items-center justify-center overflow-hidden bg-slate-900/5 dark:bg-black/10">
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground bg-background/80 px-2 py-1 rounded backdrop-blur shadow-sm border border-border">原图</span>
                  {image !== initialImage && initialImage && (
                    <button 
                      onClick={() => { setImage(initialImage); setResultImage(null); setSavedFilePath(null); }}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground bg-background/80 hover:bg-background px-2 py-1 rounded backdrop-blur shadow-sm border border-border transition-colors flex items-center gap-1"
                      title="撤销设为原图操作，恢复最初上传的原始图片"
                    >
                      <RotateCcw className="w-3 h-3" />
                      还原初始
                    </button>
                  )}
                </div>
                <div
                  className="relative border border-border/50 shadow-sm rounded flex transition-transform duration-75 origin-center checkerboard-bg"
                  style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, cursor: isDragging ? 'grabbing' : 'grab' }}
                >
                  <img src={image.startsWith('data:') || image.startsWith('asset:') || image.startsWith('http') ? image : convertFileSrc(image)} alt="Source" className="max-h-[80vh] object-contain pointer-events-none select-none" draggable={false} />
                </div>
              </div>

              {/* Result Image */}
              <div className="relative flex items-center justify-center overflow-hidden bg-slate-900/5 dark:bg-black/10">
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                  <span className="text-xs font-semibold text-primary bg-background/80 px-2 py-1 rounded backdrop-blur shadow-sm border border-border">处理结果</span>
                  {resultImage && (
                    <button 
                      onClick={() => { setImage(resultImage); setResultImage(null); setSavedFilePath(null); }}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground bg-background/80 hover:bg-background px-2 py-1 rounded backdrop-blur shadow-sm border border-border transition-colors"
                      title="将此结果设为新的原图，以便继续叠加处理"
                    >
                      设为原图
                    </button>
                  )}
                </div>
                {resultImage ? (
                  <div
                    className={`relative border border-border/50 shadow-sm rounded flex transition-transform duration-75 origin-center ${canvasBg ? '' : 'checkerboard-bg'}`}
                    style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, cursor: isDragging ? 'grabbing' : 'grab', ...(canvasBg ? { backgroundColor: canvasBg } : {}) }}
                  >
                    <img src={resultImage} alt="Result" className="max-h-[80vh] object-contain pointer-events-none select-none" draggable={false} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-muted-foreground/50">
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-8 h-8 animate-spin mb-2 opacity-50" />
                        <span className="text-sm">处理中...</span>
                      </>
                    ) : (
                      <>
                        <Eraser className="w-12 h-12 mb-3 opacity-20" />
                        <span className="text-sm font-medium opacity-50">点击“开始抠图”生成结果</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Right Panel: Parameters ────────────────────────── */}
            <div className="w-72 shrink-0 border-l border-border bg-card/60 overflow-y-auto p-4 flex flex-col gap-4 select-none">
              {/* Preset chips */}
              <div>
                <div className="text-xs font-semibold text-foreground mb-2">预设方案</div>
                <div className="flex flex-wrap gap-1.5">
                  {presetNames.map(name => (
                    <button
                      key={name}
                      onClick={() => applyPreset(name)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        activePreset === name
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-px bg-border" />

              {/* Strategy A params */}
              {strategy === 'A' && (
                <div className="flex flex-col gap-3">
                  <div className="text-xs font-semibold text-foreground">基本参数</div>
                  <ParamSlider label="不透明阈值" value={paramsA.lowerThreshold} min={100} max={255} step={1}
                    onChange={v => updateA({ lowerThreshold: v })}
                    tooltip="低于此值的像素完全保留。调低可保留更多边缘过渡色，调高则只保留与背景色差异极大的区域。适用：抠图后边缘有残留色块时调低" />
                  <ParamSlider label="全透明阈值" value={paramsA.upperThreshold} min={100} max={255} step={1}
                    onChange={v => updateA({ upperThreshold: v })}
                    tooltip="高于此值的像素完全透明。调低可更激进地去除背景，调高则更保守。适用：背景去不干净时调低，主体被误删时调高" />

                  <div className="h-px bg-border" />
                  <div className="text-xs font-semibold text-foreground">背景颜色</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={`#${paramsA.bgColor.split(',').map(c => parseInt(c.trim()).toString(16).padStart(2, '0')).join('')}`}
                      onChange={e => {
                        const hex = e.target.value;
                        const r = parseInt(hex.slice(1, 3), 16);
                        const g = parseInt(hex.slice(3, 5), 16);
                        const b = parseInt(hex.slice(5, 7), 16);
                        updateA({ bgColor: `${r},${g},${b}` });
                      }}
                      className="w-8 h-8 rounded border border-border cursor-pointer"
                    />
                    <span className="text-xs text-muted-foreground font-mono">RGB({paramsA.bgColor})</span>
                  </div>
                </div>
              )}

              {/* Strategy B params */}
              {strategy === 'B' && (
                <div className="flex flex-col gap-3">
                  <div className="text-xs font-semibold text-foreground">核心参数</div>
                  <ParamSlider label="背景亮度阈值" value={paramsB.bgThreshold} min={50} max={250} step={1}
                    onChange={v => updateB({ bgThreshold: v })}
                    tooltip="亮度高于此值的像素被判定为背景并去除光晕。适用：白底图保持默认150即可；深色或彩色背景时需调低到80-120" />
                  <ParamSlider label="羽化过渡范围" value={paramsB.bgFeathering} min={20} max={200} step={1}
                    onChange={v => updateB({ bgFeathering: v })}
                    tooltip="背景到主体的过渡宽度。越小边缘越锐利（适合硬边物体），越大越柔和（适合毛发/烟雾）。适用：发丝毛糙时调大，边缘模糊时调小" />
                  <ParamSlider label="边缘平滑半径" value={paramsB.guidedRadius} min={3} max={60} step={1}
                    onChange={v => updateB({ guidedRadius: v })}
                    tooltip="引导滤波半径，控制边缘细节的平滑程度。调大可消除锯齿但可能丢失极细发丝，调小可保留更多细节但可能有噪点。适用：人像发丝建议15-25，简单物体建议8-12" />

                  {/* Collapsible advanced */}
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                  >
                    {showAdvanced ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    高级参数
                  </button>
                  {showAdvanced && (
                    <div className="flex flex-col gap-3 pl-2 border-l-2 border-primary/20">
                      <ParamSlider label="滤波精度 (eps)" value={paramsB.guidedEps} min={0.000001} max={0.1} step={0.000001}
                        onChange={v => updateB({ guidedEps: v })}
                        tooltip="引导滤波的正则化系数。越小边缘越锐利清晰，越大越平滑柔和。适用：需要极致锐利的剪影轮廓时调小；边缘出现锯齿或噪点时调大" />
                      <ParamSlider label="去色溢染力度" value={paramsB.decontamErode} min={3} max={30} step={1}
                        onChange={v => updateB({ decontamErode: v })}
                        tooltip="控制边缘颜色清理的深度范围。调大会向主体内部清理更深（去除更多背景色溢出），调小则只清理最外层边缘。适用：抠图后边缘泛白/泛绿时调大" />
                    </div>
                  )}
                </div>
              )}

              <div className="h-px bg-border" />

              {/* Canvas background color */}
              <div>
                <div className="text-xs font-semibold text-foreground mb-2">画布底色</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Checkerboard (default) */}
                  <button
                    onClick={() => setCanvasBg(null)}
                    title="棋盘格"
                    className={`w-7 h-7 rounded border-2 transition-colors checkerboard-bg-sm ${canvasBg === null ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:border-foreground/30'}`}
                  />
                  {/* Quick color swatches */}
                  {['#ffffff', '#000000', '#ff0000', '#00cc00', '#0066ff', '#ff9900', '#cc00cc', '#888888'].map(c => (
                    <button
                      key={c}
                      onClick={() => setCanvasBg(c)}
                      title={c}
                      className={`w-7 h-7 rounded border-2 transition-colors ${canvasBg === c ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:border-foreground/30'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  {/* Custom color picker */}
                  <label className="relative w-7 h-7 rounded border-2 border-border hover:border-foreground/30 cursor-pointer overflow-hidden transition-colors" title="自定义颜色">
                    <input
                      type="color"
                      value={canvasBg || '#ffffff'}
                      onChange={e => setCanvasBg(e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <span className="flex items-center justify-center w-full h-full text-muted-foreground text-xs">+</span>
                  </label>
                </div>
              </div>

              <div className="h-px bg-border" />

              {/* Reset button */}
              <button
                onClick={resetToDefaults}
                className="flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                恢复默认参数
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .checkerboard-bg {
          background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), 
            linear-gradient(-45deg, #ccc 25%, transparent 25%), 
            linear-gradient(45deg, transparent 75%, #ccc 75%), 
            linear-gradient(-45deg, transparent 75%, #ccc 75%);
          background-size: 20px 20px;
          background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
        }
        .dark .checkerboard-bg {
          background-image: linear-gradient(45deg, #333 25%, transparent 25%), 
            linear-gradient(-45deg, #333 25%, transparent 25%), 
            linear-gradient(45deg, transparent 75%, #333 75%), 
            linear-gradient(-45deg, transparent 75%, #333 75%);
        }
        .checkerboard-bg-sm {
          background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), 
            linear-gradient(-45deg, #ccc 25%, transparent 25%), 
            linear-gradient(45deg, transparent 75%, #ccc 75%), 
            linear-gradient(-45deg, transparent 75%, #ccc 75%);
          background-size: 8px 8px;
          background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
        }
      `}</style>
    </div>
  );
}
