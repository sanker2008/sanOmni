import { ExportConfig, SliceItem } from './types';
import { Check, X, CheckSquare, Square } from 'lucide-react';

interface SliceGridPreviewProps {
  imageSrc: string;
  originalWidth: number;
  originalHeight: number;
  slices: SliceItem[];
  exportConfig: ExportConfig;
  onToggleSelect: (sliceId: string) => void;
  onSelectAll: (select: boolean) => void;
}

export default function SliceGridPreview({
  imageSrc,
  originalWidth,
  originalHeight,
  slices,
  exportConfig,
  onToggleSelect,
  onSelectAll,
}: SliceGridPreviewProps) {
  // Compute active indices for rendering names correctly
  const keepSlices = slices.filter((s) => s.selected);
  
  return (
    <div className="flex-1 h-full flex flex-col bg-slate-900/10 dark:bg-black/10 overflow-hidden">
      {/* Top action bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/60 shrink-0">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold">切片选择</h3>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
            保留 {keepSlices.length} / 共 {slices.length} 个切片
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectAll(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs hover:bg-muted rounded-md text-foreground transition-colors"
          >
            <CheckSquare className="w-3.5 h-3.5 text-primary" />
            全选
          </button>
          <button
            type="button"
            onClick={() => onSelectAll(false)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs hover:bg-muted rounded-md text-foreground transition-colors"
          >
            <Square className="w-3.5 h-3.5 text-muted-foreground" />
            清空选择
          </button>
        </div>
      </div>

      {/* Grid List */}
      <div className="flex-1 overflow-y-auto p-6 scroll-smooth custom-scrollbar">
        {slices.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {slices.map((slice, index) => {
              const targetW = exportConfig.width > 0 ? exportConfig.width : slice.width;
              const targetH = exportConfig.height > 0 ? exportConfig.height : slice.height;

              let outputBg = exportConfig.backgroundColor;
              if (exportConfig.format === 'jpeg' && outputBg === 'transparent') {
                outputBg = '#FFFFFF';
              }

              let drawW = slice.width;
              let drawH = slice.height;
              if (slice.width > targetW || slice.height > targetH || exportConfig.mode === 'scale-down') {
                const drawRatio = Math.min(targetW / slice.width, targetH / slice.height);
                drawW = slice.width * drawRatio;
                drawH = slice.height * drawRatio;
              }

              const boxSize = 110;
              const previewScale = Math.min(boxSize / targetW, boxSize / targetH);
              const canvasW = targetW * previewScale;
              const canvasH = targetH * previewScale;
              const thumbW = drawW * previewScale;
              const thumbH = drawH * previewScale;
              const thumbX = ((targetW - drawW) / 2) * previewScale;
              const thumbY = ((targetH - drawH) / 2) * previewScale;

              // Generate background sprite parameters
              const sourceScale = (drawW / slice.width) * previewScale;
              const bgX = slice.x * sourceScale;
              const bgY = slice.y * sourceScale;
              const bgW = originalWidth * sourceScale;
              const bgH = originalHeight * sourceScale;
              const dimensionLabel = `${Math.round(targetW)} × ${Math.round(targetH)}`;

              return (
                <button
                  key={slice.id}
                  type="button"
                  onClick={() => onToggleSelect(slice.id)}
                  className={`group relative flex flex-col items-center bg-card rounded-lg border text-left overflow-hidden transition-all duration-200 focus:outline-none hover:shadow-md ${
                    slice.selected
                      ? 'border-emerald-500/50 dark:border-emerald-500/40 ring-1 ring-emerald-500/10 shadow-[0_2px_8px_rgba(16,185,129,0.08)]'
                      : 'border-border/60 hover:border-border opacity-70 grayscale-[20%]'
                  }`}
                >
                  {/* Thumbnail Area */}
                  <div className="w-full h-[130px] flex items-center justify-center bg-slate-950/20 dark:bg-black/30 relative border-b border-border/40 select-none">
                    {/* Export canvas preview */}
                    <div
                      className={`relative overflow-hidden transition-transform duration-200 group-hover:scale-[1.03] ${
                        outputBg === 'transparent' ? 'bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%),linear-gradient(-45deg,#e5e7eb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e7eb_75%),linear-gradient(-45deg,transparent_75%,#e5e7eb_75%)] bg-[length:12px_12px] bg-[position:0_0,0_6px,6px_-6px,-6px_0px] dark:bg-[linear-gradient(45deg,#374151_25%,transparent_25%),linear-gradient(-45deg,#374151_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#374151_75%),linear-gradient(-45deg,transparent_75%,#374151_75%)]'
                          : ''
                      }`}
                      title={`Export preview ${dimensionLabel}`}
                      style={{
                        width: canvasW,
                        height: canvasH,
                        backgroundColor: outputBg !== 'transparent' ? outputBg : undefined,
                      }}
                    >
                      {/* Sprite Slice */}
                      <div
                        className="absolute"
                        style={{
                          left: thumbX,
                          top: thumbY,
                          width: thumbW,
                          height: thumbH,
                          backgroundImage: `url(${imageSrc})`,
                          backgroundPosition: `-${bgX}px -${bgY}px`,
                          backgroundSize: `${bgW}px ${bgH}px`,
                          backgroundRepeat: 'no-repeat',
                        }}
                      />
                    </div>

                    {/* Discarded Overlay Cover */}
                    {!slice.selected && (
                      <div className="absolute inset-0 bg-destructive/10 backdrop-blur-[0.5px] flex items-center justify-center">
                        <div className="bg-destructive/90 text-destructive-foreground text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm flex items-center gap-1">
                          <X className="w-2.5 h-2.5" />
                          已排除
                        </div>
                      </div>
                    )}

                    {/* Checkmark Tag */}
                    {slice.selected && (
                      <div className="absolute top-2 right-2 bg-emerald-500 text-white rounded-full p-0.5 shadow-sm">
                        <Check className="w-3 h-3 stroke-[3px]" />
                      </div>
                    )}

                    <div className="absolute top-2 left-2 bg-primary/90 text-primary-foreground font-mono text-[9px] px-1 py-0.2 rounded shadow-sm">
                      {dimensionLabel}
                    </div>

                    {/* Dimension Tag */}
                    <div className="absolute bottom-1.5 left-2 bg-black/60 text-white font-mono text-[9px] px-1 py-0.2 rounded opacity-75">
                      {Math.round(slice.width)} × {Math.round(slice.height)}
                    </div>
                  </div>

                  {/* Meta Label Info */}
                  <div className="w-full p-2.5 flex flex-col gap-0.5 bg-card/40">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-foreground/90 font-mono">
                        R{slice.row} C{slice.col}
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground">
                        #{index + 1}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground/80 truncate">
                      {slice.isGutter ? (
                        <span className="text-rose-500 font-medium">间距 (Gutter)</span>
                      ) : (
                        <span>切片图</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-12">
            <p className="text-sm">暂无切片数据，请先在参考线编辑器中添加参考线。</p>
          </div>
        )}
      </div>
    </div>
  );
}
