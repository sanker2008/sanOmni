import { useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { basename, dirname } from '@tauri-apps/api/path';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Film,
  FolderOpen,
  Loader2,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/useToast';
import { openPath } from '@/lib/pathUtils';
import { authorizeFsPaths } from '@/services/secureFs';
import {
  inspectGeminiVideo,
  processGeminiVideo,
  type GeminiVideoMetadata,
  type GeminiVideoProcessResult,
  type GeminiVideoProgress,
} from './engine';
import { writeLargeVideoFile } from './fs';
import VideoPreviewPanel from './VideoPreviewPanel';

type SelectedVideo = {
  file: File;
  path?: string;
};

const STAGE_LABELS: Record<GeminiVideoProgress['stage'], string> = {
  analyzing: '读取视频信息…',
  calibrating: '分析前 5 帧并定位水印…',
  processing: '逐帧反算并重新编码…',
  finalizing: '写入音频并封装 MP4…',
  done: '处理完成',
};

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function useObjectUrl(blob?: Blob) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) {
      setUrl('');
      return undefined;
    }
    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);
  return url;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return '--:--';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function outputNameFor(name: string) {
  return `${name.replace(/\.[^.]+$/, '') || 'gemini-video'}_watermark_removed.mp4`;
}

function progressRatio(progress: GeminiVideoProgress | null) {
  if (!progress) return 0;
  if (progress.stage === 'analyzing') return 0.02;
  if (progress.stage === 'calibrating') return 0.02 + progress.ratio * 0.08;
  if (progress.stage === 'processing') return 0.1 + progress.ratio * 0.86;
  if (progress.stage === 'finalizing') return 0.98;
  return 1;
}

