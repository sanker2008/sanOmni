/**
 * AiImageEditor.tsx — AI P图工具主组件
 *
 * 组装节点画布 + 遮罩编辑器 + 项目管理
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAiImageEditorStore } from './useAiImageEditorStore';
import NodeCanvas from './NodeCanvas';
import MaskEditor from './MaskEditor';
import { openOutputFolder, saveInputImage } from './fs';
import { toast } from '@/hooks/useToast';
import {
  ImagePlus, Save, FolderOpen, FilePlus2, Trash2,
  ChevronDown, Check, Pencil, LayoutGrid, Eraser
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { authorizeFsPaths, readFile } from '@/services/secureFs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function AiImageEditor() {
  const {
    nodes, currentProjectId, currentProjectName, isDirty, projectList,
    addSourceNode, newProject, saveCurrentProject, loadProject, deleteProject,
    renameCurrentProject, refreshProjectList, organizeNodes, clearAllNodes,
  } = useAiImageEditorStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearWithFiles, setClearWithFiles] = useState(false);

  // 初始化时加载项目列表
  useEffect(() => {
    refreshProjectList();
  }, [refreshProjectList]);

  // Ctrl+S 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        const target = e.target as HTMLElement;
        // 仅在 AI 编辑器活跃时拦截
        if (target.closest('[data-ai-editor]')) {
          e.preventDefault();
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ─── 导入图片（通过 Tauri dialog 获取完整路径） ─────────────
  const handleTauriImport = useCallback(async () => {
    try {
      const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
      const selected = await openDialog({
        multiple: true,
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff'] }],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      if (paths.length === 0) return;
      await authorizeFsPaths(paths as string[]);

      const { basename } = await import('@tauri-apps/api/path');

      for (const filePath of paths) {
        try {
          const fileName = await basename(filePath);
          const fileBytes = await readFile(filePath);
          // 转 base64 data URL
          let binary = '';
          for (let i = 0; i < fileBytes.length; i++) binary += String.fromCharCode(fileBytes[i]);
          const ext = fileName.split('.').pop()?.toLowerCase() || 'png';
          const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', tiff: 'image/tiff' };
          const mime = mimeMap[ext] || 'image/png';
          const dataUrl = `data:${mime};base64,${btoa(binary)}`;

          // 获取图片尺寸
          const img = new Image();
          img.onload = () => {
            (async () => {
              try {
                // 将文件复制/存入我们统一规划的 inputs 目录
                const newFilePath = await saveInputImage(dataUrl, fileName);
                addSourceNode(dataUrl, fileName, img.width, img.height, newFilePath);
              } catch (e) {
                console.error('[AI Editor] Failed to copy imported image to inputs:', e);
                // 如果存入 inputs 失败，降级使用原来的物理路径
                addSourceNode(dataUrl, fileName, img.width, img.height, filePath);
              }
              toast({ title: '图片已添加', description: `${fileName} (${img.width}×${img.height})` });
            })();
          };
          img.onerror = () => {
            toast({ title: '图片加载失败', description: `无法解析 ${fileName}`, variant: 'destructive' });
          };
          img.src = dataUrl;
        } catch (e: any) {
          console.error('[AI Editor] Failed to load:', filePath, e);
          toast({ title: '读取失败', description: e?.message || String(e), variant: 'destructive' });
        }
      }
    } catch (e: any) {
      console.error('[AI Editor] Dialog error:', e);
      // 降级：打开 HTML file input
      fileInputRef.current?.click();
    }
  }, [addSourceNode]);

  // ─── 导入图片（通过 HTML FileList，用于拖拽） ─────────────
  const handleImageImport = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onerror = () => {
        toast({ title: '读取失败', description: `无法读取 ${file.name}`, variant: 'destructive' });
      };
      reader.onload = () => {
        const dataUrl = reader.result as string;
        if (!dataUrl) return;
        const img = new Image();
        img.onerror = () => {
          toast({ title: '图片加载失败', description: `无法解析 ${file.name}`, variant: 'destructive' });
        };
        img.onload = () => {
          (async () => {
            try {
              const filePath = await saveInputImage(dataUrl, file.name);
              addSourceNode(dataUrl, file.name, img.width, img.height, filePath);
            } catch (e) {
              console.error('[AI Editor] Failed to save dragged image to inputs:', e);
              // Fallback without filePath
              addSourceNode(dataUrl, file.name, img.width, img.height);
            }
            toast({ title: '图片已添加', description: `${file.name} (${img.width}×${img.height})` });
          })();
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addSourceNode]);

  // ─── 拖拽导入 ────────────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleImageImport(e.dataTransfer.files);
  }, [handleImageImport]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // ─── 保存 ────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (nodes.length === 0) {
      toast({ title: '空项目', description: '请先添加图片', variant: 'destructive' });
      return;
    }
    try {
      await saveCurrentProject();
      toast({ title: '保存成功' });
    } catch (e: any) {
      toast({ title: '保存失败', description: e?.message || String(e), variant: 'destructive' });
    }
  }, [nodes.length, saveCurrentProject]);

  // ─── 打开项目 ────────────────────────────────────────────
  const handleOpenProject = useCallback(async (projectId: string) => {
    try {
      await loadProject(projectId);
      setProjectDialogOpen(false);
      toast({ title: '项目已加载' });
    } catch (e: any) {
      toast({ title: '加载失败', description: e?.message || String(e), variant: 'destructive' });
    }
  }, [loadProject]);

  // ─── 删除项目确认 ────────────────────────────────────────
  const handleDeleteProject = useCallback(async (projectId: string) => {
    try {
      await deleteProject(projectId);
      setDeleteConfirmId(null);
      toast({ title: '项目已删除' });
    } catch (e: any) {
      toast({ title: '删除失败', description: e?.message || String(e), variant: 'destructive' });
    }
  }, [deleteProject]);

  // ─── 编辑项目名 ─────────────────────────────────────────
  const startEditName = useCallback(() => {
    setEditNameValue(currentProjectName);
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 50);
  }, [currentProjectName]);

  const finishEditName = useCallback(() => {
    if (editNameValue.trim()) {
      renameCurrentProject(editNameValue.trim());
    }
    setIsEditingName(false);
  }, [editNameValue, renameCurrentProject]);

  return (
    <div className="h-full flex flex-col" data-ai-editor onDragOver={handleDragOver} onDrop={handleDrop}>
      {/* 隐藏文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleImageImport(e.target.files)}
      />

      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/50">
        <div className="flex items-center gap-2">
          {/* 项目名称 */}
          {isEditingName ? (
            <Input
              ref={nameInputRef}
              value={editNameValue}
              onChange={(e) => setEditNameValue(e.target.value)}
              onBlur={finishEditName}
              onKeyDown={(e) => { if (e.key === 'Enter') finishEditName(); if (e.key === 'Escape') setIsEditingName(false); }}
              className="h-7 w-40 text-sm"
              autoFocus
            />
          ) : (
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary transition-colors"
              onClick={startEditName}
              title="点击编辑项目名"
            >
              {currentProjectName}
              <Pencil className="w-3 h-3 text-muted-foreground" />
            </button>
          )}

          {/* 保存状态指示 */}
          {isDirty ? (
            <span className="text-[10px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 font-medium">● 未保存</span>
          ) : currentProjectId ? (
            <span className="text-[10px] text-green-500 bg-green-500/10 px-1.5 py-0.5 font-medium flex items-center gap-0.5">
              <Check className="w-3 h-3" /> 已保存
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {/* 清空画布 */}
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted/50 hover:bg-destructive/10 hover:text-destructive rounded-none transition-colors text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              setClearWithFiles(false);
              setShowClearConfirm(true);
            }}
            disabled={nodes.length === 0}
            title="清空当前画布上的所有节点"
          >
            <Eraser className="w-3.5 h-3.5" />
            清空画布
          </button>

          {/* 一键整理 */}
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted/50 hover:bg-muted rounded-none transition-colors text-muted-foreground"
            onClick={organizeNodes}
            title="自动整理排列所有节点"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            一键整理
          </button>

          {/* 添加图片 */}
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted/50 hover:bg-muted rounded-none transition-colors text-muted-foreground"
            onClick={handleTauriImport}
          >
            <ImagePlus className="w-3.5 h-3.5" />
            添加图片
          </button>

          <div className="w-px h-4 bg-border" />

          {/* 项目管理 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted/50 hover:bg-muted rounded-none transition-colors text-muted-foreground"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                项目
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => { if (isDirty && nodes.length > 0) { handleSave().then(() => newProject()); } else { newProject(); } }}>
                <FilePlus2 className="w-3.5 h-3.5 mr-2" />
                新建项目
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { refreshProjectList(); setProjectDialogOpen(true); }}>
                <FolderOpen className="w-3.5 h-3.5 mr-2" />
                打开项目...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 保存 */}
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted/50 hover:bg-muted rounded-none transition-colors text-muted-foreground"
            onClick={handleSave}
            title="保存 (Ctrl+S)"
          >
            <Save className="w-3.5 h-3.5" />
            保存
          </button>

          {/* 打开输出目录 */}
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted/50 hover:bg-muted rounded-none transition-colors text-muted-foreground"
            onClick={() => openOutputFolder().catch((e) => toast({ title: '打开失败', description: String(e), variant: 'destructive' }))}
            title="打开输出目录"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 主画布 */}
      <div className="flex-1 overflow-hidden">
        <NodeCanvas />
      </div>

      {/* 遮罩编辑器 Overlay */}
      <MaskEditor />

      {/* 项目列表对话框 */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>打开项目</DialogTitle>
            <DialogDescription>选择一个已保存的项目打开</DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            {projectList.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">暂无已保存的项目</p>
            ) : (
              <div className="space-y-1.5">
                {projectList.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between px-3 py-2.5 border border-border hover:border-primary/50 transition-colors cursor-pointer ${
                      p.id === currentProjectId ? 'bg-primary/5 border-primary/30' : ''
                    }`}
                    onClick={() => handleOpenProject(p.id)}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {p.nodeCount} 个节点 · {new Date(p.updatedAt).toLocaleString('zh-CN')}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(p.id); }}
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>删除后无法恢复，确定要删除此项目吗？</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>取消</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && handleDeleteProject(deleteConfirmId)}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 清空所有节点确认弹窗 */}
      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>清空所有节点数据</DialogTitle>
            <DialogDescription>
              此操作将清空当前画布上的所有节点。
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 py-4">
            <Switch
              id="clear-files-switch"
              checked={clearWithFiles}
              onCheckedChange={setClearWithFiles}
            />
            <label htmlFor="clear-files-switch" className="text-sm cursor-pointer">
              同时删除这些节点在本地硬盘上的图片文件（需手动保存项目后生效）
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearConfirm(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                clearAllNodes(clearWithFiles);
                setShowClearConfirm(false);
                toast({ title: '画布已清空' });
              }}
            >
              确定清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
