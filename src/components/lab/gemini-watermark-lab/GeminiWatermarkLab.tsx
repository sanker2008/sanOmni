import { useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { basename, join } from '@tauri-apps/api/path';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Crosshair,
  Download,
  Eraser,
  FolderOpen,
  HelpCircle,
  ImagePlus,
  Loader2,
  MousePointer2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { toast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  geminiWatermarkApi,
  isGeminiWatermarkRemovalSuccessful,
  type GeminiWatermarkRemovalResult,
  type WatermarkRegion,
} from '@/services/tauri';
import { authorizeFsPaths, copyFile, exists, readDir, remove } from '@/services/secureFs';
import { getLabsRoot, openPath } from '@/lib/pathUtils';
import { ensureDirectory } from '../image-compressor/fs';

type ProfileOption = 'auto' | 'legacy_scale_0.60' | '20260520' | 'legacy';
type PreviewTarget = 'source' | 'output';
type ViewTransform = { scale: number; x: number; y: number };
type Point = { x: number; y: number };
type SelectionDragState =
  | {
      mode: 'create';
      start: Point;
    }
  | {
      mode: 'move';
      start: Point;
      origin: WatermarkRegion;
    };

const MIN_PREVIEW_SCALE = 1;
const MAX_PREVIEW_SCALE = 8;
const DEFAULT_VIEW: ViewTransform = { scale: 1, x: 0, y: 0 };
const MANUAL_REGION_SIZES = [36, 48, 72, 96, 128];
const DEFAULT_MANUAL_REGION_COLOR = '#22c55e';

const PROFILE_OPTIONS: Array<{ value: ProfileOption; label: string; hint: string }> = [
  {
    value: 'auto',
    label: 'Auto',
    hint: '按区域尺寸自动选择：小水印用 legacy_scale_0.60，大水印用 20260520。',
  },
  {
    value: 'legacy_scale_0.60',
    label: '48px 新位置',
    hint: '1024x1024 常见：48px，右/下 96px，适合脸角、手臂等强纹理区域。',
  },
  {
    value: '20260520',
    label: '96px 新版',
    hint: '大图新版：96px，右/下 192px，解决黑底残留和变深。',
  },
  {
    value: 'legacy',
    label: 'Legacy',
    hint: '旧 Gemini 水印：48px/32px 或 96px/64px。',
  },
];

const KNOWN_CASES = [
  '1024x1024：优先尝试 48px / margin 96 / legacy_scale_0.60。',
  '大图新版：优先尝试 96px / margin 192 / 20260520。',
  '旧图：保留 48px / margin 32 和 96px / margin 64。',
  '自由搜索兜底：检查 96 / 72 / 48 / 36，多用于非固定位置。',
  '失败特征：x/y 命中白底边缘、profile=false，通常需要手动框选。',
  'alpha 不匹配：白水印变深或亮边残留，换 profile 或微调 alpha 强度。',
];

function dataUrlForPath(path: string) {
  return convertFileSrc(path);
}

function parseMethod(method?: string) {
  if (!method) return [];
  const pairs = method.match(/\((.*)\)/)?.[1]?.split(',') ?? [];
  return pairs.map((item) => item.trim()).filter(Boolean);
}

function clampPreviewScale(scale: number) {
  return Math.max(MIN_PREVIEW_SCALE, Math.min(MAX_PREVIEW_SCALE, scale));
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function timestampForFileName() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export default function GeminiWatermarkLab() {
  const [imagePath, setImagePath] = useState('');
  const [imageSrc, setImageSrc] = useState('');
  const [imageName, setImageName] = useState('');
  const [outputPath, setOutputPath] = useState('');
  const [outputSrc, setOutputSrc] = useState('');
  const [savedOutputPath, setSavedOutputPath] = useState('');
  const [saveConflictPath, setSaveConflictPath] = useState('');
  const [result, setResult] = useState<GeminiWatermarkRemovalResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [profile, setProfile] = useState<ProfileOption>('auto');
  const [alphaScale, setAlphaScale] = useState(1);
  const [manualRegion, setManualRegion] = useState<WatermarkRegion | null>(null);
  const [manualRegionSize, setManualRegionSize] = useState(48);
  const [manualRegionColor, setManualRegionColor] = useState(DEFAULT_MANUAL_REGION_COLOR);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionDrag, setSelectionDrag] = useState<SelectionDragState | null>(null);
  const [nudgeActive, setNudgeActive] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [sourceImageFrame, setSourceImageFrame] = useState({ width: 0, height: 0 });
  const [sourceView, setSourceView] = useState<ViewTransform>(DEFAULT_VIEW);
  const [outputView, setOutputView] = useState<ViewTransform>(DEFAULT_VIEW);
  const [panState, setPanState] = useState<{
    target: PreviewTarget;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const nudgeTimerRef = useRef<number | null>(null);

  const methodParts = useMemo(() => parseMethod(result?.method), [result?.method]);
  const selectedProfile = PROFILE_OPTIONS.find((item) => item.value === profile);

  const measureSourceImageFrame = () => {
    const img = imgRef.current;
    if (!img) return;
    setSourceImageFrame({
      width: img.offsetWidth,
      height: img.offsetHeight,
    });
  };

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const resizeObserver = new ResizeObserver(measureSourceImageFrame);
    resizeObserver.observe(img);
    measureSourceImageFrame();

    return () => resizeObserver.disconnect();
  }, [imageSrc]);

  useEffect(() => {
    return () => {
      if (nudgeTimerRef.current) {
        window.clearTimeout(nudgeTimerRef.current);
      }
    };
  }, []);

  const showNudgeFeedback = () => {
    if (nudgeTimerRef.current) {
      window.clearTimeout(nudgeTimerRef.current);
    }
    setNudgeActive(true);
    nudgeTimerRef.current = window.setTimeout(() => {
      setNudgeActive(false);
      nudgeTimerRef.current = null;
    }, 350);
  };

  const chooseImage = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      title: '选择需要处理的 Gemini 图片',
    });

    if (!selected || typeof selected !== 'string') return;

    await authorizeFsPaths([selected]);
    if (outputPath) {
      await remove(outputPath).catch((error) => {
        console.warn('Failed to remove previous Gemini output:', outputPath, error);
      });
    }
    const name = await basename(selected);
    setImagePath(selected);
    setImageName(name);
    setImageSrc(dataUrlForPath(selected));
    setOutputPath('');
    setOutputSrc('');
    setSavedOutputPath('');
    setResult(null);
    setManualRegion(null);
    setManualRegionSize(48);
    setManualRegionColor(DEFAULT_MANUAL_REGION_COLOR);
    setSourceImageFrame({ width: 0, height: 0 });
    setSourceView(DEFAULT_VIEW);
    setOutputView(DEFAULT_VIEW);
    setPanState(null);
    setSelectionDrag(null);
    setNudgeActive(false);
  };

  const getPointerPosition = (event: React.PointerEvent<HTMLDivElement>) => {
    const img = imgRef.current;
    if (!img || imageSize.width <= 0 || imageSize.height <= 0) return null;

    const rect = img.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * imageSize.width);
    const y = Math.round(((event.clientY - rect.top) / rect.height) * imageSize.height);

    return {
      x: Math.max(0, Math.min(imageSize.width, x)),
      y: Math.max(0, Math.min(imageSize.height, y)),
    };
  };

  const buildCenteredRegion = (center: Point, size = manualRegionSize): WatermarkRegion => {
    const clampedSize = Math.max(16, Math.min(160, size));
    return {
      x: Math.max(0, Math.min(imageSize.width - clampedSize, Math.round(center.x - clampedSize / 2))),
      y: Math.max(0, Math.min(imageSize.height - clampedSize, Math.round(center.y - clampedSize / 2))),
      width: clampedSize,
      height: clampedSize,
    };
  };

  const moveManualRegion = (dx: number, dy: number) => {
    setManualRegion((region) => {
      if (!region) return region;
      return {
        ...region,
        x: clampInt(region.x + dx, 0, imageSize.width - region.width),
        y: clampInt(region.y + dy, 0, imageSize.height - region.height),
      };
    });
    showNudgeFeedback();
  };

  const resizeManualRegion = (size: number) => {
    setManualRegionSize(size);
    setManualRegion((region) => {
      if (!region) return region;
      const center = {
        x: region.x + region.width / 2,
        y: region.y + region.height / 2,
      };
      return buildCenteredRegion(center, size);
    });
  };

  const updateManualRegionField = (field: 'x' | 'y' | 'size', value: number) => {
    if (!Number.isFinite(value)) return;

    if (field === 'size') {
      resizeManualRegion(clampInt(value, 16, 160));
      showNudgeFeedback();
      return;
    }

    setManualRegion((region) => {
      if (!region) return region;
      return {
        ...region,
        [field]: clampInt(
          value,
          0,
          field === 'x' ? imageSize.width - region.width : imageSize.height - region.height
        ),
      };
    });
    showNudgeFeedback();
  };

  const handleManualRegionKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!manualRegion) return;
    const step = event.shiftKey ? 10 : 1;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveManualRegion(-step, 0);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveManualRegion(step, 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveManualRegion(0, -step);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveManualRegion(0, step);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isSelecting || !imageSrc) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    const pos = getPointerPosition(event);
    if (!pos) return;

    if (
      manualRegion &&
      pos.x >= manualRegion.x &&
      pos.x <= manualRegion.x + manualRegion.width &&
      pos.y >= manualRegion.y &&
      pos.y <= manualRegion.y + manualRegion.height
    ) {
      setSelectionDrag({ mode: 'move', start: pos, origin: manualRegion });
      return;
    }

    setSelectionDrag({ mode: 'create', start: pos });
    setManualRegion(buildCenteredRegion(pos));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isSelecting || !selectionDrag) return;
    event.preventDefault();
    const pos = getPointerPosition(event);
    if (!pos) return;

    if (selectionDrag.mode === 'move') {
      const dx = pos.x - selectionDrag.start.x;
      const dy = pos.y - selectionDrag.start.y;
      const { origin } = selectionDrag;
      setManualRegion({
        ...origin,
        x: clampInt(origin.x + dx, 0, imageSize.width - origin.width),
        y: clampInt(origin.y + dy, 0, imageSize.height - origin.height),
      });
      return;
    }

    const dragStart = selectionDrag.start;

    const x = Math.min(dragStart.x, pos.x);
    const y = Math.min(dragStart.y, pos.y);
    const width = Math.abs(pos.x - dragStart.x);
    const height = Math.abs(pos.y - dragStart.y);
    const rawSize = Math.round(Math.max(width, height));

    if (rawSize < 8) {
      setManualRegion(buildCenteredRegion(pos));
      return;
    }

    const size = Math.max(16, Math.min(160, rawSize));

    setManualRegion({
      x: Math.max(0, Math.min(imageSize.width - size, x)),
      y: Math.max(0, Math.min(imageSize.height - size, y)),
      width: size,
      height: size,
    });
  };

  const handlePointerUp = () => {
    setSelectionDrag(null);
    setPanState(null);
  };

  const getView = (target: PreviewTarget) => (target === 'source' ? sourceView : outputView);
  const setView = (target: PreviewTarget, updater: (view: ViewTransform) => ViewTransform) => {
    if (target === 'source') {
      setSourceView(updater);
    } else {
      setOutputView(updater);
    }
  };

  const zoomPreview = (target: PreviewTarget, direction: 1 | -1) => {
    setView(target, (view) => {
      const nextScale = clampPreviewScale(view.scale * (direction > 0 ? 1.2 : 1 / 1.2));
      return nextScale <= MIN_PREVIEW_SCALE ? DEFAULT_VIEW : { ...view, scale: nextScale };
    });
  };

  const resetPreview = (target: PreviewTarget) => {
    setView(target, () => DEFAULT_VIEW);
  };

  const handlePreviewWheel = (target: PreviewTarget, event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    zoomPreview(target, direction);
  };

  const handlePanPointerDown = (target: PreviewTarget, event: React.PointerEvent<HTMLDivElement>) => {
    if (target === 'source' && isSelecting) return;
    const view = getView(target);
    if (view.scale <= MIN_PREVIEW_SCALE) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPanState({
      target,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
    });
  };

  const handlePanPointerMove = (target: PreviewTarget, event: React.PointerEvent<HTMLDivElement>) => {
    if (!panState || panState.target !== target) return;
    event.preventDefault();
    const dx = event.clientX - panState.startX;
    const dy = event.clientY - panState.startY;
    setView(target, (view) => ({
      ...view,
      x: panState.originX + dx,
      y: panState.originY + dy,
    }));
  };

  const buildPreviewOutputPath = async () => {
    const labsRoot = await getLabsRoot();
    const tempDir = await join(labsRoot, 'gemini_watermark_lab', 'temp');
    await ensureDirectory(tempDir);
    const stem = imageName.replace(/\.[^/.]+$/, '') || `gemini_${Date.now()}`;
    return await join(tempDir, `${stem}_preview.png`);
  };

  const buildSavedOutputPath = async (rename = false) => {
    const labsRoot = await getLabsRoot();
    const exportDir = await join(labsRoot, 'gemini_watermark_lab', 'exports');
    await ensureDirectory(exportDir);
    const stem = imageName.replace(/\.[^/.]+$/, '') || `gemini_${Date.now()}`;
    const suffix = rename ? `_gemini_removed_${timestampForFileName()}` : '_gemini_removed';
    return await join(exportDir, `${stem}${suffix}.png`);
  };

  const cleanupDirectoryExcept = async (dirName: 'temp' | 'exports', keepPath: string) => {
    const labsRoot = await getLabsRoot();
    const dir = await join(labsRoot, 'gemini_watermark_lab', dirName);
    const entries = await readDir(dir).catch(() => []);

    await Promise.all(
      entries
        .filter((entry) => entry.isFile && entry.path !== keepPath)
        .map((entry) =>
          remove(entry.path).catch((error) => {
            console.warn(`Failed to remove old Gemini ${dirName} output:`, entry.path, error);
          })
        )
    );
  };

  const processImage = async (mode: 'auto' | 'manual') => {
    if (!imagePath || isProcessing) return;
    if (mode === 'manual' && !manualRegion) {
      toast({
        title: '需要框选区域',
        description: '请先在预览图上框选水印区域，再执行手动处理。',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    try {
      const outputInitialView = sourceView;
      const targetPath = await buildPreviewOutputPath();
      const response =
        mode === 'manual'
          ? await geminiWatermarkApi.advancedRemove({
              image_path: imagePath,
              output_path: targetPath,
              region: manualRegion ?? undefined,
              profile,
              alpha_scale: alphaScale,
            })
          : await geminiWatermarkApi.autoRemove(imagePath, targetPath);

      setResult(response);
      setOutputPath(targetPath);
      setOutputSrc(`${dataUrlForPath(targetPath)}?t=${Date.now()}`);
      setSavedOutputPath('');
      setOutputView(outputInitialView);
      await cleanupDirectoryExcept('temp', targetPath);

      if (!isGeminiWatermarkRemovalSuccessful(response)) {
        toast({
          title: '低置信处理结果',
          description: '结果已生成，但未达到可靠水印命中标准。建议框选区域后手动处理。',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Gemini 水印处理完成',
          description: response.method,
          variant: 'success',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Gemini 水印处理失败',
        description: error?.message || String(error),
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const openExportFolder = async () => {
    const labsRoot = await getLabsRoot();
    const dir = await join(labsRoot, 'gemini_watermark_lab', 'exports');
    await ensureDirectory(dir);
    await openPath(dir);
  };

  const saveOutputAs = async () => {
    if (!outputPath || !imageName) return;

    try {
      const targetPath = await buildSavedOutputPath();
      if (await exists(targetPath)) {
        setSaveConflictPath(targetPath);
        return;
      }

      await saveOutputToPath(targetPath);
    } catch (error: any) {
      toast({
        title: '保存失败',
        description: error?.message || String(error),
        variant: 'destructive',
      });
    }
  };

  const saveOutputToPath = async (targetPath: string) => {
    if (!outputPath) return;

    try {
      await copyFile(outputPath, targetPath);
      setSavedOutputPath(targetPath);
      setSaveConflictPath('');
      toast({
        title: '处理结果已保存到输出目录',
        description: targetPath,
        variant: 'success',
      });
    } catch (error: any) {
      toast({
        title: '保存失败',
        description: error?.message || String(error),
        variant: 'destructive',
      });
    }
  };

  const saveOutputWithRename = async () => {
    const targetPath = await buildSavedOutputPath(true);
    await saveOutputToPath(targetPath);
  };

  const regionStyle = (() => {
    if (
      !manualRegion ||
      imageSize.width <= 0 ||
      imageSize.height <= 0 ||
      sourceImageFrame.width <= 0 ||
      sourceImageFrame.height <= 0
    ) {
      return undefined;
    }

    const scaleX = sourceImageFrame.width / imageSize.width;
    const scaleY = sourceImageFrame.height / imageSize.height;

    return {
      left: `${Math.round(manualRegion.x * scaleX)}px`,
      top: `${Math.round(manualRegion.y * scaleY)}px`,
      width: `${Math.round(manualRegion.width * scaleX)}px`,
      height: `${Math.round(manualRegion.height * scaleY)}px`,
      backgroundColor: `${manualRegionColor}66`,
    };
  })();

  const sourceTransform = {
    transform: `translate(${sourceView.x}px, ${sourceView.y}px) scale(${sourceView.scale})`,
  };
  const outputTransform = {
    transform: `translate(${outputView.x}px, ${outputView.y}px) scale(${outputView.scale})`,
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between border-b border-border bg-card/40 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" />
            Gemini 水印高级修复
          </div>
          <div className="text-xs text-muted-foreground">
            用于一键去水印失败后的手动定位、profile 切换和 alpha 微调。
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={chooseImage}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            选择图片
          </button>
          <button
            type="button"
            onClick={openExportFolder}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            打开输出目录
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-900/5 dark:bg-black/10">
          {!imageSrc ? (
            <div className="flex h-full items-center justify-center p-8">
              <button
                type="button"
                onClick={chooseImage}
                className="flex aspect-[16/10] w-full max-w-xl flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-card p-8 text-center hover:border-primary/60 hover:bg-card/80"
              >
                <ImagePlus className="mb-4 h-10 w-10 text-primary" />
                <div className="text-sm font-semibold">选择一张 Gemini 生成图</div>
                <div className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                  自动模式会使用已知 profile；如果命中位置错误，可以在这里框选水印区域并手动处理。
                </div>
              </button>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 xl:grid-cols-2">
              <div className="flex min-h-[360px] flex-col overflow-hidden rounded-md border border-border bg-card">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">原图</div>
                    <div className="truncate text-xs text-muted-foreground" title={imageName}>
                      {imageName} {imageSize.width > 0 ? `${imageSize.width} x ${imageSize.height}` : ''} · {Math.round(sourceView.scale * 100)}%
                    </div>
                  </div>
                  <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => resetPreview('source')}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium hover:bg-muted"
                      title="重置视图"
                      aria-label="重置原图视图"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      还原
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSelecting((value) => !value);
                        setSelectionDrag(null);
                        setPanState(null);
                      }}
                      className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium ${
                        isSelecting
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background hover:bg-muted'
                      }`}
                    >
                      <Crosshair className="h-3.5 w-3.5" />
                      {isSelecting ? '正在框选' : '框选水印'}
                    </button>
                  </div>
                </div>
                <div className="relative flex flex-1 overflow-hidden">
                  <div
                    className={`flex h-full w-full touch-none select-none items-center justify-center overflow-auto p-3 ${
                      isSelecting ? 'cursor-crosshair' : sourceView.scale > 1 ? 'cursor-grab active:cursor-grabbing' : ''
                    }`}
                    onWheel={(event) => handlePreviewWheel('source', event)}
                    tabIndex={0}
                    onKeyDown={handleManualRegionKeyDown}
                    onPointerDown={(event) => {
                      handlePointerDown(event);
                      handlePanPointerDown('source', event);
                    }}
                    onPointerMove={(event) => {
                      handlePointerMove(event);
                      handlePanPointerMove('source', event);
                    }}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                  >
                  <div
                    className="relative max-h-full max-w-full origin-center transition-transform duration-75"
                    style={sourceTransform}
                  >
                    <img
                      ref={imgRef}
                      src={imageSrc}
                      alt="source"
                      className="block max-h-[70vh] max-w-full select-none object-contain"
                      draggable={false}
                      onLoad={(event) => {
                        setImageSize({
                          width: event.currentTarget.naturalWidth,
                          height: event.currentTarget.naturalHeight,
                        });
                        requestAnimationFrame(measureSourceImageFrame);
                      }}
                    />
                    {regionStyle && (
                      <div
                        className={`absolute ${
                          isSelecting ? 'cursor-move' : 'pointer-events-none'
                        } ${
                          nudgeActive ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
                        }`}
                        style={regionStyle}
                      />
                    )}
                  </div>
                  </div>
                  {manualRegion && (
                    <div className="pointer-events-none absolute bottom-8 left-3 z-10 rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground shadow-sm">
                      {nudgeActive
                        ? `x=${manualRegion.x}, y=${manualRegion.y}`
                        : `${manualRegion.width}x${manualRegion.height}`}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex min-h-[360px] flex-col overflow-hidden rounded-md border border-border bg-card">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">处理结果</div>
                    <div className="truncate text-xs text-muted-foreground" title={savedOutputPath || outputPath || undefined}>
                      {outputPath
                        ? `${savedOutputPath || '临时预览，未保存到输出目录'} · ${Math.round(outputView.scale * 100)}%`
                        : '尚未生成输出'}
                    </div>
                  </div>
                  <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1">
                    {outputPath && (
                      <>
                        <button
                          type="button"
                          onClick={() => resetPreview('output')}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium hover:bg-muted"
                          title="重置视图"
                          aria-label="重置处理结果视图"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          还原
                        </button>
                        <button
                          type="button"
                          onClick={saveOutputAs}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                        >
                          <Download className="h-3.5 w-3.5" />
                          保存到输出目录
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div
                  className={`flex flex-1 touch-none select-none items-center justify-center overflow-auto p-3 ${
                    outputView.scale > 1 ? 'cursor-grab active:cursor-grabbing' : ''
                  }`}
                  onWheel={(event) => handlePreviewWheel('output', event)}
                  onPointerDown={(event) => handlePanPointerDown('output', event)}
                  onPointerMove={(event) => handlePanPointerMove('output', event)}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                >
                  {outputSrc ? (
                    <img
                      src={outputSrc}
                      alt="output"
                      className="max-h-[70vh] max-w-full select-none object-contain transition-transform duration-75"
                      draggable={false}
                      style={outputTransform}
                    />
                  ) : (
                    <div className="text-center text-sm text-muted-foreground">
                      先运行自动处理；如果结果命中错误位置，再回到原图框选水印区域手动处理。
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden border-l border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-semibold">处理控制</div>
            <div className="mt-1 text-xs text-muted-foreground">自动优先，手动兜底。</div>
          </div>

          <div className="border-b border-border p-4 shadow-sm z-10">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => processImage('auto')}
                disabled={!imagePath || isProcessing}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eraser className="h-3.5 w-3.5" />}
                自动处理
              </button>
              <button
                type="button"
                onClick={() => processImage('manual')}
                disabled={!imagePath || !manualRegion || isProcessing}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
              >
                <MousePointer2 className="h-3.5 w-3.5" />
                手动处理
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-4 pt-5">

            <div className="space-y-2">
              <label className="text-xs font-semibold">手动区域</label>
              <div className="rounded-md border border-border bg-muted/30 p-2 font-mono text-[11px] text-muted-foreground">
                {manualRegion
                  ? `x=${manualRegion.x}, y=${manualRegion.y}, size=${manualRegion.width}x${manualRegion.height}`
                  : '未框选'}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1 text-[11px] font-medium text-muted-foreground">
                  <span>X</span>
                  <input
                    type="number"
                    min={0}
                    max={manualRegion ? imageSize.width - manualRegion.width : undefined}
                    value={manualRegion?.x ?? ''}
                    onChange={(event) => updateManualRegionField('x', Number(event.target.value))}
                    disabled={!manualRegion}
                    className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs disabled:opacity-50"
                  />
                </label>
                <label className="space-y-1 text-[11px] font-medium text-muted-foreground">
                  <span>Y</span>
                  <input
                    type="number"
                    min={0}
                    max={manualRegion ? imageSize.height - manualRegion.height : undefined}
                    value={manualRegion?.y ?? ''}
                    onChange={(event) => updateManualRegionField('y', Number(event.target.value))}
                    disabled={!manualRegion}
                    className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs disabled:opacity-50"
                  />
                </label>
                <label className="space-y-1 text-[11px] font-medium text-muted-foreground">
                  <span>Size</span>
                  <input
                    type="number"
                    min={16}
                    max={160}
                    value={manualRegion?.width ?? manualRegionSize}
                    onChange={(event) => updateManualRegionField('size', Number(event.target.value))}
                    disabled={!manualRegion}
                    className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs disabled:opacity-50"
                  />
                </label>
              </div>
              <div className="mx-auto grid w-fit grid-cols-3 items-center gap-1 rounded-md border border-border bg-background p-2">
                <div className="h-7 w-7" />
                <button
                  type="button"
                  onClick={() => moveManualRegion(0, -1)}
                  disabled={!manualRegion}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-50"
                  aria-label="上移 1px"
                  title="上移 1px"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <div className="h-7 w-7" />
                <button
                  type="button"
                  onClick={() => moveManualRegion(-1, 0)}
                  disabled={!manualRegion}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-50"
                  aria-label="左移 1px"
                  title="左移 1px"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <div className="text-center text-[10px] text-muted-foreground">1px</div>
                <button
                  type="button"
                  onClick={() => moveManualRegion(1, 0)}
                  disabled={!manualRegion}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-50"
                  aria-label="右移 1px"
                  title="右移 1px"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <div className="h-7 w-7" />
                <button
                  type="button"
                  onClick={() => moveManualRegion(0, 1)}
                  disabled={!manualRegion}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-50"
                  aria-label="下移 1px"
                  title="下移 1px"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <div className="h-7 w-7" />
              </div>
              <div className="grid grid-cols-5 gap-1">
                {MANUAL_REGION_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => resizeManualRegion(size)}
                    className={`rounded-md border px-2 py-1.5 text-[11px] font-medium ${
                      manualRegionSize === size
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background hover:bg-muted'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-2.5 py-2">
                <label className="text-[11px] font-medium text-muted-foreground" htmlFor="gemini-region-color">
                  选框颜色
                </label>
                <div className="flex items-center gap-2">
                  <span
                    className="h-5 w-5 rounded-sm"
                    style={{ backgroundColor: `${manualRegionColor}66` }}
                    aria-hidden="true"
                  />
                  <input
                    id="gemini-region-color"
                    type="color"
                    value={manualRegionColor}
                    onChange={(event) => setManualRegionColor(event.target.value)}
                    className="h-7 w-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
                    aria-label="选框颜色"
                  />
                </div>
              </div>
              <p className="text-[11px] leading-4 text-muted-foreground">
                框选模式下点击水印中心会生成标准框；方向键每次移动 1px，Shift + 方向键每次移动 10px。
              </p>
              <button
                type="button"
                onClick={() => setManualRegion(null)}
                disabled={!manualRegion}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                清除框选
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold">Alpha profile</label>
              <select
                value={profile}
                onChange={(event) => setProfile(event.target.value as ProfileOption)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs"
              >
                {PROFILE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] leading-4 text-muted-foreground">{selectedProfile?.hint}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold">Alpha 强度</label>
                <div className="flex items-center gap-2">
                  {alphaScale !== 1 && (
                    <button
                      type="button"
                      onClick={() => setAlphaScale(1)}
                      className="inline-flex items-center text-[10px] text-muted-foreground hover:text-foreground"
                      title="恢复默认值 (100%)"
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      默认
                    </button>
                  )}
                  <span className="font-mono text-xs text-primary">{Math.round(alphaScale * 100)}%</span>
                </div>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.05"
                value={alphaScale}
                onChange={(event) => setAlphaScale(Number(event.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-[11px] leading-4 text-muted-foreground">
                残留偏白可略微提高；变深或边缘发黑则降低。建议每次只调整 5%-10%。
              </p>
            </div>

            {result && (
              <div className="space-y-2 rounded-md border border-border bg-background p-3">
                <div className="text-xs font-semibold">最近一次命中信息</div>
                <div className="space-y-1">
                  {methodParts.map((part) => (
                    <div key={part} className="rounded bg-muted/50 px-2 py-1 font-mono text-[11px]">
                      {part}
                    </div>
                  ))}
                </div>
                <div
                  className={`rounded px-2 py-1 text-[11px] ${
                    isGeminiWatermarkRemovalSuccessful(result)
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  {isGeminiWatermarkRemovalSuccessful(result)
                    ? '可靠命中，可作为正式结果。'
                    : '低置信或 fallback，建议手动框选。'}
                </div>
              </div>
            )}

            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <HelpCircle className="h-3.5 w-3.5 text-primary" />
                已知处理情况
              </div>
              <ul className="space-y-1.5 text-[11px] leading-4 text-muted-foreground">
                {KNOWN_CASES.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      </div>

      <Dialog open={Boolean(saveConflictPath)} onOpenChange={(open) => !open && setSaveConflictPath('')}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>输出目录已有同名文件</DialogTitle>
            <DialogDescription className="break-all">
              {saveConflictPath}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveConflictPath('')}>
              取消
            </Button>
            <Button variant="outline" onClick={saveOutputWithRename}>
              重命名保存
            </Button>
            <Button onClick={() => saveOutputToPath(saveConflictPath)}>
              覆盖保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
