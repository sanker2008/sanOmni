import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  FlaskConical,
  Trash2,
  LayoutGrid,
  ImagePlus,
  Save,
  Play,
  FolderOpen,
  Pencil,
  Check,
  Loader2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { WorkflowDef } from './types';

interface CanvasToolbarProps {
  projectName: string;
  isSaved: boolean;
  isRunning: boolean;
  savedWorkflows: WorkflowDef[];
  onProjectNameChange: (name: string) => void;
  onClear: () => void;
  onAutoArrange: () => void;
  onAddInputNode: () => void;
  onSave: () => void;
  onRun: () => void;
  onLoadProject: (workflow: WorkflowDef) => void;
}

export default function CanvasToolbar({
  projectName,
  isSaved,
  isRunning,
  savedWorkflows,
  onProjectNameChange,
  onClear,
  onAutoArrange,
  onAddInputNode,
  onSave,
  onRun,
  onLoadProject,
}: CanvasToolbarProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(projectName);

  const handleNameSubmit = () => {
    if (tempName.trim()) {
      onProjectNameChange(tempName.trim());
    }
    setIsEditingName(false);
  };

  return (
    <div className="h-[49px] border-b border-border bg-card/60 px-4 flex items-center justify-between shrink-0 select-none z-30">
      {/* Left: App Title & Editable Project Name */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-primary" />
          <span className="text-sm font-bold text-foreground">sanLabs 工具箱</span>
        </div>

        <div className="h-4 w-px bg-border" />

        <div className="flex items-center gap-2">
          {isEditingName ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
                autoFocus
                className="h-7 px-2 text-xs font-semibold bg-background border border-primary rounded focus:outline-none"
              />
              <button
                type="button"
                onClick={handleNameSubmit}
                className="p-1 text-primary hover:bg-primary/10 rounded"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTempName(projectName);
                setIsEditingName(true);
              }}
              className="flex items-center gap-1.5 text-xs font-semibold text-foreground/90 hover:text-primary transition-colors py-1 px-1.5 rounded hover:bg-muted/50"
            >
              <span>{projectName}</span>
              <Pencil className="w-3 h-3 text-muted-foreground" />
            </button>
          )}

          <div className="flex items-center gap-1 text-[11px] font-mono">
            {isSaved ? (
              <span className="text-emerald-500 font-medium">✓ 已保存</span>
            ) : (
              <span className="text-amber-500 font-medium">• 未保存</span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClear} title="清空画布上的节点">
          <Trash2 className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
          清空画布
        </Button>

        <Button variant="ghost" size="sm" onClick={onAutoArrange} title="自动网格排布所有节点">
          <LayoutGrid className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
          一键整理
        </Button>

        <Button variant="outline" size="sm" onClick={onAddInputNode} title="添加图片输入节点">
          <ImagePlus className="w-3.5 h-3.5 mr-1.5 text-primary" />
          添加图片
        </Button>

        {/* Saved Workflows Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
              项目 ({savedWorkflows.length})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {savedWorkflows.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">暂无保存的工作流</div>
            ) : (
              savedWorkflows.map((wf) => (
                <DropdownMenuItem key={wf.id} onClick={() => onLoadProject(wf)}>
                  <div className="flex flex-col text-xs">
                    <span className="font-semibold">{wf.name}</span>
                    <span className="text-[10px] text-muted-foreground">{wf.nodes.length} 个节点</span>
                  </div>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" size="sm" onClick={onSave} title="保存当前工作流">
          <Save className="w-3.5 h-3.5 mr-1.5 text-primary" />
          保存
        </Button>

        <Button
          variant="default"
          size="sm"
          onClick={onRun}
          disabled={isRunning}
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              处理中...
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 mr-1.5" />
              运行工作流
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
