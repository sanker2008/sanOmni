import React, { useState } from 'react';
import { getAllAdapters } from './adapters';
import {
  Sparkles,
  Minimize2,
  Eraser,
  PenTool,
  Scissors,
  Film,
  FileType,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ReactNode> = {
  Sparkles: <Sparkles className="w-4 h-4 text-cyan-500" />,
  Minimize2: <Minimize2 className="w-4 h-4 text-amber-500" />,
  Eraser: <Eraser className="w-4 h-4 text-rose-500" />,
  PenTool: <PenTool className="w-4 h-4 text-emerald-500" />,
  Scissors: <Scissors className="w-4 h-4 text-indigo-500" />,
  Film: <Film className="w-4 h-4 text-purple-500" />,
  FileType: <FileType className="w-4 h-4 text-sky-500" />,
};

interface CanvasToolSidebarProps {
  onAddAdapterNode: (adapterId: string) => void;
}

export default function CanvasToolSidebar({ onAddAdapterNode }: CanvasToolSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const adapters = getAllAdapters();

  return (
    <div
      className={`shrink-0 border-r border-border bg-zinc-50 dark:bg-zinc-900 flex flex-col transition-all duration-300 z-20 ${
        isCollapsed ? 'w-14' : 'w-[200px]'
      }`}
    >
      <div className="px-3 py-3 border-b border-border h-[49px] flex items-center justify-between">
        {!isCollapsed ? (
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            可选工具节点 ({adapters.length})
          </span>
        ) : (
          <span className="text-xs font-bold text-muted-foreground mx-auto">工具</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {adapters.map((adapter) => (
          <button
            key={adapter.id}
            type="button"
            onClick={() => onAddAdapterNode(adapter.id)}
            title={isCollapsed ? adapter.name : undefined}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors bg-card hover:bg-muted border border-border/60 hover:border-primary/50 group ${
              isCollapsed ? 'justify-center' : ''
            }`}
          >
            <span className="shrink-0">{ICON_MAP[adapter.icon] || <Sparkles className="w-4 h-4" />}</span>

            {!isCollapsed && (
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="text-xs font-semibold text-foreground truncate flex items-center justify-between">
                  <span>{adapter.name}</span>
                  <Plus className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                  {adapter.description}
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-border mt-auto">
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center justify-center p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors text-xs font-medium"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {!isCollapsed && <span className="ml-1.5">折叠侧边栏</span>}
        </button>
      </div>
    </div>
  );
}
