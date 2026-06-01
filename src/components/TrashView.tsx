import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Undo2, X, Loader2, FolderOpen, RefreshCw, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { toast } from "@/hooks/useToast";
import { Command } from "@tauri-apps/plugin-shell";
import ConfirmDialog from "./ConfirmDialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface TrashItem {
  filename: string;
  path: string;
  size: number;
  timestamp: number;
}

export default function TrashView() {
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [trashDirPath, setTrashDirPath] = useState<string>("");
  const [restoreItem, setRestoreItem] = useState<TrashItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<TrashItem | null>(null);
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);
  const [previewItem, setPreviewItem] = useState<TrashItem | null>(null);

  useEffect(() => {
    loadTrashItems();
  }, []);

  const loadTrashItems = async () => {
    setLoading(true);
    try {
      const { readDir, exists } = await import("@tauri-apps/plugin-fs");
      const { join } = await import("@tauri-apps/api/path");
      const { getAppRoot } = await import("@/lib/pathUtils");
      
      const appDir = await getAppRoot();
      const trashDir = await join(appDir, "trash");
      
      // 保存回收站路径
      setTrashDirPath(trashDir);
      
      if (!(await exists(trashDir))) {
        setTrashItems([]);
        return;
      }

      const entries = await readDir(trashDir);
      const items: TrashItem[] = [];

      for (const entry of entries) {
        if (entry.isFile) {
          const filePath = await join(trashDir, entry.name);
          
          // 从文件名中提取时间戳
          const match = entry.name.match(/_(\d+)\./);
          const timestamp = match ? parseInt(match[1]) : 0;
          
          // 获取文件大小
          const { stat } = await import("@tauri-apps/plugin-fs");
          const fileInfo = await stat(filePath);
          
          items.push({
            filename: entry.name,
            path: filePath,
            size: Number(fileInfo.size),
            timestamp,
          });
        }
      }

      // 按时间倒序排列
      items.sort((a, b) => b.timestamp - a.timestamp);
      setTrashItems(items);
    } catch (error) {
      console.error("Failed to load trash items:", error);
      toast({
        title: "加载回收站失败",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (item: TrashItem) => {
    try {
      setRestoreItem(item);
    } catch (error) {
      console.error("Failed to restore:", error);
      toast({
        title: "✗ 恢复失败",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const executeRestore = async (item: TrashItem) => {
    setRestoreItem(null);
    try {
      const originalFilename = item.filename.replace(/_\d+\./, ".");

      const { rename, exists } = await import("@tauri-apps/plugin-fs");
      const { invoke } = await import("@tauri-apps/api/core");
      
      // 通过文件名查找对应的图片记录
      const images = await invoke<any[]>("get_all_images");
      const targetImage = images.find(img => img.filename === originalFilename);
      
      if (!targetImage) {
        toast({
          title: "✗ 恢复失败",
          description: `找不到对应的图片记录: ${originalFilename}`,
          variant: "destructive",
        });
        return;
      }

      const currentPath = targetImage.absolute_path;
      
      // 检查当前文件是否存在
      if (!(await exists(currentPath))) {
        toast({
          title: "✗ 恢复失败",
          description: "当前图片文件不存在",
          variant: "destructive",
        });
        return;
      }

      // 创建临时备份（以防恢复失败）
      const { join } = await import("@tauri-apps/api/path");
      const { getAppRoot } = await import("@/lib/pathUtils");
      const appDir = await getAppRoot();
      const tempBackupPath = await join(appDir, `temp_backup_${Date.now()}.tmp`);
      
      try {
        // 1. 备份当前文件（去水印后的）
        await rename(currentPath, tempBackupPath);
        
        // 2. 恢复原图
        await rename(item.path, currentPath);
        
        // 3. 删除临时备份
        const { remove } = await import("@tauri-apps/plugin-fs");
        await remove(tempBackupPath);
        
        toast({
          title: "✓ 恢复成功",
          description: `已将原图恢复到: ${originalFilename}`,
        });

        // 刷新列表
        loadTrashItems();
        // 关闭预览
        if (previewItem?.path === item.path) {
          setPreviewItem(null);
        }
      } catch (error) {
        // 恢复失败，尝试回滚
        try {
          if (await exists(tempBackupPath)) {
            await rename(tempBackupPath, currentPath);
          }
        } catch (rollbackError) {
          console.error("Rollback failed:", rollbackError);
        }
        throw error;
      }
    } catch (error) {
      console.error("Failed to restore:", error);
      toast({
        title: "✗ 恢复失败",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const handleDelete = (item: TrashItem) => {
    setDeleteItem(item);
  };

  const executeDelete = async (item: TrashItem) => {
    setDeleteItem(null);

    try {
      const { remove } = await import("@tauri-apps/plugin-fs");
      await remove(item.path);

      toast({
        title: "✓ 已永久删除",
      });

      loadTrashItems();
      // 关闭预览
      if (previewItem?.path === item.path) {
        setPreviewItem(null);
      }
    } catch (error) {
      console.error("Failed to delete:", error);
      toast({
        title: "✗ 删除失败",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const handlePrevPreview = () => {
    if (!previewItem) return;
    const currentIndex = trashItems.findIndex(item => item.path === previewItem.path);
    if (currentIndex > 0) {
      setPreviewItem(trashItems[currentIndex - 1]);
    }
  };

  const handleNextPreview = () => {
    if (!previewItem) return;
    const currentIndex = trashItems.findIndex(item => item.path === previewItem.path);
    if (currentIndex < trashItems.length - 1) {
      setPreviewItem(trashItems[currentIndex + 1]);
    }
  };

  useEffect(() => {
    if (!previewItem) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevPreview();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNextPreview();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setPreviewItem(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewItem, trashItems]);

  const handleEmptyTrash = () => {
    setShowEmptyConfirm(true);
  };

  const executeEmptyTrash = async () => {
    setShowEmptyConfirm(false);

    try {
      const { remove } = await import("@tauri-apps/plugin-fs");
      
      for (const item of trashItems) {
        await remove(item.path);
      }

      toast({
        title: "✓ 回收站已清空",
      });

      loadTrashItems();
    } catch (error) {
      console.error("Failed to empty trash:", error);
      toast({
        title: "✗ 清空失败",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const handleOpenTrashFolder = async () => {
    if (!trashDirPath) {
      toast({
        title: "✗ 无法打开",
        description: "回收站路径未知",
        variant: "destructive",
      });
      return;
    }

    try {
      // 确保回收站目录存在
      const { exists, mkdir } = await import("@tauri-apps/plugin-fs");
      if (!(await exists(trashDirPath))) {
        await mkdir(trashDirPath, { recursive: true });
      }

      // 根据平台打开文件夹
      if (navigator.userAgent.includes('Windows')) {
        // Windows: 使用 explorer
        await Command.create('explorer', [trashDirPath]).execute();
      } else if (navigator.userAgent.includes('Mac')) {
        // macOS: 使用 open
        await Command.create('open', [trashDirPath]).execute();
      } else {
        // Linux: 使用 xdg-open
        await Command.create('xdg-open', [trashDirPath]).execute();
      }
    } catch (error) {
      console.error("Failed to open trash folder:", error);
      toast({
        title: "✗ 打开失败",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalSize = trashItems.reduce((sum, item) => sum + item.size, 0);

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              回收站
            </CardTitle>
            <CardDescription>
              去水印时的原图会保存在这里，可以恢复原图或永久删除
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenTrashFolder}
              title="打开回收站文件夹"
            >
              <FolderOpen className="w-4 h-4 mr-1" />
              打开文件夹
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadTrashItems}
              disabled={loading}
              title="刷新回收站列表"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              刷新
            </Button>
            {trashItems.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleEmptyTrash}
              >
                清空回收站
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : trashItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Trash2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>回收站是空的</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{trashItems.length} 个文件</span>
              <span>总大小: {formatFileSize(totalSize)}</span>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {trashItems.map((item) => (
                <div
                  key={item.path}
                  className="flex items-center gap-3 p-3 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  {/* 缩略图 */}
                  <div 
                    className="w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0 cursor-pointer relative group"
                    onClick={() => setPreviewItem(item)}
                    title="点击放大查看"
                  >
                    <img
                      src={convertFileSrc(item.path)}
                      alt={item.filename}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Eye className="w-4 h-4 text-white" />
                    </div>
                  </div>

                  {/* 文件信息 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" title={item.filename}>
                      {item.filename.replace(/_\d+\./, ".")}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {formatFileSize(item.size)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(item.timestamp)}
                      </span>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRestore(item)}
                      title="恢复原图（替换当前去水印图片）"
                    >
                      <Undo2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(item)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      title="永久删除"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Restore Confirmation */}
    <ConfirmDialog
      open={restoreItem !== null}
      title="确认恢复原图"
      description={restoreItem ? `确定要恢复 "${restoreItem.filename.replace(/_\d+\./, ".")}" 吗？这将用回收站中的原图替换当前的去水印图片。` : ""}
      confirmText="确认恢复"
      cancelText="取消"
      variant="default"
      onConfirm={() => restoreItem && executeRestore(restoreItem)}
      onCancel={() => setRestoreItem(null)}
    />

    {/* Delete Confirmation */}
    <ConfirmDialog
      open={deleteItem !== null}
      title="确认永久删除"
      description={deleteItem ? `确定要永久删除 "${deleteItem.filename}" 吗？此操作不可恢复！` : ""}
      confirmText="永久删除"
      cancelText="取消"
      variant="destructive"
      onConfirm={() => deleteItem && executeDelete(deleteItem)}
      onCancel={() => setDeleteItem(null)}
    />

    {/* Empty Trash Confirmation */}
    <ConfirmDialog
      open={showEmptyConfirm}
      title="确认清空回收站"
      description={`确定要清空回收站吗？这将永久删除 ${trashItems.length} 个文件，此操作不可恢复！`}
      confirmText="清空回收站"
      cancelText="取消"
      variant="destructive"
      onConfirm={executeEmptyTrash}
      onCancel={() => setShowEmptyConfirm(false)}
    />

    {/* Trash Image Viewer Dialog */}
    <Dialog open={previewItem !== null} onOpenChange={(open) => !open && setPreviewItem(null)}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 overflow-hidden flex flex-col" hideClose>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-card shadow-sm z-10">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold truncate" title={previewItem?.filename}>
              {previewItem ? previewItem.filename.replace(/_\d+\./, ".") : ""}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              {previewItem && (
                <>
                  <span className="text-sm text-muted-foreground">
                    {trashItems.findIndex(item => item.path === previewItem.path) + 1} / {trashItems.length}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatFileSize(previewItem.size)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    删除时间: {formatDate(previewItem.timestamp)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => previewItem && handleRestore(previewItem)}
              title="恢复原图（替换当前去水印图片）"
              className="h-8 gap-1.5"
            >
              <Undo2 className="w-4 h-4" />
              <span>恢复原图</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => previewItem && handleDelete(previewItem)}
              title="永久删除"
              className="h-8 gap-1.5"
            >
              <X className="w-4 h-4" />
              <span>永久删除</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setPreviewItem(null)} className="h-8 w-8">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Image Display */}
        <div className="flex-1 relative bg-black/5 dark:bg-black/20 flex items-center justify-center p-4 min-h-[400px]">
          {/* Navigation Buttons */}
          {previewItem && trashItems.findIndex(item => item.path === previewItem.path) > 0 && (
            <Button
              variant="secondary"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full shadow-lg"
              onClick={handlePrevPreview}
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>
          )}
          
          {previewItem && trashItems.findIndex(item => item.path === previewItem.path) < trashItems.length - 1 && (
            <Button
              variant="secondary"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full shadow-lg"
              onClick={handleNextPreview}
            >
              <ChevronRight className="w-6 h-6" />
            </Button>
          )}

          {/* Image */}
          {previewItem && (
            <img
              src={convertFileSrc(previewItem.path)}
              alt={previewItem.filename}
              className="max-w-full max-h-full object-contain"
              style={{ maxHeight: "calc(90vh - 120px)" }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground text-center">
          使用 ← → 键切换图片 · ESC 关闭
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
