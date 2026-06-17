import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Download, Save, FolderOpen, Loader2, FileImage } from 'lucide-react';

interface ProjectEntry {
  id: string;
  name: string;
  updatedAt: number;
}

interface ExportPanelProps {
  onExport: (width: number, height: number, format: string, quality: number) => void;
  onSaveProject: (name: string) => void;
  onLoadProject: (id: string) => void;
  onOpenFolder: () => void;
  projectList: ProjectEntry[];
  onFetchProjects: () => void;
  isExporting?: boolean;
}

export default function ExportPanel({
  onExport,
  onSaveProject,
  onLoadProject,
  onOpenFolder,
  projectList,
  onFetchProjects,
  isExporting,
}: ExportPanelProps) {
  const [width, setWidth]               = useState(1024);
  const [height, setHeight]             = useState(1024);
  const [format, setFormat]             = useState<'image/png' | 'image/jpeg'>('image/png');
  const [quality]                       = useState(0.95);
  const [projectName, setProjectName]   = useState('新建参考场景');
  const [showLoadDialog, setShowLoadDialog] = useState(false);

  const handleExport = () => onExport(width, height, format, quality);

  const setPreset = (w: number, h: number) => { setWidth(w); setHeight(h); };

  const handleOpenLoadDialog = () => {
    onFetchProjects();
    setShowLoadDialog(true);
  };

  const handleSelectProject = (id: string) => {
    onLoadProject(id);
    setShowLoadDialog(false);
  };

  return (
    <>
      <div className="h-[60px] border-t border-border bg-card/50 flex items-center justify-between px-4 shrink-0 gap-3">

        {/* Project controls */}
        <div className="flex items-center gap-2 shrink-0">
          <Input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-44 h-8 text-sm"
            placeholder="项目名称"
          />
          <Button variant="outline" size="sm" onClick={() => onSaveProject(projectName)}>
            <Save className="w-3.5 h-3.5 mr-1.5" />保存
          </Button>
          <Button variant="ghost" size="sm" onClick={handleOpenLoadDialog}>
            <FolderOpen className="w-3.5 h-3.5 mr-1.5" />加载
          </Button>
        </div>

        <div className="h-6 w-px bg-border shrink-0" />

        {/* Export controls */}
        <div className="flex items-center gap-2 flex-1 justify-end">
          {/* Size inputs */}
          <Label className="text-xs text-muted-foreground shrink-0">尺寸:</Label>
          <Input
            type="number" value={width}
            onChange={e => setWidth(parseInt(e.target.value) || 1024)}
            className="w-16 h-8 text-center text-xs px-1"
          />
          <span className="text-muted-foreground text-xs shrink-0">×</span>
          <Input
            type="number" value={height}
            onChange={e => setHeight(parseInt(e.target.value) || 1024)}
            className="w-16 h-8 text-center text-xs px-1"
          />

          {/* Presets */}
          <div className="flex items-center gap-0.5">
            {([['1:1', 1024, 1024], ['16:9', 1920, 1080], ['9:16', 1080, 1920], ['4:3', 1200, 900]] as const).map(
              ([label, w, h]) => (
                <Button key={label} variant="ghost" size="sm"
                  className={`h-7 px-2 text-xs ${width === w && height === h ? 'bg-muted' : ''}`}
                  onClick={() => setPreset(w, h)}>
                  {label}
                </Button>
              )
            )}
          </div>

          {/* Format toggle */}
          <div className="flex items-center gap-0.5 border border-border rounded-md overflow-hidden">
            {(['image/png', 'image/jpeg'] as const).map(f => (
              <button
                key={f}
                className={`h-7 px-2.5 text-xs font-mono transition-colors ${
                  format === f ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
                }`}
                onClick={() => setFormat(f)}
              >
                {f === 'image/png' ? 'PNG' : 'JPG'}
              </button>
            ))}
          </div>

          {/* Open folder */}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenFolder} title="打开导出文件夹">
            <FolderOpen className="w-4 h-4" />
          </Button>

          {/* Export */}
          <Button onClick={handleExport} disabled={isExporting} size="sm">
            {isExporting
              ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              : <Download className="w-4 h-4 mr-1.5" />
            }
            导出参考图
          </Button>
        </div>
      </div>

      {/* Project list dialog */}
      <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileImage className="w-4 h-4 text-primary" />
              加载项目
            </DialogTitle>
            <DialogDescription>
              选择一个已保存的姿态参考项目
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {projectList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">暂无已保存的项目</p>
            ) : (
              projectList.map(p => (
                <button
                  key={p.id}
                  className="w-full flex items-center justify-between p-3 rounded-md border border-border hover:bg-muted/50 text-left transition-colors group"
                  onClick={() => handleSelectProject(p.id)}
                >
                  <div>
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(p.updatedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <FolderOpen className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