export default function GeminiVideoWatermarkLab() {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [selected, setSelected] = useState<SelectedVideo | null>(null);
  const [metadata, setMetadata] = useState<GeminiVideoMetadata | null>(null);
  const [result, setResult] = useState<GeminiVideoProcessResult | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [savedPath, setSavedPath] = useState('');
  const [progress, setProgress] = useState<GeminiVideoProgress | null>(null);
  const [alphaScale, setAlphaScale] = useState(1);
  const [shiftX, setShiftX] = useState(0);
  const [shiftY, setShiftY] = useState(0);

  const sourceUrl = useObjectUrl(selected?.file);
  const outputUrl = useObjectUrl(result?.blob);
  const outputName = useMemo(
    () => outputNameFor(selected?.file.name ?? 'gemini-video.mp4'),
    [selected?.file.name],
  );
  const compatible = Boolean(
    metadata?.supportedDimensions && metadata.decodable && metadata.encodable,
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  const loadFile = async (file: File, path?: string) => {
    setSelected({ file, path });
    setMetadata(null);
    setResult(null);
    setSavedPath('');
    setProgress(null);
    setIsInspecting(true);
    try {
      const nextMetadata = await inspectGeminiVideo(file);
      setMetadata(nextMetadata);
    } catch (error) {
      toast({
        title: '无法读取视频',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsInspecting(false);
    }
  };

  const chooseVideo = async () => {
    if (!isTauriRuntime()) {
      inputRef.current?.click();
      return;
    }
    const selectedPath = await open({
      multiple: false,
      directory: false,
      title: '选择 Gemini 生成的 MP4 视频',
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
    });
    if (!selectedPath || typeof selectedPath !== 'string') return;

    try {
      await authorizeFsPaths([selectedPath]);
      const response = await fetch(convertFileSrc(selectedPath));
      if (!response.ok) throw new Error(`读取视频失败：${response.status}`);
      const blob = await response.blob();
      const name = await basename(selectedPath);
      await loadFile(new File([blob], name, { type: 'video/mp4' }), selectedPath);
    } catch (error) {
      toast({
        title: '选择视频失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  const startProcessing = async () => {
    if (!selected || !compatible || isProcessing) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsProcessing(true);
    setResult(null);
    setSavedPath('');
    setProgress({ stage: 'analyzing', ratio: 0 });
    try {
      const nextResult = await processGeminiVideo(selected.file, {
        alphaScale,
        shiftX,
        shiftY,
        signal: controller.signal,
        onProgress: setProgress,
      });
      setResult(nextResult);
      toast({ title: '视频处理完成', description: '可先预览结果，再保存 MP4。' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast({ title: '已取消视频处理' });
      } else {
        toast({
          title: '视频处理失败',
          description: error instanceof Error ? error.message : String(error),
          variant: 'destructive',
        });
      }
    } finally {
      abortRef.current = null;
      setIsProcessing(false);
    }
  };

  const saveOutput = async () => {
    if (!result || isSaving) return;
    if (!isTauriRuntime()) {
      const anchor = document.createElement('a');
      anchor.href = outputUrl;
      anchor.download = outputName;
      anchor.click();
      return;
    }

    const targetPath = await save({
      title: '保存处理后的视频',
      defaultPath: outputName,
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
    });
    if (!targetPath) return;

    setIsSaving(true);
    setSaveProgress(0);
    try {
      const parent = await dirname(targetPath);
      await authorizeFsPaths([parent]);
      const bytes = new Uint8Array(await result.blob.arrayBuffer());
      await writeLargeVideoFile(targetPath, bytes, setSaveProgress);
      setSavedPath(targetPath);
      toast({ title: '视频已保存', description: targetPath });
    } catch (error) {
      toast({
        title: '保存视频失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const statusMessage = !metadata
    ? '等待读取视频信息'
    : !metadata.supportedDimensions
      ? `不支持 ${metadata.width}×${metadata.height}`
      : !metadata.decodable
        ? `当前环境无法解码 ${metadata.videoCodec}`
        : !metadata.encodable
          ? '当前环境无法编码 H.264'
          : '本机 WebCodecs 可处理';

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,.mp4"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void loadFile(file);
          event.currentTarget.value = '';
        }}
      />

      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Film className="h-4 w-4 text-primary" />
            Gemini 视频水印修复
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            本地逐帧反算可见星形水印，重新编码 H.264，原 AAC 音频直接复制。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={chooseVideo} disabled={isProcessing}>
            <Upload className="mr-1.5 h-4 w-4" />
            选择 MP4
          </Button>
          {result && (
            <Button size="sm" onClick={saveOutput} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-4 w-4" />
              )}
              {isSaving ? `保存中 ${Math.round(saveProgress * 100)}%` : '保存结果'}
            </Button>
          )}
          {savedPath && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => dirname(savedPath).then(openPath)}
            >
              <FolderOpen className="mr-1.5 h-4 w-4" />
              打开目录
            </Button>
          )}
        </div>
      </header>

      {!selected ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <button
            type="button"
            onClick={chooseVideo}
            className="flex aspect-[16/9] w-full max-w-2xl flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-card p-8 text-center transition-colors hover:border-primary/60 hover:bg-muted/20"
          >
            <Film className="mb-4 h-12 w-12 text-primary" />
            <span className="text-sm font-semibold">选择 Gemini 生成的 MP4 视频</span>
            <span className="mt-2 max-w-md text-xs leading-5 text-muted-foreground">
              当前支持横竖版 720p 和 1080p。视频只在本机处理，不上传第三方服务器。
            </span>
          </button>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_330px]">
          <main className="min-h-0 overflow-auto bg-slate-900/5 p-3 dark:bg-black/10">
            <div className="grid min-h-full grid-cols-1 gap-3 2xl:grid-cols-2">
              <VideoPreviewPanel
                title="原视频"
                subtitle={`${selected.file.name} · ${formatBytes(selected.file.size)}`}
                src={sourceUrl}
                emptyLabel="正在加载原视频"
              />
              <VideoPreviewPanel
                title="处理结果"
                subtitle={result ? `${outputName} · ${formatBytes(result.blob.size)}` : '完成处理后可在这里对比播放'}
                src={outputUrl}
                isLoading={isProcessing}
                emptyLabel={isProcessing ? STAGE_LABELS[progress?.stage ?? 'analyzing'] : '尚未生成处理结果'}
              />
            </div>
          </main>

          <aside className="min-h-0 overflow-y-auto border-l border-border bg-card/40 p-4">
            <div className="space-y-5">
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  兼容性检查
                </div>
                <div className={`rounded-md border p-3 ${compatible ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-background'}`}>
                  <div className="flex items-center gap-2 text-xs font-medium">
                    {compatible ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : isInspecting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                    )}
                    {isInspecting ? '正在检测…' : statusMessage}
                  </div>
                  {metadata && (
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                      <div><dt className="text-muted-foreground">尺寸</dt><dd>{metadata.width}×{metadata.height}</dd></div>
                      <div><dt className="text-muted-foreground">时长</dt><dd>{formatDuration(metadata.duration)}</dd></div>
                      <div><dt className="text-muted-foreground">视频</dt><dd>{metadata.videoCodec} / {metadata.frameRate} fps</dd></div>
                      <div><dt className="text-muted-foreground">音频</dt><dd>{metadata.audioCodec ?? '无音频'}</dd></div>
                    </dl>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  修复参数
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="gemini-video-alpha">Alpha 强度</label>
                    <span className="font-mono text-primary">{Math.round(alphaScale * 100)}%</span>
                  </div>
                  <input
                    id="gemini-video-alpha"
                    type="range"
                    min="0.8"
                    max="1.2"
                    step="0.05"
                    value={alphaScale}
                    onChange={(event) => setAlphaScale(Number(event.target.value))}
                    disabled={isProcessing}
                    className="w-full accent-primary"
                  />
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    水印偏白时略微提高；出现黑边或变深时降低。
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-[11px] text-muted-foreground">
                    <span>X 微调</span>
                    <input
                      type="number"
                      min={-128}
                      max={128}
                      value={shiftX}
                      onChange={(event) => setShiftX(Number(event.target.value) || 0)}
                      disabled={isProcessing}
                      className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
                    />
                  </label>
                  <label className="space-y-1 text-[11px] text-muted-foreground">
                    <span>Y 微调</span>
                    <input
                      type="number"
                      min={-128}
                      max={128}
                      value={shiftY}
                      onChange={(event) => setShiftY(Number(event.target.value) || 0)}
                      disabled={isProcessing}
                      className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground"
                    />
                  </label>
                </div>
                {(alphaScale !== 1 || shiftX !== 0 || shiftY !== 0) && (
                  <button
                    type="button"
                    onClick={() => { setAlphaScale(1); setShiftX(0); setShiftY(0); }}
                    disabled={isProcessing}
                    className="inline-flex items-center text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    恢复默认参数
                  </button>
                )}
              </section>

              {isProcessing && progress && (
                <section className="space-y-2" aria-live="polite">
                  <div className="flex items-center justify-between text-xs">
                    <span>{STAGE_LABELS[progress.stage]}</span>
                    <span className="font-mono">{Math.round(progressRatio(progress) * 100)}%</span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progressRatio(progress) * 100)}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-150"
                      style={{ width: `${progressRatio(progress) * 100}%` }}
                    />
                  </div>
                </section>
              )}

              <div className="flex gap-2">
                <Button className="flex-1" onClick={startProcessing} disabled={!compatible || isProcessing || isInspecting}>
                  {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
                  {isProcessing ? '处理中' : result ? '重新处理' : '开始处理'}
                </Button>
                {isProcessing && (
                  <Button variant="outline" size="icon" onClick={() => abortRef.current?.abort()} aria-label="取消视频处理">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {result && (
                <section className="rounded-md border border-border bg-background p-3 text-[11px]">
                  <div className="mb-2 text-xs font-semibold">最近一次定位</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-muted-foreground">模板：</span>{result.calibration.size}px</div>
                    <div><span className="text-muted-foreground">透明度：</span>{Math.round(result.calibration.opacity * 100)}%</div>
                    <div><span className="text-muted-foreground">坐标：</span>{result.calibration.x}, {result.calibration.y}</div>
                    <div><span className="text-muted-foreground">边距：</span>{result.calibration.rightMargin}, {result.calibration.bottomMargin}</div>
                    <div><span className="text-muted-foreground">相关性：</span>{result.calibration.score.toFixed(3)}</div>
                    <div><span className="text-muted-foreground">耗时：</span>{(result.processingTimeMs / 1000).toFixed(1)}s</div>
                  </div>
                </section>
              )}

              <section className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] leading-4 text-muted-foreground">
                <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  处理范围
                </div>
                只修复可见星形水印；Google 隐藏的 SynthID 不会被移除。输出视频会重新编码，建议保留原文件。
              </section>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
