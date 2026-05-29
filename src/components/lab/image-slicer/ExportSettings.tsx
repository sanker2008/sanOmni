import { useState } from 'react';
import { ExportConfig, SliceItem } from './types';
import { generateSliceFileName } from './utils';
import { openExportFolder } from './fs';
import { Folder, FolderOpen, Loader2, Download, Check } from 'lucide-react';
import { toast } from '@/hooks/useToast';

interface ExportSettingsProps {
  originalFilename: string;
  slices: SliceItem[];
  config: ExportConfig;
  onUpdateConfig: (updated: Partial<ExportConfig>) => void;
  onExport: () => void;
  isExporting: boolean;
  exportProgress: number;
}

const PRESET_SIZES = [
  { label: '原尺寸', w: 0, h: 0 },
  { label: '240x240', w: 240, h: 240 },
  { label: '500x500', w: 500, h: 500 },
  { label: '800x800', w: 800, h: 800 },
  { label: '1000x1000', w: 1000, h: 1000 },
];

export default function ExportSettings({
  originalFilename,
  slices,
  config,
  onUpdateConfig,
  onExport,
  isExporting,
  exportProgress,
}: ExportSettingsProps) {
  const [copiedBadge, setCopiedBadge] = useState<string | null>(null);

  // Choose folder using Tauri Plugin Dialog
  const handleChooseFolder = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择导出目录',
      });
      if (selected && typeof selected === 'string') {
        onUpdateConfig({ exportPath: selected });
        toast({ title: '导出目录已更新', description: selected, variant: 'default' });
      }
    } catch (err: any) {
      console.error('Folder selection failed:', err);
      toast({
        title: '选择目录失败',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    }
  };

  const handleOpenFolder = async () => {
    if (!config.exportPath) return;
    try {
      await openExportFolder(config.exportPath);
    } catch (err: any) {
      console.error('Failed to open export folder:', err);
      toast({
        title: '打开目录失败',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    }
  };

  const activeSlices = slices.filter((s) => s.selected);

  // Generate file name previews for the first 3 files
  const previews = activeSlices.slice(0, 3).map((slice, i) => {
    return generateSliceFileName(
      config.namingPattern,
      originalFilename,
      i + 1,
      slice.row,
      slice.col,
      slice.x,
      slice.y,
      slice.width,
      slice.height,
      config.format
    );
  });

  const appendPlaceholder = (placeholder: string) => {
    onUpdateConfig({ namingPattern: config.namingPattern + placeholder });
    setCopiedBadge(placeholder);
    setTimeout(() => setCopiedBadge(null), 1000);
  };

  return (
    <div className="w-[320px] shrink-0 border-l border-border bg-card flex flex-col h-full overflow-hidden select-none">
      {/* Title */}
      <div className="px-4 py-3 border-b border-border bg-card/60 flex items-center justify-between shrink-0">
        <h3 className="text-sm font-semibold">导出配置</h3>
        {config.exportPath && (
          <button
            type="button"
            onClick={handleOpenFolder}
            className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            title="在系统文件管理器中打开"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            打开目录
          </button>
        )}
      </div>

      {/* Settings Form Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
        {/* 1. Target Canvas Settings */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-foreground/80">画布大小 (保留图片尺寸)</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-muted-foreground block mb-1">宽度 (px)</span>
              <input
                type="number"
                min={1}
                value={config.width || ''}
                onChange={(e) => onUpdateConfig({ width: parseInt(e.target.value) || 0 })}
                placeholder="原大小"
                className="w-full text-xs px-2.5 py-1.5 bg-muted/40 border border-border/80 rounded-md focus:outline-none focus:border-primary/50 text-foreground font-mono"
              />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block mb-1">高度 (px)</span>
              <input
                type="number"
                min={1}
                value={config.height || ''}
                onChange={(e) => onUpdateConfig({ height: parseInt(e.target.value) || 0 })}
                placeholder="原大小"
                className="w-full text-xs px-2.5 py-1.5 bg-muted/40 border border-border/80 rounded-md focus:outline-none focus:border-primary/50 text-foreground font-mono"
              />
            </div>
          </div>
          {/* Preset buttons */}
          <div className="flex flex-wrap gap-1">
            {PRESET_SIZES.map((preset) => {
              const isActive = config.width === preset.w && config.height === preset.h;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onUpdateConfig({ width: preset.w, height: preset.h })}
                  className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                    isActive
                      ? 'bg-primary/10 border-primary/40 text-primary font-medium'
                      : 'bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          {/* Info explanation */}
          <p className="text-[10px] text-muted-foreground leading-normal mt-1.5 bg-muted/30 p-2 rounded">
            💡 <span className="font-medium text-foreground/80">适配规则：</span>
            如果开启设定尺寸，切片若小于尺寸将<b>居中放置</b>，若大于尺寸将<b>等比例缩小到完整显示</b>。若不设置或宽度为0，则按切片实际尺寸保存。
          </p>
        </div>

        {/* 2. Background Fill Color */}
        {config.width > 0 && config.height > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground/80 block">填充背景色</label>
            <select
              value={config.backgroundColor}
              onChange={(e) => onUpdateConfig({ backgroundColor: e.target.value })}
              className="w-full text-xs px-2.5 py-1.5 bg-muted/40 border border-border/80 rounded-md focus:outline-none focus:border-primary/50 text-foreground"
            >
              <option value="transparent">
                {config.format === 'jpeg' ? '自动填充白色 (JPEG不支持透明)' : '透明 (Transparent)'}
              </option>
              <option value="#FFFFFF">白色 (White)</option>
              <option value="#000000">黑色 (Black)</option>
              <option value="#F3F4F6">灰白 (Light Gray)</option>
            </select>
          </div>
        )}

        {/* 3. Export Format */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground/80 block">保存格式</label>
          <div className="grid grid-cols-3 gap-1">
            {(['png', 'jpeg', 'webp'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => onUpdateConfig({ format: fmt })}
                className={`text-xs py-1.5 rounded-md border font-semibold uppercase transition-colors ${
                  config.format === fmt
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'bg-muted/40 border-border/80 text-muted-foreground hover:bg-muted/70'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
          {config.format === 'jpeg' && (
            <p className="text-[10px] text-amber-500 font-medium leading-normal mt-1.5 bg-amber-500/10 p-2 rounded border border-amber-500/20">
              💡 JPEG 格式不支持透明通道。透明背景或原始图像中包含的透明区域在导出时将自动填充为白色。
            </p>
          )}
          {/* Quality slider for lossy formats */}
          {config.format !== 'png' && (
            <div className="pt-1.5">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                <span>压缩质量 (Quality)</span>
                <span className="font-semibold text-foreground">{Math.round(config.quality * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={config.quality}
                onChange={(e) => onUpdateConfig({ quality: parseFloat(e.target.value) })}
                className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          )}
        </div>

        {/* 4. Naming Templates */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground/80 block">命名规则</label>
          <input
            type="text"
            value={config.namingPattern}
            onChange={(e) => onUpdateConfig({ namingPattern: e.target.value })}
            placeholder="{filename}_slice_{index}"
            className="w-full text-xs px-2.5 py-1.5 bg-muted/40 border border-border/80 rounded-md focus:outline-none focus:border-primary/50 text-foreground font-mono"
          />
          {/* Placeholders badges */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[
              { label: '原文件名', code: '{filename}' },
              { label: '索引', code: '{index}' },
              { label: '行号', code: '{row}' },
              { label: '列号', code: '{col}' },
              { label: '切片宽', code: '{width}' },
              { label: '切片高', code: '{height}' },
            ].map((ph) => (
              <button
                key={ph.code}
                type="button"
                onClick={() => appendPlaceholder(ph.code)}
                className="text-[10px] px-1.5 py-0.5 bg-muted hover:bg-muted-foreground/15 text-muted-foreground hover:text-foreground rounded transition-colors flex items-center gap-0.5"
                title={`点击追加 ${ph.code}`}
              >
                {copiedBadge === ph.code ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : null}
                {ph.label}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Naming Live Preview */}
        {previews.length > 0 && (
          <div className="space-y-1.5 p-3 rounded-lg border border-border/50 bg-slate-950/5 dark:bg-black/10">
            <span className="text-[10px] font-semibold text-muted-foreground block uppercase tracking-wider">
              文件名预览 (前 {previews.length} 个)
            </span>
            <div className="space-y-1 font-mono text-[10px] text-muted-foreground/90 break-all select-all">
              {previews.map((name, i) => (
                <div key={i} className="flex items-start gap-1">
                  <span className="text-[9px] bg-muted text-muted-foreground/75 px-1 rounded scale-90 origin-left">
                    #{i + 1}
                  </span>
                  <span>{name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. Export Directory Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground/80 block">导出目录</label>
          <div className="flex gap-1.5">
            <input
              type="text"
              readOnly
              value={config.exportPath}
              placeholder="请选择导出文件夹..."
              className="flex-1 text-[11px] px-2.5 py-1.5 bg-muted/30 border border-border/80 rounded-md text-muted-foreground truncate select-all"
              title={config.exportPath}
            />
            <button
              type="button"
              onClick={handleChooseFolder}
              className="px-3 bg-muted hover:bg-muted-foreground/10 border border-border/80 rounded-md text-foreground transition-colors shrink-0"
              title="选择文件夹"
            >
              <Folder className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Footer Export Trigger Button */}
      <div className="p-4 border-t border-border bg-card/80 shrink-0">
        {isExporting ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                正在导出切片...
              </span>
              <span className="font-semibold text-foreground">{exportProgress}%</span>
            </div>
            {/* Progress Bar */}
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={activeSlices.length === 0 || !config.exportPath}
            onClick={onExport}
            className={`w-full py-2 px-4 rounded-md font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-all ${
              activeSlices.length === 0 || !config.exportPath
                ? 'bg-muted/50 border border-border/40 text-muted-foreground/50 cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/95 hover:shadow active:scale-[0.98]'
            }`}
          >
            <Download className="w-4 h-4" />
            执行导出 ({activeSlices.length} 个切片)
          </button>
        )}
      </div>
    </div>
  );
}
