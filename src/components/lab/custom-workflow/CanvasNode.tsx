import React, { useState } from 'react';
import type { CanvasNodeDef, NodeProgress } from './types';
import { getAdapter } from './adapters';
import {
  Sparkles,
  Minimize2,
  Eraser,
  PenTool,
  Scissors,
  Film,
  FileType,
  ImageIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Settings,
  Trash2,
  ChevronUp,
  Upload,
  Play,
} from 'lucide-react';
import { pickFiles } from '@/lib/tauriFilePicker';
import { convertFileSrc } from '@tauri-apps/api/core';

const ICON_MAP: Record<string, React.ReactNode> = {
  Sparkles: <Sparkles className="w-4 h-4 text-cyan-500" />,
  Minimize2: <Minimize2 className="w-4 h-4 text-amber-500" />,
  Eraser: <Eraser className="w-4 h-4 text-rose-500" />,
  PenTool: <PenTool className="w-4 h-4 text-emerald-500" />,
  Scissors: <Scissors className="w-4 h-4 text-indigo-500" />,
  Film: <Film className="w-4 h-4 text-purple-500" />,
  FileType: <FileType className="w-4 h-4 text-sky-500" />,
  ImageIcon: <ImageIcon className="w-4 h-4 text-primary" />,
};

interface CanvasNodeProps {
  node: CanvasNodeDef;
  isSelected: boolean;
  progress?: NodeProgress;
  onSelect: (id: string) => void;
  onDragStart: (id: string, e: React.MouseEvent) => void;
  onDelete: (id: string) => void;
  onRunNode?: (id: string) => void;
  onConfigChange: (id: string, key: string, value: any) => void;
  onSetInputPaths: (id: string, paths: string[]) => void;
  onStartConnection: (nodeId: string, portType: 'output', e: React.MouseEvent) => void;
  onEndConnection: (nodeId: string, portType: 'input') => void;
}

export const NODE_WIDTH = 260;

