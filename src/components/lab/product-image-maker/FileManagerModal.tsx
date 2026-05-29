import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileImage, LayoutTemplate, Trash2, Edit2, Play, Image as ImageIcon } from 'lucide-react';
import { listProjects, deleteFile, renameFile, listExports, deleteExport } from './fs';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open as openShell } from '@tauri-apps/plugin-shell';
import { toast } from '@/hooks/useToast';

type TabType = 'project' | 'template' | 'export';

interface FileManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenProject: (type: 'project' | 'template', id: string) => void;
  initialTab?: TabType;
}

export default function FileManagerModal({ open, onOpenChange, onOpenProject, initialTab = 'project' }: FileManagerModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // Update activeTab if initialTab changes while opening
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [itemToDelete, setItemToDelete] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'project' || activeTab === 'template') {
        const data = await listProjects(activeTab);
        setItems(data.sort((a, b) => b.updatedAt - a.updatedAt));
      } else {
        const data = await listExports();
        // Since listExports might not have updatedAt inside the file, we just sort by name (which includes timestamp usually)
        setItems(data.sort((a, b) => b.name.localeCompare(a.name)));
      }
    } catch (e) {
      console.error('Failed to load items', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadData();
      setEditingId(null);
    }
  }, [open, activeTab]);

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      if (activeTab === 'export') {
        await deleteExport(itemToDelete.name);
      } else {
        await deleteFile(activeTab, itemToDelete.id);
      }
      toast({ title: '删除成功', description: '文件已成功删除' });
      loadData();
    } catch (e: any) {
      console.error('Failed to delete', e);
      toast({ title: '删除失败', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setItemToDelete(null);
    }
  };

  const handleRename = async (item: any) => {
    try {
      if (activeTab === 'export') {
        toast({ title: '无法重命名', description: '暂不支持直接重命名导出文件', variant: 'destructive' });
      } else {
        await renameFile(activeTab, item.id, editName);
        loadData();
      }
    } catch (e: any) {
      console.error('Failed to rename', e);
      toast({ title: '重命名失败', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setEditingId(null);
    }
  };

  const handleOpen = async (item: any) => {
    if (activeTab === 'export') {
      try {
        if (item.absolutePath) {
          try {
            await openShell(item.absolutePath);
          } catch (openErr) {
            console.warn('openShell failed, trying explorer fallback', openErr);
            // Fallback for Windows if regex validation fails
            const { Command } = await import('@tauri-apps/plugin-shell');
            await Command.create('explorer', [item.absolutePath]).execute();
          }
        } else {
          toast({ title: '路径错误', description: '无法获取该文件的绝对路径', variant: 'destructive' });
        }
      } catch (e: any) {
        console.error('Failed to open file', e);
        toast({ title: '打开失败', description: e?.message || String(e), variant: 'destructive' });
      }
    } else {
      onOpenProject(activeTab, item.id);
      onOpenChange(false);
    }
  };

  const tabs = [
    { id: 'project', label: '我的项目', icon: FileImage },
    { id: 'template', label: '模板库', icon: LayoutTemplate },
    { id: 'export', label: '导出管理', icon: ImageIcon },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border bg-muted/30">
          <DialogTitle>文件管理</DialogTitle>
          <DialogDescription>管理您保存的项目草稿、自定义模板和已导出的成品图片。</DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-48 border-r border-border bg-muted/10 p-4 space-y-2 flex-shrink-0">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Main Content */}
          <div className="flex-1 bg-background relative flex flex-col">
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">加载中...</div>
            ) : items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <FileImage className="w-12 h-12 mb-4 opacity-20" />
                <p>这里空空如也</p>
              </div>
            ) : (
              <ScrollArea className="flex-1 p-6">
                <div className="grid grid-cols-2 gap-4">
                  {items.map((item) => (
                    <div
                      key={item.id || item.name}
                      className="group flex flex-col p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0 pr-4">
                          {editingId === (item.id || item.name) ? (
                            <Input
                              autoFocus
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onBlur={() => handleRename(item)}
                              onKeyDown={(e) => e.key === 'Enter' && handleRename(item)}
                              className="h-7 text-sm px-2 -ml-2"
                            />
                          ) : (
                            <h3 className="font-medium text-sm truncate" title={item.name}>
                              {item.name}
                            </h3>
                          )}
                        </div>
                      </div>
                      
                      {activeTab === 'export' && item.absolutePath && (
                        <div className="w-full h-32 mb-3 rounded-md overflow-hidden bg-muted/30 border border-border flex items-center justify-center">
                          <img 
                            src={convertFileSrc(item.absolutePath)} 
                            alt={item.name}
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                      )}
                      
                      <div className="text-xs text-muted-foreground mb-4">
                        {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '导出文件'}
                      </div>

                      <div className="flex items-center gap-2 mt-auto pt-4 border-t border-border">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => handleOpen(item)}
                        >
                          <Play className="w-3 h-3 mr-1.5" />
                          {activeTab === 'export' ? '查看路径' : '打开'}
                        </Button>
                        {activeTab !== 'export' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              setEditingId(item.id || item.name);
                              setEditName(item.name);
                            }}
                          >
                            <Edit2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                          onClick={() => setItemToDelete(item)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>确认删除</DialogTitle>
              <DialogDescription>
                确定要删除 <strong>{itemToDelete?.name}</strong> 吗？此操作不可恢复。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setItemToDelete(null)}>取消</Button>
              <Button variant="destructive" onClick={handleDelete}>确定删除</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
