import type { Viewport } from './types';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface CanvasStatusBarProps {
  viewport: Viewport;
  nodeCount: number;
  edgeCount: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

export default function CanvasStatusBar({
  viewport,
  nodeCount,
  edgeCount,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: CanvasStatusBarProps) {
  const zoomPercent = Math.round(viewport.zoom * 100);

  return (
    <div className="h-8 border-t border-border bg-card/60 px-4 flex items-center justify-between text-xs text-muted-foreground select-none z-30">
      {/* Zoom Controls */}
      <div className="flex items-center gap-1.5 font-mono">
        <button
          type="button"
          onClick={onZoomOut}
          className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors"
          title="缩小"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <span className="w-12 text-center font-bold text-foreground">{zoomPercent}%</span>

        <button
          type="button"
          onClick={onZoomIn}
          className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors"
          title="放大"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onResetZoom}
          className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors ml-1"
          title="重置到 100%"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Middle Stats */}
      <div className="flex items-center gap-4">
        <span>节点: <strong className="text-foreground">{nodeCount}</strong> 个</span>
        <span>连线: <strong className="text-foreground">{edgeCount}</strong> 条</span>
      </div>

      {/* Right Tips */}
      <div className="text-[11px] text-muted-foreground/80">
        滚轮缩放 · 按住拖拽平移 · 从右点向左点拉连线
      </div>
    </div>
  );
}