export default function CanvasNode({
  node,
  isSelected,
  progress,
  onSelect,
  onDragStart,
  onDelete,
  onRunNode,
  onConfigChange,
  onSetInputPaths,
  onStartConnection,
  onEndConnection,
}: CanvasNodeProps) {
  const [showConfig, setShowConfig] = useState(false);
  const adapter = getAdapter(node.adapterId);

  const isInputNode = node.type === 'input' || node.adapterId === 'input-image';
  const title = isInputNode ? '图片输入' : adapter?.name || node.adapterId;
  const icon = isInputNode ? ICON_MAP.ImageIcon : (adapter ? ICON_MAP[adapter.icon] : null);

  const status = progress?.status || node.status || 'idle';
  const preview = progress?.outputPreview || node.outputPreview;
  const duration = progress?.durationMs || node.durationMs;
  const error = progress?.error || node.error;

  const handlePickFile = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const picked = await pickFiles({ multiple: true, extensions: ['png', 'jpg', 'jpeg', 'webp'] });
    if (picked && picked.length > 0) {
      onSetInputPaths(node.id, picked.map(p => p.path));
    }
  };

  return (
    <div
      style={{
        transform: `translate(${node.x}px, ${node.y}px)`,
        width: `${NODE_WIDTH}px`,
      }}
      className={`absolute select-none group bg-card border rounded-xl shadow-md transition-shadow ${
        isSelected ? 'border-primary ring-2 ring-primary/20 shadow-lg z-20' : 'border-border/80 hover:border-primary/50 z-10'
      } ${status === 'processing' ? 'ring-2 ring-cyan-500/50 border-cyan-500 animate-pulse' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
    >
      {/* Node Input Port (Left side) */}
      {!isInputNode && (
        <div
          title="输入端口（拖拽到此处建立连接）"
          className="absolute -left-3 top-6 w-6 h-6 rounded-full bg-background border-2 border-primary flex items-center justify-center cursor-pointer hover:scale-125 transition-transform z-30 shadow-sm"
          onMouseUp={(e) => {
            e.stopPropagation();
            onEndConnection(node.id, 'input');
          }}
        >
          <div className="w-2 h-2 rounded-full bg-primary" />
        </div>
      )}

      {/* Node Output Port (Right side) */}
      <div
        title="输出端口（按住拖拽连接下一个节点）"
        className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-background border-2 border-primary flex items-center justify-center cursor-pointer hover:scale-125 transition-transform z-30 shadow-sm"
        onMouseDown={(e) => {
          e.stopPropagation();
          onStartConnection(node.id, 'output', e);
        }}
      >
        <div className="w-2 h-2 rounded-full bg-primary" />
      </div>

      {/* Node Header (Draggable Handle) */}
      <div
        className="px-3.5 py-2.5 bg-muted/30 border-b border-border/60 rounded-t-xl flex items-center justify-between cursor-grab active:cursor-grabbing"
        onMouseDown={(e) => onDragStart(node.id, e)}
      >
        <div className="flex items-center gap-2 truncate">
          <div className="shrink-0">{icon}</div>
          <span className="text-xs font-bold truncate text-foreground/90">{title}</span>
        </div>

        <div className="flex items-center gap-1">
          {status === 'processing' && <Loader2 className="w-3.5 h-3.5 text-cyan-500 animate-spin" />}
          {status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
          {status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}

          {onRunNode && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRunNode(node.id);
              }}
              className="p-1 text-primary hover:text-cyan-400 hover:bg-primary/10 rounded transition-colors"
              title="单独运行此节点"
            >
              <Play className="w-3.5 h-3.5 fill-primary/20" />
            </button>
          )}

          {adapter && adapter.configSchema.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowConfig(!showConfig);
              }}
              className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
              title="配置参数"
            >
              {showConfig ? <ChevronUp className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id);
            }}
            className="p-1 text-muted-foreground hover:text-rose-500 rounded transition-colors"
            title="删除节点"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Node Body */}
      <div className="p-3 space-y-2 text-xs">
        {/* Input node image selector */}
        {isInputNode && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handlePickFile}
              className="w-full py-2 bg-muted/40 hover:bg-muted border border-dashed border-border/80 rounded-lg text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{node.inputPaths && node.inputPaths.length > 0 ? `已选 ${node.inputPaths.length} 张图片` : '选择图片...'}</span>
            </button>

            {node.inputPaths && node.inputPaths.length > 0 && (
              <div className="aspect-video relative rounded-lg overflow-hidden bg-black/5 border border-border/50">
                <img
                  src={convertFileSrc(node.inputPaths[0])}
                  className="w-full h-full object-contain"
                  alt="input"
                />
              </div>
            )}
          </div>
        )}

        {/* Config Form */}
        {showConfig && adapter && adapter.configSchema.length > 0 && (
          <div className="space-y-2.5 pt-1 border-t border-border/50">
            {adapter.configSchema.map((field) => {
              const val = node.config[field.key] ?? field.defaultValue;
              return (
                <div key={field.key} className="space-y-1">
                  <div className="flex justify-between items-center text-[11px] text-muted-foreground font-medium">
                    <span>{field.label}</span>
                    {field.type === 'range' && <span className="font-mono text-primary">{val}{field.unit}</span>}
                  </div>

                  {field.type === 'range' && (
                    <input
                      type="range"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={Number(val)}
                      onChange={(e) => onConfigChange(node.id, field.key, parseFloat(e.target.value))}
                      className="w-full accent-primary h-1 bg-muted rounded cursor-pointer"
                    />
                  )}

                  {field.type === 'number' && (
                    <input
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={Number(val)}
                      onChange={(e) => onConfigChange(node.id, field.key, parseFloat(e.target.value))}
                      className="w-full px-2 py-1 bg-muted/40 border border-border/80 rounded text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                    />
                  )}

                  {field.type === 'select' && (
                    <select
                      value={String(val)}
                      onChange={(e) => onConfigChange(node.id, field.key, e.target.value)}
                      className="w-full px-2 py-1 bg-muted/40 border border-border/80 rounded text-xs text-foreground focus:outline-none focus:border-primary"
                    >
                      {field.options?.map((opt) => (
                        <option key={String(opt.value)} value={String(opt.value)}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Output Preview */}
        {preview && (
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>处理输出</span>
              {duration !== undefined && <span className="font-mono text-emerald-500">{duration}ms</span>}
            </div>
            <div className="aspect-video relative rounded-lg overflow-hidden bg-black/5 border border-border/50">
              <img src={preview} className="w-full h-full object-contain" alt="output" />
            </div>
          </div>
        )}

        {/* Error badge */}
        {error && (
          <div className="text-[10px] text-rose-500 bg-rose-500/10 p-1.5 rounded border border-rose-500/20 break-all leading-tight">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
