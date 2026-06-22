import { useState, useEffect, useRef, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { readFile, remove } from '@/services/secureFs';
import { join } from '@tauri-apps/api/path';
import { geminiWatermarkApi } from '@/services/tauri';
import { getLabsRoot } from '@/lib/pathUtils';
import { Guideline, SliceItem, ExportConfig } from './types';
import { calculateEqualGuidelines, computeSlices, processSliceToCanvas, generateSliceFileName } from './utils';
import { clearTempImages, ensureDirectory, getDefaultExportPath, listTempImages, loadTempImage, saveFile, TempImageEntry } from './fs';
import SlicerCanvas from './SlicerCanvas';
import SliceGridPreview from './SliceGridPreview';
import ExportSettings from './ExportSettings';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/useToast';
import {
  Upload,
  History,
  Layers,
  Trash2,
  Eraser,
  Loader2,
  Plus,
  ArrowRight,
  Sparkles,
  FileImage,
  Compass,
  ArrowLeft,
  XCircle,
} from 'lucide-react';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function findAvailableGuidelinePosition(existingPositions: number[], limit: number) {
  if (limit <= 2) return Math.max(0, Math.round(limit / 2));

  const base = Math.round(limit / 2);
  const step = Math.max(8, Math.round(limit / 12));
  const minGap = 4;
  const isFree = (position: number) =>
    !existingPositions.some((existing) => Math.abs(existing - position) < minGap);

  for (let i = 0; i <= 12; i += 1) {
    const candidates = i === 0 ? [base] : [base + step * i, base - step * i];
    for (const candidate of candidates) {
      const position = Math.max(1, Math.min(limit - 1, candidate));
      if (isFree(position)) return position;
    }
  }

  return base;
}

export default function ImageSlicer() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [originalFilename, setOriginalFilename] = useState<string>('');
  const [originalWidth, setOriginalWidth] = useState<number>(0);
  const [originalHeight, setOriginalHeight] = useState<number>(0);

  const [guidelines, setGuidelines] = useState<Guideline[]>([]);
  const [slices, setSlices] = useState<SliceItem[]>([]);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [isRemovingWatermark, setIsRemovingWatermark] = useState(false);
  const [tempHistory, setTempHistory] = useState<TempImageEntry[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Equal division parameters
  const [rows, setRows] = useState<number>(3);
  const [cols, setCols] = useState<number>(3);
  const [doubleLines, setDoubleLines] = useState<boolean>(false);
  const [gutter, setGutter] = useState<number>(10);

  const [exportConfig, setExportConfig] = useState<ExportConfig>({
    width: 240,
    height: 240,
    mode: 'center',
    backgroundColor: 'transparent',
    format: 'png',
    quality: 0.9,
    namingPattern: '{filename}_slice_{index}',
    exportPath: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentWatermarkOutputPathRef = useRef<string | null>(null);

  const applyImageSrc = useCallback((src: string, filename: string, successTitle = '图片加载成功') => {
    const img = new Image();
    img.onload = () => {
      currentWatermarkOutputPathRef.current = null;
      setOriginalWidth(img.width);
      setOriginalHeight(img.height);
      setImageSrc(src);
      setOriginalFilename(filename);
      setGuidelines([]);
      setActiveTab('editor');

      const v = calculateEqualGuidelines(img.width, 3, 'vertical', false, 10);
      const h = calculateEqualGuidelines(img.height, 3, 'horizontal', false, 10);
      setGuidelines([...v, ...h]);

      toast({
        title: successTitle,
        description: `分辨率: ${img.width} x ${img.height} px`,
        variant: 'default',
      });
    };
    img.onerror = () => {
      toast({
        title: '图片加载失败',
        description: '无法读取该图片，请换一张重试。',
        variant: 'destructive',
      });
    };
    img.src = src;
  }, []);

  const loadTempHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      setTempHistory(await listTempImages());
    } catch (error: any) {
      toast({
        title: '临时图片历史读取失败',
        description: error?.message || String(error),
        variant: 'destructive',
      });
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Initialize default export path on mount
  useEffect(() => {
    const initPath = async () => {
      try {
        const path = await getDefaultExportPath();
        setExportConfig((prev) => ({ ...prev, exportPath: path }));
      } catch (e) {
        console.error('Failed to resolve default export path:', e);
      }
    };
    initPath();
  }, []);

  // Recalculate grid slices on the fly when guidelines or dimensions change
  useEffect(() => {
    if (originalWidth > 0 && originalHeight > 0) {
      const calculated = computeSlices(originalWidth, originalHeight, guidelines);
      setSlices(calculated);
    } else {
      setSlices([]);
    }
  }, [guidelines, originalWidth, originalHeight]);

  // Handle uploading and measuring image size
  const handleImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: '不支持的文件类型', description: '请选择一张图片。', variant: 'destructive' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        currentWatermarkOutputPathRef.current = null;
        setOriginalWidth(img.width);
        setOriginalHeight(img.height);
        setImageSrc(dataUrl);
        setOriginalFilename(file.name);
        setGuidelines([]); // Reset lines
        setActiveTab('editor');

        // Automatically set up a standard 3x3 equal division guidelines to onboard the user nicely
        const v = calculateEqualGuidelines(img.width, 3, 'vertical', false, 10);
        const h = calculateEqualGuidelines(img.height, 3, 'horizontal', false, 10);
        setGuidelines([...v, ...h]);

        toast({
          title: '图片加载成功',
          description: `分辨率: ${img.width} × ${img.height} px`,
          variant: 'default',
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleOpenHistory = async () => {
    setIsHistoryOpen(true);
    await loadTempHistory();
  };

  const handleLoadTempImage = async (entry: TempImageEntry) => {
    try {
      const src = await loadTempImage(entry);
      applyImageSrc(src, entry.name, '已从临时历史载入');
      setIsHistoryOpen(false);
    } catch (error: any) {
      toast({
        title: '载入临时图片失败',
        description: error?.message || String(error),
        variant: 'destructive',
      });
    }
  };

  const handleClearTempHistory = async () => {
    try {
      const count = await clearTempImages();
      setTempHistory([]);
      toast({
        title: '临时图片已清空',
        description: count > 0 ? `已删除 ${count} 个临时图片文件。` : '临时目录中没有可清理的图片。',
      });
    } catch (error: any) {
      toast({
        title: '清空临时图片失败',
        description: error?.message || String(error),
        variant: 'destructive',
      });
    }
  };

  const handleApplyWatermarkResult = useCallback((processedImageSrc: string) => {
    const img = new Image();
    img.onload = () => {
      const dimensionsChanged = img.width !== originalWidth || img.height !== originalHeight;

      setImageSrc(processedImageSrc);
      setOriginalWidth(img.width);
      setOriginalHeight(img.height);
      setOriginalFilename((current) => {
        const baseName = current.replace(/\.[^/.]+$/, '') || 'image';
        return `${baseName}_watermark_removed.png`;
      });
      setActiveTab('editor');

      if (dimensionsChanged) {
        const v = calculateEqualGuidelines(img.width, cols, 'vertical', doubleLines, gutter);
        const h = calculateEqualGuidelines(img.height, rows, 'horizontal', doubleLines, gutter);
        setGuidelines([...v, ...h]);
      }
    };
    img.onerror = () => {
      toast({
        title: '图片更新失败',
        description: '去水印结果无法加载，请重试。',
        variant: 'destructive',
      });
    };
    img.src = processedImageSrc;
  }, [cols, doubleLines, gutter, originalHeight, originalWidth, rows]);

  const handleRemoveGeminiWatermark = useCallback(async () => {
    if (!imageSrc || isRemovingWatermark) return;

    setIsRemovingWatermark(true);

    try {
      const labsRoot = await getLabsRoot();
      const tempDir = await join(labsRoot, 'image_slicer', 'temp');
      await ensureDirectory(tempDir);

      const jobId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const inputFileName = `gemini_watermark_input_${jobId}.png`;
      const outputFileName = `gemini_watermark_output_${jobId}.png`;
      const inputPath = await join(tempDir, inputFileName);
      const outputPath = await join(tempDir, outputFileName);

      const imageResponse = await fetch(imageSrc);
      const imageBlob = await imageResponse.blob();
      const imageBuffer = await imageBlob.arrayBuffer();
      await saveFile(tempDir, inputFileName, new Uint8Array(imageBuffer));

      const result = await geminiWatermarkApi.autoRemove(inputPath, outputPath);
      if (!result.success) {
        throw new Error('Gemini 水印去除失败');
      }

      const outputBuffer = await readFile(outputPath);
      const outputBytes = new Uint8Array(outputBuffer);
      const outputBlob = new Blob([outputBytes.buffer], { type: 'image/png' });
      const outputDataUrl = await blobToDataUrl(outputBlob);

      await remove(inputPath).catch((error) => {
        console.warn('Failed to remove temporary slicer watermark input:', inputPath, error);
      });

      const previousOutputPath = currentWatermarkOutputPathRef.current;
      currentWatermarkOutputPathRef.current = outputPath;
      if (previousOutputPath && previousOutputPath !== outputPath) {
        await remove(previousOutputPath).catch((error) => {
          console.warn('Failed to remove previous slicer watermark output:', previousOutputPath, error);
        });
      }

      handleApplyWatermarkResult(outputDataUrl);
      toast({
        title: 'Gemini 水印已去除',
        description: result.watermark_detected
          ? '已使用 Gemini 水印反算算法处理当前切割源图。'
          : '未明确检测到水印，但已完成反算处理。',
      });
    } catch (error: any) {
      console.error('Gemini watermark removal failed in slicer:', error);
      toast({
        title: 'Gemini 去水印失败',
        description: error?.message || String(error),
        variant: 'destructive',
      });
    } finally {
      setIsRemovingWatermark(false);
    }
  }, [handleApplyWatermarkResult, imageSrc, isRemovingWatermark]);

  // Guideline handlers
  const handleApplyEqualDivision = () => {
    if (originalWidth === 0 || originalHeight === 0) return;
    const v = calculateEqualGuidelines(originalWidth, cols, 'vertical', doubleLines, gutter);
    const h = calculateEqualGuidelines(originalHeight, rows, 'horizontal', doubleLines, gutter);
    setGuidelines([...v, ...h]);

    toast({
      title: '参考线已更新',
      description: `成功生成 ${v.length + h.length} 条等分参考线`,
      variant: 'default',
    });
  };

  const handleAddManualGuideline = (type: 'horizontal' | 'vertical') => {
    if (originalWidth === 0 || originalHeight === 0) return;
    const limit = type === 'vertical' ? originalWidth : originalHeight;
    const existingPositions = guidelines
      .filter((guide) => guide.type === type)
      .map((guide) => guide.position);
    const position = findAvailableGuidelinePosition(existingPositions, limit);

    const newGuide: Guideline = {
      id: `manual_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      position,
      isAuto: false,
    };

    setGuidelines((prev) => [...prev, newGuide]);
    toast({
      title: `添加了${type === 'vertical' ? '垂直' : '水平'}参考线`,
      description: `位置位于 ${position} px`,
      variant: 'default',
    });
  };

  const handleUpdateGuideline = (id: string, newPos: number) => {
    setGuidelines((prev) =>
      prev.map((g) => (g.id === id ? { ...g, position: newPos } : g))
    );
  };

  const handleDeleteGuideline = (id: string) => {
    setGuidelines((prev) => {
      const guide = prev.find((g) => g.id === id);
      if (guide?.pairId) {
        return prev.filter((g) => g.pairId !== guide.pairId);
      }
      return prev.filter((g) => g.id !== id);
    });
  };

  const handleClearGuidelines = () => {
    setGuidelines([]);
    toast({ title: '已清空参考线', description: '所有参考线已被移除' });
  };

  const handleToggleSliceSelect = (sliceId: string) => {
    setSlices((prev) =>
      prev.map((s) => (s.id === sliceId ? { ...s, selected: !s.selected } : s))
    );
  };

  const handleSelectAllSlices = (select: boolean) => {
    setSlices((prev) => prev.map((s) => ({ ...s, selected: select })));
  };

  // Batch crop and export
  const handleExport = async () => {
    const activeSlices = slices.filter((s) => s.selected);
    if (activeSlices.length === 0 || !exportConfig.exportPath) return;

    setIsExporting(true);
    setExportProgress(0);

    try {
      // 1. Create Image element in memory
      const img = new Image();
      img.src = imageSrc!;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const total = activeSlices.length;
      for (let i = 0; i < total; i++) {
        const slice = activeSlices[i];
        
        // 2. Crop and fit on canvas
        const canvas = processSliceToCanvas(img, slice, exportConfig);

        // 3. Generate file name
        const filename = generateSliceFileName(
          exportConfig.namingPattern,
          originalFilename,
          i + 1,
          slice.row,
          slice.col,
          slice.x,
          slice.y,
          slice.width,
          slice.height,
          exportConfig.format
        );

        // 4. Convert canvas to blob based on options
        const mimeType =
          exportConfig.format === 'png'
            ? 'image/png'
            : exportConfig.format === 'jpeg'
              ? 'image/jpeg'
              : 'image/webp';
        const quality = exportConfig.format === 'png' ? undefined : exportConfig.quality;

        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), mimeType, quality);
        });

        if (!blob) throw new Error(`无法创建切片 #${i + 1} 的图像数据`);

        const arrayBuffer = await blob.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);

        // 5. Save file to disk
        await saveFile(exportConfig.exportPath, filename, uint8);

        // 6. Update progress bar
        setExportProgress(Math.round(((i + 1) / total) * 100));
      }

      toast({
        title: '🎉 导出成功！',
        description: `成功写入 ${total} 张切片到目录 ${exportConfig.exportPath}`,
        variant: 'default',
      });
    } catch (err: any) {
      console.error('Export failed:', err);
      toast({
        title: '导出失败',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Sort and display guidelines in sidebar manager
  const vGuides = guidelines.filter((g) => g.type === 'vertical').sort((a, b) => a.position - b.position);
  const hGuides = guidelines.filter((g) => g.type === 'horizontal').sort((a, b) => a.position - b.position);
  const formatTempImageTime = (timestamp: number) =>
    timestamp > 0 ? new Date(timestamp).toLocaleString() : '未知时间';
  const formatTempImageSize = (size: number) => {
    if (size <= 0) return '';
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
        onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])}
      />

      {/* Toolbar / Header */}
      {imageSrc && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/40 shrink-0 select-none">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (originalWidth > 0 && originalHeight > 0) {
                  const v = calculateEqualGuidelines(originalWidth, 3, 'vertical', false, 10);
                  const h = calculateEqualGuidelines(originalHeight, 3, 'horizontal', false, 10);
                  setGuidelines([...v, ...h]);
                  setActiveTab('editor');
                  toast({
                    title: '画布已重置',
                    description: '参考线已恢复为初始默认3x3等分。',
                    variant: 'default',
                  });
                }
              }}
              className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors bg-muted/40 hover:bg-muted/80 px-2 py-1 rounded border"
              title="保持当前图片，恢复初始参考线及设置"
            >
              <Trash2 className="w-3.5 h-3.5" />
              重置编辑
            </button>
            <button
              type="button"
              onClick={() => {
                setImageSrc(null);
                setGuidelines([]);
                setSlices([]);
              }}
              className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors bg-muted/40 hover:bg-muted/80 px-2 py-1 rounded border"
              title="卸载当前图片，重新选择新图片"
            >
              <XCircle className="w-3.5 h-3.5" />
              更换图片
            </button>
            <button
              type="button"
              onClick={handleRemoveGeminiWatermark}
              disabled={isRemovingWatermark}
              className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors bg-muted/40 hover:bg-muted/80 px-2 py-1 rounded border"
              title="切割前去除 Gemini 水印"
            >
              {isRemovingWatermark ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Eraser className="w-3.5 h-3.5" />
              )}
              {isRemovingWatermark ? '处理中...' : '去 Gemini 水印'}
            </button>
            <button
              type="button"
              onClick={handleOpenHistory}
              className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors bg-muted/40 hover:bg-muted/80 px-2 py-1 rounded border"
              title="选择之前生成的临时图片"
            >
              <History className="w-3.5 h-3.5" />
              历史图片
            </button>
            <div className="w-px h-4 bg-border" />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-foreground/90 max-w-[200px] truncate" title={originalFilename}>
                {originalFilename}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {originalWidth} × {originalHeight} px
              </span>
            </div>
          </div>

          {/* Center Tabs switcher */}
          <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border">
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={`flex items-center gap-1.5 px-4 py-1 text-xs font-semibold rounded-md transition-all ${
                activeTab === 'editor'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              1. 绘制参考线
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-1.5 px-4 py-1 text-xs font-semibold rounded-md transition-all ${
                activeTab === 'preview'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              2. 确认切片与导出
              {slices.length > 0 && (
                <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ml-1">
                  {slices.length}
                </span>
              )}
            </button>
          </div>

          {/* Right Action */}
          <div>
            {activeTab === 'editor' ? (
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-3.5 py-1.5 text-xs font-semibold rounded-md shadow-sm transition-all"
              >
                预览并确认切片
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('editor')}
                className="flex items-center gap-1.5 hover:bg-muted text-muted-foreground hover:text-foreground border border-border px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                返回参考线编辑
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Workspace Area */}
      {imageSrc ? (
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT/CENTER: Active component view */}
          {activeTab === 'editor' ? (
            <SlicerCanvas
              imageSrc={imageSrc}
              originalWidth={originalWidth}
              originalHeight={originalHeight}
              guidelines={guidelines}
              onUpdateGuideline={handleUpdateGuideline}
              onDeleteGuideline={handleDeleteGuideline}
            />
          ) : (
            <SliceGridPreview
              imageSrc={imageSrc}
              originalWidth={originalWidth}
              originalHeight={originalHeight}
              slices={slices}
              onToggleSelect={handleToggleSliceSelect}
              onSelectAll={handleSelectAllSlices}
            />
          )}

          {/* RIGHT PANEL: Tab dependent */}
          {activeTab === 'editor' ? (
            /* Guideline Editor Sidebar */
            <div className="w-[300px] shrink-0 border-l border-border bg-card flex flex-col h-full overflow-hidden select-none">
              <div className="px-4 py-3 border-b border-border bg-card/60 flex items-center justify-between shrink-0">
                <h3 className="text-sm font-semibold">参考线设置</h3>
                <button
                  type="button"
                  onClick={handleClearGuidelines}
                  disabled={guidelines.length === 0}
                  className="flex items-center gap-1 text-[11px] text-destructive hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  <Trash2 className="w-3 h-3" />
                  清空线
                </button>
              </div>

              {/* Control panels */}
              <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
                {/* 1. Grid division */}
                <div className="space-y-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/90">
                    <Sparkles className="w-4 h-4 text-primary" />
                    等分参考线
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-muted-foreground block mb-1">垂直等分 (列数)</span>
                      <input
                        type="number"
                        min={1}
                        value={cols}
                        onChange={(e) => setCols(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full text-xs px-2.5 py-1.5 bg-muted/40 border border-border/80 rounded-md focus:outline-none focus:border-primary/50 text-foreground font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block mb-1">水平等分 (行数)</span>
                      <input
                        type="number"
                        min={1}
                        value={rows}
                        onChange={(e) => setRows(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full text-xs px-2.5 py-1.5 bg-muted/40 border border-border/80 rounded-md focus:outline-none focus:border-primary/50 text-foreground font-mono"
                      />
                    </div>
                  </div>

                  {/* Double reference lines */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-foreground/80">启用双参考线均分</span>
                      <Switch checked={doubleLines} onCheckedChange={setDoubleLines} />
                    </div>
                    {doubleLines && (
                      <div className="flex items-center gap-2 bg-muted/30 p-2 rounded border border-border/50 transition-all">
                        <span className="text-[10px] text-muted-foreground shrink-0">两条线间距 (Gutter px)</span>
                        <input
                          type="number"
                          min={0}
                          value={gutter}
                          onChange={(e) => setGutter(Math.max(0, parseInt(e.target.value) || 0))}
                          className="flex-1 text-xs px-2 py-1 bg-card border border-border/80 rounded-md focus:outline-none focus:border-primary/50 text-foreground font-mono"
                        />
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleApplyEqualDivision}
                    className="w-full py-1.5 bg-primary/10 hover:bg-primary/15 border border-primary/30 hover:border-primary/40 text-primary text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5"
                  >
                    重新生成等分参考线
                  </button>
                </div>

                {/* 2. Manual insertion */}
                <div className="space-y-2.5 pt-2 border-t border-border/60">
                  <div className="text-xs font-semibold text-foreground/90">手动添加参考线</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleAddManualGuideline('vertical')}
                      className="py-1.5 hover:bg-muted border border-border rounded-md text-xs font-semibold text-foreground/90 transition-colors flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      添加垂直线
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddManualGuideline('horizontal')}
                      className="py-1.5 hover:bg-muted border border-border rounded-md text-xs font-semibold text-foreground/90 transition-colors flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      添加水平线
                    </button>
                  </div>
                </div>

                {/* 3. Guidelines List (Manager) */}
                <div className="space-y-2.5 pt-4 border-t border-border/60">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground/90">
                    <span>参考线列表</span>
                    <span className="text-[10px] text-muted-foreground font-mono font-medium">
                      共 {guidelines.length} 条
                    </span>
                  </div>

                  <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1.5 custom-scrollbar">
                    {/* Vertical list */}
                    {vGuides.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block">
                          垂直参考线 (X坐标)
                        </span>
                        <div className="grid grid-cols-2 gap-1.5">
                          {vGuides.map((g) => (
                            <div
                              key={g.id}
                              className={`flex items-center justify-between bg-muted/30 border border-border/40 pl-2 pr-1 py-0.5 rounded text-[10px] font-mono text-foreground/80 ${
                                g.gutterSide ? 'border-rose-500/20 bg-rose-500/5' : ''
                              }`}
                            >
                              <span className="truncate">{g.position} px</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteGuideline(g.id)}
                                className="text-muted-foreground/60 hover:text-destructive p-0.5 rounded transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Horizontal list */}
                    {hGuides.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block">
                          水平参考线 (Y坐标)
                        </span>
                        <div className="grid grid-cols-2 gap-1.5">
                          {hGuides.map((g) => (
                            <div
                              key={g.id}
                              className={`flex items-center justify-between bg-muted/30 border border-border/40 pl-2 pr-1 py-0.5 rounded text-[10px] font-mono text-foreground/80 ${
                                g.gutterSide ? 'border-rose-500/20 bg-rose-500/5' : ''
                              }`}
                            >
                              <span className="truncate">{g.position} px</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteGuideline(g.id)}
                                className="text-muted-foreground/60 hover:text-destructive p-0.5 rounded transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {guidelines.length === 0 && (
                      <p className="text-[10px] text-muted-foreground/70 text-center py-4">
                        当前无任何参考线。你可以添加等分线，或鼠标双击画布生成自定义参考线。
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom Next Step Trigger */}
              <div className="p-4 border-t border-border bg-card/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className="w-full py-2 bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-semibold rounded-md shadow flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
                >
                  预览并确认切片
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* Slices & Export Sidebar */
            <ExportSettings
              originalFilename={originalFilename}
              slices={slices}
              config={exportConfig}
              onUpdateConfig={(updated) => setExportConfig((prev) => ({ ...prev, ...updated }))}
              onExport={handleExport}
              isExporting={isExporting}
              exportProgress={exportProgress}
            />
          )}
        </div>
      ) : (
        /* Image Upload Area (Empty State) */
        <div className="flex-1 h-full flex flex-col items-center justify-center p-8 bg-slate-900/5 dark:bg-black/10 select-none">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="w-full max-w-xl aspect-[16/10] bg-card border-2 border-dashed border-border/80 hover:border-primary/50 hover:shadow-lg rounded-xl flex flex-col items-center justify-center p-8 text-center transition-all duration-300 cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-16 h-16 rounded-full bg-primary/5 group-hover:bg-primary/10 text-primary/70 flex items-center justify-center transition-all mb-5 group-hover:scale-105">
              <Upload className="w-8 h-8" />
            </div>
            
            <h3 className="text-base font-bold text-foreground mb-1 bg-gradient-to-r from-primary to-sky-400 bg-clip-text text-transparent">
              上传切割图片
            </h3>
            <p className="text-xs text-muted-foreground max-w-[280px] leading-relaxed mb-6">
              点击此处选择本地图片，或将图片拖拽至此框中加载。
            </p>

            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 border border-border/60 bg-muted/20 px-3 py-1 rounded-full">
              <FileImage className="w-3.5 h-3.5" />
              支持常用 JPG、PNG、WEBP 等格式
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleOpenHistory();
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              <History className="w-3.5 h-3.5" />
              查看临时历史
            </button>
          </div>
        </div>
      )}

      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6">
          <div className="flex max-h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold">临时图片历史</h3>
                  <p className="text-xs text-muted-foreground">
                    这些文件位于 labs/image_slicer/temp，不会自动定时清空。
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadTempHistory}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  disabled={isLoadingHistory}
                >
                  {isLoadingHistory ? '读取中...' : '刷新'}
                </button>
                <button
                  type="button"
                  onClick={handleClearTempHistory}
                  className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  清空历史
                </button>
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  关闭
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {tempHistory.length === 0 ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
                  <History className="mb-3 h-8 w-8 opacity-40" />
                  <p>{isLoadingHistory ? '正在读取临时图片...' : '暂无临时图片历史'}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
                  {tempHistory.map((entry) => (
                    <button
                      key={entry.path}
                      type="button"
                      onClick={() => handleLoadTempImage(entry)}
                      className="group overflow-hidden rounded-md border border-border bg-background text-left hover:border-primary/60 hover:shadow-sm"
                      title={entry.path}
                    >
                      <div className="aspect-square bg-muted">
                        <img
                          src={convertFileSrc(entry.path)}
                          alt={entry.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="space-y-1 p-2">
                        <div className="truncate text-xs font-medium group-hover:text-primary">
                          {entry.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatTempImageTime(entry.modifiedAt)}
                        </div>
                        {entry.size > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            {formatTempImageSize(entry.size)}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
