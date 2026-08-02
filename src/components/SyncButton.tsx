import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getDbPath, ipApi } from "@/services/tauri";
import { type IpAsset } from "@/stores";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { convertFileSrc } from "@tauri-apps/api/core";

export default function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [enabled, setEnabled] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [direction, setDirection] = useState<"both" | "push" | "pull">("both");

  // IP selection state
  const [ipList, setIpList] = useState<IpAsset[]>([]);
  const [selectedIpIds, setSelectedIpIds] = useState<string[] | null>(null); // null = all IPs
  const [ipSectionOpen, setIpSectionOpen] = useState(false);

  const checkStatus = async () => {
    try {
      const dbPath = await getDbPath();
      const res = await invoke<any>("sync_get_status", { dbPath });
      if (res && res.success !== false && res.data) {
        setEnabled(res.data.enabled && !!res.data.server_url && !!res.data.api_key);
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

  // Load IP list when dialog opens
  const handleOpenDialog = async () => {
    setConfirmOpen(true);
    try {
      const data = await ipApi.getAll();
      setIpList(data);
    } catch (e) {
      console.error("Failed to load IPs for sync:", e);
      setIpList([]);
    }
  };

  // Toggle individual IP selection
  const toggleIp = (ipId: string) => {
    if (selectedIpIds === null) {
      // Currently "all" → switch to all-except-this-one
      const allExcept = ipList.map(ip => ip.id).filter(id => id !== ipId);
      setSelectedIpIds(allExcept);
    } else {
      if (selectedIpIds.includes(ipId)) {
        const newList = selectedIpIds.filter(id => id !== ipId);
        setSelectedIpIds(newList.length === 0 ? [] : newList);
      } else {
        const newList = [...selectedIpIds, ipId];
        // If all are selected, go back to null (all)
        setSelectedIpIds(newList.length === ipList.length ? null : newList);
      }
    }
  };

  // Toggle all/none
  const toggleAll = () => {
    if (selectedIpIds === null) {
      setSelectedIpIds([]); // Select none
    } else {
      setSelectedIpIds(null); // Select all
    }
  };

  const isIpSelected = (ipId: string) => {
    return selectedIpIds === null || selectedIpIds.includes(ipId);
  };

  const allSelected = selectedIpIds === null;

  // Label for collapsed IP section
  const ipSectionLabel = (() => {
    if (selectedIpIds === null) return "所有 IP";
    if (selectedIpIds.length === 0) return "未选择";
    if (selectedIpIds.length === 1) {
      const ip = ipList.find(ip => ip.id === selectedIpIds[0]);
      return ip?.name || "1 个 IP";
    }
    return `${selectedIpIds.length} 个 IP`;
  })();

  const executeSync = async () => {
    if (syncing) return;
    // Validate: if push mode with empty selection
    if (direction !== "pull" && selectedIpIds !== null && selectedIpIds.length === 0) {
      toast({ title: "请选择至少一个 IP", variant: "destructive" });
      return;
    }
    setConfirmOpen(false);
    setSyncing(true);
    setProgress(null);
    try {
      const dbPath = await getDbPath();
      // Only pass ipIds for push operations, pull is always full
      const ipIds = direction === "pull" ? undefined : (selectedIpIds ?? undefined);
      const res = await invoke<any>("sync_now", { dbPath, direction, ipIds });
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
      if (data.recovered_missing_records > 0) {
        desc += `；检测到历史同步缺口，已补回 ${data.recovered_missing_records} 条远端记录`;
      }

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

  // Reset IP selection when dialog closes
  useEffect(() => {
    if (!confirmOpen) {
      setSelectedIpIds(null);
      setIpSectionOpen(false);
    }
  }, [confirmOpen]);

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
        onClick={handleOpenDialog} 
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

            {/* IP Selection - hidden when pull-only since pull is always full */}
            {direction !== "pull" && ipList.length > 1 && (
              <div className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  className="flex items-center gap-2 w-full p-2.5 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => setIpSectionOpen(!ipSectionOpen)}
                >
                  {ipSectionOpen
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  }
                  <span className="text-sm font-medium">推送范围</span>
                  <span className="text-xs text-muted-foreground ml-auto">{ipSectionLabel}</span>
                </button>
                {ipSectionOpen && (
                  <div className="border-t px-2 py-1.5 space-y-0.5 max-h-48 overflow-y-auto">
                    {/* Select all / none toggle */}
                    <label className="flex items-center gap-2.5 p-1.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="w-3.5 h-3.5 rounded"
                        ref={(el) => {
                          if (el) el.indeterminate = !allSelected && (selectedIpIds?.length ?? 0) > 0;
                        }}
                      />
                      <span className="text-sm font-medium text-muted-foreground">全选</span>
                    </label>
                    <div className="border-b my-1" />
                    {ipList.map(ip => (
                      <label key={ip.id} className="flex items-center gap-2.5 p-1.5 rounded-md hover:bg-muted/50 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={isIpSelected(ip.id)}
                          onChange={() => toggleIp(ip.id)}
                          className="w-3.5 h-3.5 rounded"
                        />
                        {ip.avatar_path ? (
                          <img
                            src={convertFileSrc(ip.avatar_path)}
                            alt={ip.name}
                            className="w-5 h-5 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <span className="text-[10px] text-muted-foreground">{ip.name[0]}</span>
                          </div>
                        )}
                        <span className="text-sm truncate">{ip.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
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
