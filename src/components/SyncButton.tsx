import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getDbPath } from "@/services/tauri";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RefreshCw } from "lucide-react";
import { toast } from "@/hooks/useToast";

export default function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [enabled, setEnabled] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [direction, setDirection] = useState<"both" | "push" | "pull">("both");

  const checkStatus = async () => {
    try {
      const dbPath = await getDbPath();
      const res = await invoke<any>("sync_get_status", { dbPath });
      if (res && res.success !== false && res.data) {
        setEnabled(res.data.enabled && !!res.data.server_url);
      } else {
        setEnabled(false);
      }
    } catch (e) {
      console.error(e);
      setEnabled(false);
    }
  };

  useEffect(() => {
    checkStatus();
    // Poll every 10 seconds to check if we have pending changes or if enabled
    const timer = setInterval(checkStatus, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unlisten = listen<any>("sync-progress", (event) => {
      setProgress(event.payload);
    });
    return () => {
      unlisten.then(f => f());
    };
  }, []);

  const executeSync = async () => {
    if (syncing) return;
    setConfirmOpen(false);
    setSyncing(true);
    setProgress(null);
    try {
      const dbPath = await getDbPath();
      const res = await invoke<any>("sync_now", { dbPath, direction });
      if (res && res.success === false) {
        throw new Error(res.error || "未知错误");
      }
      const data = res.data || res;
      let desc = `推送到云端: ${data.pushed} 条`;
      if (data.pushed_details && data.pushed > 0) {
        const d = data.pushed_details;
        const details = [];
        if (d.inserts > 0) details.push(`新增 ${d.inserts}`);
        if (d.updates > 0) details.push(`修改 ${d.updates}`);
        if (d.deletes > 0) details.push(`删除 ${d.deletes}`);
        if (details.length > 0) desc += ` (${details.join(', ')})`;
      }
      desc += `, 从云端拉取: ${data.pulled} 条`;

      toast({ 
        title: "同步完成", 
        description: desc,
        variant: "success" 
      });
      checkStatus();
      window.dispatchEvent(new CustomEvent("sync-completed", { detail: data }));
    } catch (e: any) {
      toast({ title: "同步失败", description: e.toString(), variant: "destructive" });
    } finally {
      setSyncing(false);
      setProgress(null);
    }
  };

  if (!enabled) return null;

  return (
    <div className="flex items-center gap-2">
      {syncing && progress && (
        <span className="text-xs text-muted-foreground w-32 truncate text-right">
          {progress.phase === "upload" ? "上传" : "下载"} {progress.current}/{progress.total}
        </span>
      )}
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => setConfirmOpen(true)} 
        disabled={syncing}
        className="gap-2 bg-card"
        title="立即同步"
      >
        <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin text-primary" : ""}`} />
        <span className="hidden md:inline">
          {syncing ? "同步中..." : "同步"}
        </span>
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认同步</DialogTitle>
            <DialogDescription>
              请选择同步模式。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <label className="flex items-start gap-3 cursor-pointer p-2 rounded-lg hover:bg-muted/50 border border-transparent has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5 transition-colors">
              <input type="radio" name="sync_direction" checked={direction === "both"} onChange={() => setDirection("both")} className="w-4 h-4 mt-1" />
              <div>
                <div className="font-medium">双向同步（默认）</div>
                <div className="text-xs text-muted-foreground">推送本地变更，并拉取云端新数据。</div>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer p-2 rounded-lg hover:bg-muted/50 border border-transparent has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5 transition-colors">
              <input type="radio" name="sync_direction" checked={direction === "push"} onChange={() => setDirection("push")} className="w-4 h-4 mt-1" />
              <div>
                <div className="font-medium">仅推送到云端</div>
                <div className="text-xs text-muted-foreground">只上传本地的修改，不拉取其他设备的新数据。</div>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer p-2 rounded-lg hover:bg-muted/50 border border-transparent has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5 transition-colors">
              <input type="radio" name="sync_direction" checked={direction === "pull"} onChange={() => setDirection("pull")} className="w-4 h-4 mt-1" />
              <div>
                <div className="font-medium">仅从云端拉取</div>
                <div className="text-xs text-muted-foreground">不上传本地的修改，只把云端最新的数据拉下来。</div>
              </div>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>取消</Button>
            <Button onClick={executeSync}>确认同步</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
