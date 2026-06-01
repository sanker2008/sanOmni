/**
 * ProductImageMaker — Main component for the product image creation tool.
 * 
 * Layout: Left side = Canvas preview, Right side = Layer panel + Property panel
 * Fully standalone — no dependency on sanOmni core modules.
 */

import { useCallback, useRef, useEffect, useState } from 'react';
import { useProductImageStore } from './useProductImageStore';
import { preloadDefaultFonts, loadGoogleFont } from './fonts';
import CanvasPreview, { exportCanvasToBlob } from './CanvasPreview';
import LayerPanel from './LayerPanel';
import PropertyPanel from './PropertyPanel';
import FileManagerModal from './FileManagerModal';
import { ensureToolDirectories, saveProject, loadProject, saveExport, listProjects, openExportFolder, renameFile } from './fs';
import { Download, RotateCcw, Save, FolderOpen, FileCode2, ChevronDown, Undo2, Redo2, Edit2 } from 'lucide-react';
import { toast } from '@/hooks/useToast';
import { useUIStore } from '@/stores';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ProductImageMaker() {
  const {
    canvas,
    layers,
    selectedLayerId,
    updateCanvas,
    addTextLayer,
    addImageLayer,
    addShapeLayer,
    updateLayer,
    updateLayerSilent,
    removeLayer,
    duplicateLayer,
    toggleLayerVisibility,
    reorderLayers,
    moveLayerUp,
    moveLayerDown,
    setSelectedLayer,
    reset,
    undo,
    redo,
    past,
    future,
    setMaxHistorySize,
    pushHistory,
  } = useProductImageStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceLayerIdRef = useRef<string | null>(null);

  const [isFileManagerOpen, setIsFileManagerOpen] = useState(false);
  const [fileManagerInitialTab, setFileManagerInitialTab] = useState<'project' | 'template'>('project');

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'blank' | 'template' | null>(null);

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleEditValue, setTitleEditValue] = useState('');

  // Save dialog state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveDialogIsTemplate, setSaveDialogIsTemplate] = useState(false);
  const [saveDialogIsSaveAs, setSaveDialogIsSaveAs] = useState(false);
  const [saveDialogName, setSaveDialogName] = useState('');
  const [existingTemplates, setExistingTemplates] = useState<any[]>([]);

  // ─── Sync undo max from settings ─────────────────────────

  const { settings } = useUIStore();
  useEffect(() => {
    const count = settings.canvasUndoMaxCount;
    if (typeof count === 'number' && count > 0) {
      setMaxHistorySize(count);
    }
  }, [settings.canvasUndoMaxCount, setMaxHistorySize]);

  // Preload default fonts and initialize directories on mount
  useEffect(() => {
    preloadDefaultFonts();
    ensureToolDirectories().catch(console.error);
  }, []);

  // ─── Keyboard shortcuts (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z) ─

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when focus is inside an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))
      ) {
        e.preventDefault();
        redo();
      } else if (
        e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight'
      ) {
        // Arrow keys to move the selected layer
        const state = useProductImageStore.getState();
        const { selectedLayerId, layers, updateLayer } = state;
        if (selectedLayerId) {
          const layer = layers.find((l) => l.id === selectedLayerId);
          if (layer && !layer.locked) {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            let { x, y } = layer;
            if (e.key === 'ArrowUp') y -= step;
            if (e.key === 'ArrowDown') y += step;
            if (e.key === 'ArrowLeft') x -= step;
            if (e.key === 'ArrowRight') x += step;
            updateLayer(selectedLayerId, { x, y });
          }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // ─── Paste Handler ───────────────────────────────────────

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      // Prioritize images over text
      let hasImage = false;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;
          
          hasImage = true;
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const img = new Image();
            img.onload = () => {
              addImageLayer(dataUrl, file.name || 'Pasted Image', img.width, img.height);
            };
            img.src = dataUrl;
          };
          reader.readAsDataURL(file);
          e.preventDefault();
          break; // Process one image
        }
      }

      if (hasImage) return;

      // If no image, try to get text
      for (const item of Array.from(items)) {
        if (item.type === 'text/plain') {
          item.getAsString((text) => {
            if (text.trim()) {
              addTextLayer({ text });
            }
          });
          e.preventDefault();
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [addImageLayer, addTextLayer]);

  // ─── Image Upload Handler ──────────────────────────────

  const handleImageUpload = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;

      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;

        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const img = new Image();
          img.onload = () => {
            if (replaceLayerIdRef.current) {
              updateLayer(replaceLayerIdRef.current, {
                src: dataUrl,
                filename: file.name,
                naturalWidth: img.width,
                naturalHeight: img.height,
              });
              replaceLayerIdRef.current = null;
            } else {
              addImageLayer(dataUrl, file.name, img.width, img.height);
            }
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      }
    },
    [addImageLayer, updateLayer],
  );

  const handleReplaceImage = useCallback(
    (layerId: string) => {
      replaceLayerIdRef.current = layerId;
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
        fileInputRef.current.click();
      }
    },
    [],
  );

  // ─── Export ────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    const blob = await exportCanvasToBlob(canvas, layers);
    if (!blob) return;
    const buf = await blob.arrayBuffer();
    const filename = `export_${Date.now()}.png`;
    try {
      await saveExport(filename, new Uint8Array(buf));
      toast({ title: '导出成功', description: `已保存为 ${filename}`, variant: 'default' });
    } catch (e: any) {
      console.error('Export failed:', e);
      toast({ title: '导出失败', description: e?.message || String(e), variant: 'destructive' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [canvas, layers]);

  // ─── Project Management ────────────────────────────────

  const { currentProjectId, currentProjectName, loadProjectState, setCurrentProjectInfo } = useProductImageStore();

  const executeSave = useCallback(async (isTemplate: boolean, nameToSave: string, isSaveAs: boolean = false) => {
    const type = isTemplate ? 'template' : 'project';
    let idToSave = (!isTemplate && currentProjectId && !isSaveAs) ? currentProjectId : `proj_${Date.now()}`;

    if (isTemplate) {
      const existing = existingTemplates.find(t => t.name === nameToSave);
      if (existing) {
        idToSave = existing.id;
      } else {
        idToSave = `tpl_${Date.now()}`;
      }
    }

    try {
      await saveProject(type, idToSave, nameToSave, {
        id: idToSave,
        name: nameToSave,
        updatedAt: Date.now(),
        canvas,
        layers,
      });
      
      if (!isTemplate) {
        setCurrentProjectInfo(idToSave, nameToSave);
      }
      toast({ title: '保存成功', description: `${isTemplate ? '模板' : '项目'}已成功保存`, variant: 'default' });
      
      // Update existing templates if we just saved a template
      if (isTemplate) {
        listProjects('template').then(setExistingTemplates).catch(console.error);
      }
    } catch (e: any) {
      console.error('Save failed:', e);
      toast({ title: '保存失败', description: e?.message || String(e), variant: 'destructive' });
    }
  }, [currentProjectId, canvas, layers, setCurrentProjectInfo, existingTemplates]);

  const handleSaveProjectClick = useCallback(async (isTemplate: boolean = false, isSaveAs: boolean = false) => {
    if (layers.length === 0) {
      toast({ title: '空画布无需保存', description: '请先添加图层后再保存', variant: 'destructive' });
      return;
    }

    const defaultName = isTemplate 
      ? '新模板' 
      : (isSaveAs ? `${currentProjectName}-副本` : (currentProjectName || `项目-${new Date().toLocaleDateString().replace(/\//g, '-')}`));
      
    if (isTemplate || !currentProjectId || isSaveAs) {
      if (isTemplate) {
        try {
          const tpls = await listProjects('template');
          setExistingTemplates(tpls);
        } catch (e) {
          console.error('Failed to list templates', e);
        }
      }
      setSaveDialogIsTemplate(isTemplate);
      setSaveDialogIsSaveAs(isSaveAs);
      setSaveDialogName(defaultName);
      setSaveDialogOpen(true);
    } else {
      executeSave(false, defaultName, false);
    }
  }, [layers.length, currentProjectId, currentProjectName, executeSave]);

  const handleOpenProject = useCallback(async (type: 'project' | 'template', id: string) => {
    try {
      const data = await loadProject(type, id);
      if (data && data.canvas && data.layers) {
        const targetId = type === 'template' ? null : data.id;
        const targetName = type === 'template' ? null : data.name;

        // Ensure fonts used in the loaded layers are injected
        data.layers.forEach((layer: any) => {
          if (layer.type === 'text' && layer.fontFamily) {
            loadGoogleFont(layer.fontFamily);
          }
        });

        loadProjectState(targetId, targetName, data.canvas, data.layers);
      }
    } catch (e: any) {
      console.error('Failed to load project:', e);
      toast({ title: '读取失败', description: e?.message || String(e), variant: 'destructive' });
    }
  }, [loadProjectState]);

  // ─── New project confirm handlers ──────────────────────

  const handleNewClick = useCallback((action: 'blank' | 'template') => {
    if (layers.length === 0) {
      // Nothing to lose, just do it
      if (action === 'blank') {
        reset();
      } else {
        setFileManagerInitialTab('template');
        setIsFileManagerOpen(true);
      }
      return;
    }
    setConfirmAction(action);
    setConfirmOpen(true);
  }, [layers.length, reset]);

  const handleConfirmNew = useCallback(() => {
    setConfirmOpen(false);
    if (confirmAction === 'blank') {
      reset();
    } else if (confirmAction === 'template') {
      reset();
      setFileManagerInitialTab('template');
      setIsFileManagerOpen(true);
    }
    setConfirmAction(null);
  }, [confirmAction, reset]);

  const handleCancelNew = useCallback(() => {
    setConfirmOpen(false);
    setConfirmAction(null);
  }, []);

  // ─── Move Layer (from canvas drag) ────────────────────

  // Uses the silent variant — undo snapshot is taken once on mousedown in CanvasPreview
  const handleMoveLayer = useCallback(
    (id: string, x: number, y: number) => {
      updateLayerSilent(id, { x, y });
    },
    [updateLayerSilent],
  );

  // ─── Selected Layer ────────────────────────────────────

  const selectedLayer = layers.find((l) => l.id === selectedLayerId) || null;

  return (
    <div className="h-full flex flex-col">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleImageUpload(e.target.files)}
      />

      {/* Confirm New Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认新建</DialogTitle>
            <DialogDescription>
              {confirmAction === 'blank'
                ? '确定要清空当前画布并新建空白项目吗？当前未保存的内容将丢失。'
                : '确定要清空当前画布并从模板新建吗？当前未保存的内容将丢失。'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelNew}>取消</Button>
            <Button variant="destructive" onClick={handleConfirmNew}>确定新建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Project/Template Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存{saveDialogIsTemplate ? '模板' : '项目'}</DialogTitle>
            <DialogDescription>
              请输入要保存的{saveDialogIsTemplate ? '模板' : '项目'}名称：
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input 
              value={saveDialogName} 
              onChange={(e) => setSaveDialogName(e.target.value)}
              placeholder="请输入名称..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && saveDialogName.trim()) {
                  setSaveDialogOpen(false);
                  executeSave(saveDialogIsTemplate, saveDialogName.trim(), saveDialogIsSaveAs);
                }
              }}
            />
            
            {saveDialogIsTemplate && existingTemplates.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">或点击替换现有模板：</p>
                <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto pr-1 custom-scrollbar">
                  {existingTemplates.map(t => (
                    <button
                      key={t.id}
                      className="text-[11px] px-2 py-1 bg-muted/60 text-muted-foreground rounded-md hover:bg-primary/20 hover:text-primary transition-colors border border-transparent hover:border-primary/30"
                      onClick={() => setSaveDialogName(t.name)}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>取消</Button>
            <Button onClick={() => {
              if (saveDialogName.trim()) {
                setSaveDialogOpen(false);
                executeSave(saveDialogIsTemplate, saveDialogName.trim(), saveDialogIsSaveAs);
              }
            }}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/50">
        <div className="flex items-center gap-2">
          {isEditingTitle ? (
            <Input
              autoFocus
              className="h-7 px-2 py-1 text-sm font-semibold w-40"
              value={titleEditValue}
              onChange={(e) => setTitleEditValue(e.target.value)}
              onBlur={() => {
                setIsEditingTitle(false);
                const newName = titleEditValue.trim();
                if (newName) {
                  setCurrentProjectInfo(currentProjectId, newName);
                  if (currentProjectId) {
                    renameFile('project', currentProjectId, newName).catch(console.error);
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setIsEditingTitle(false);
              }}
            />
          ) : (
            <div 
              className="group flex items-center gap-1 cursor-text hover:bg-muted/50 px-1.5 py-0.5 rounded -ml-1.5 transition-colors"
              onClick={() => {
                setTitleEditValue(currentProjectName || '新建项目');
                setIsEditingTitle(true);
              }}
              title="点击修改名称"
            >
              <h2 className="text-sm font-semibold">{currentProjectName || '新建项目'}</h2>
              <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded ml-1">
            {layers.length} 个图层
          </span>
        </div>

        <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={past.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted/50 hover:bg-muted rounded-md transition-colors text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              title={`撤回 (Ctrl+Z)${past.length > 0 ? ` — 还可撤回 ${past.length} 步` : ''}`}
            >
              <Undo2 className="w-3.5 h-3.5" />
              撤回
              {past.length > 0 && (
                <span className="ml-0.5 text-[10px] bg-primary/15 text-primary rounded px-1">{past.length}</span>
              )}
            </button>

            <button
              type="button"
              onClick={redo}
              disabled={future.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted/50 hover:bg-muted rounded-md transition-colors text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              title="重做 (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
              重做
            </button>

            <div className="w-px h-4 bg-border mx-1" />

            <button
              type="button"
              onClick={() => {
                setFileManagerInitialTab('project');
                setIsFileManagerOpen(true);
              }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted/50 hover:bg-muted rounded-md transition-colors text-muted-foreground"
            title="管理项目与导出"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            文件管理
          </button>
          
          <div className="w-px h-4 bg-border mx-1" />
          
          <button
            type="button"
            onClick={() => handleSaveProjectClick(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted/50 hover:bg-muted rounded-md transition-colors text-muted-foreground"
            title="保存项目草稿"
          >
            <Save className="w-3.5 h-3.5" />
            保存
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center px-1.5 py-1.5 text-xs bg-muted/50 hover:bg-muted rounded-md transition-colors text-muted-foreground -ml-1"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => handleSaveProjectClick(false, true)}>
                <Save className="w-4 h-4 mr-2" />
                另存为新项目...
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleSaveProjectClick(true)}>
                <FileCode2 className="w-4 h-4 mr-2" />
                存为模板...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="w-px h-4 bg-border mx-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted/50 hover:bg-muted rounded-md transition-colors text-muted-foreground"
                title="新建项目"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                新建
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => handleNewClick('blank')}>
                新建空白画布
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleNewClick('template')}>
                从模板新建...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center rounded-md overflow-hidden bg-primary shadow-sm hover:bg-primary/90 transition-colors group">
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-xs text-primary-foreground focus:outline-none"
              title="导出成品"
            >
              <Download className="w-3.5 h-3.5" />
              导出
            </button>
            <div className="w-[1px] h-4 bg-primary-foreground/30 group-hover:bg-primary-foreground/50 transition-colors" />
            <button
              type="button"
              onClick={() => openExportFolder().catch(e => toast({ title: '打开失败', description: String(e), variant: 'destructive' }))}
              className="flex items-center px-2 py-1.5 text-xs text-primary-foreground hover:bg-primary-foreground/10 focus:outline-none transition-colors"
              title="在文件管理器中打开导出目录"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <FileManagerModal 
        open={isFileManagerOpen} 
        onOpenChange={setIsFileManagerOpen} 
        onOpenProject={handleOpenProject}
        initialTab={fileManagerInitialTab}
      />

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Canvas preview */}
        <CanvasPreview
          canvas={canvas}
          layers={layers}
          selectedLayerId={selectedLayerId}
          onSelectLayer={setSelectedLayer}
          onMoveLayer={handleMoveLayer}
          onUpdateLayer={updateLayer}
          onUpdateLayerSilent={updateLayerSilent}
          onPushHistory={pushHistory}
        />

        {/* Right: Sidebar */}
        <div className="w-[300px] shrink-0 border-l border-border flex flex-col overflow-hidden">
          {/* Canvas settings section — distinct background */}
          <div
            className="flex-1 border-b-2 border-border overflow-y-auto"
            style={{ backgroundColor: canvas.panelColor || 'hsl(var(--muted) / 0.3)' }}
          >
            <div className="p-3">
              <PropertyPanel
                canvas={canvas}
                selectedLayer={selectedLayer}
                onUpdateCanvas={updateCanvas}
                onUpdateLayer={updateLayer}
                onReplaceImage={handleReplaceImage}
              />
            </div>
          </div>

          {/* Layer panel section — slightly different background */}
          <div className="h-[350px] shrink-0 bg-card/80 flex flex-col overflow-hidden">
            <div className="p-3 flex-1 flex flex-col overflow-hidden">
              <LayerPanel
                layers={layers}
                selectedLayerId={selectedLayerId}
                onSelectLayer={setSelectedLayer}
                onToggleVisibility={toggleLayerVisibility}
                onToggleLock={(id) => {
                  const layer = layers.find(l => l.id === id);
                  if (layer) updateLayer(id, { locked: !layer.locked });
                }}
                onRemoveLayer={removeLayer}
                onDuplicateLayer={duplicateLayer}
                onReorderLayers={reorderLayers}
                onMoveUp={moveLayerUp}
                onMoveDown={moveLayerDown}
                onAddTextLayer={addTextLayer}
                onAddShapeLayer={addShapeLayer}
                onAddImageLayer={() => {
                  replaceLayerIdRef.current = null;
                  fileInputRef.current?.click();
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
