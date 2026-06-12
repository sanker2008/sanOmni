import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getDbPath, ipApi } from "@/services/tauri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/useToast";
import { CheckCircle, XCircle, History, ChevronLeft, ChevronRight, FileImage, Tag, Box } from "lucide-react";

export default function SyncTab() {
  const [serverUrl, setServerUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [ipsMap, setIpsMap] = useState<Record<string, string>>({});

  const loadStatus = async () => {
    try {
      const dbPath = await getDbPath();
      const res = await invoke<any>("sync_get_status", { dbPath });
      if (res && res.success !== false) {
        setStatus(res.data);
        if (res.data && res.data.server_url) setServerUrl(res.data.server_url);
        if (res.data && res.data.api_key) setApiKey(res.data.api_key);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadHistory = async (page = 0) => {
    if (!serverUrl || !apiKey) return;
    setHistoryLoading(true);
    try {
      const res = await invoke<any>("sync_get_history", {
        serverUrl,
        apiKey,
        limit: 100,
        offset: page * 100,
      });
      if (res && res.success !== false && res.data) {
        setHistoryRecords(res.data.records || []);
        setHistoryTotal(res.data.total || 0);
        setHistoryPage(page);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    ipApi.getAll().then(ips => {
      const map: Record<string, string> = {};
      ips.forEach(ip => map[ip.id] = ip.name);
      setIpsMap(map);
    }).catch(console.error);
  }, []);

  const renderTimeline = () => {
    if (historyRecords.length === 0) {
      return <p className="text-sm text-muted-foreground">暂无同步记录，点击刷新加载。</p>;
    }

    const groups: Record<string, any> = {};
    historyRecords.forEach(r => {
      const key = `${r.created_at}_${r.device_id}`;
      if (!groups[key]) {
        groups[key] = {
          timestamp: r.created_at,
          deviceId: r.device_id,
          ipStats: { inserts: [], updates: [], deletes: [] },
          imageStats: { inserts: 0, updates: 0, deletes: 0 },
          otherStats: 0
        };
      }
      const ev = groups[key];
      let data: any = {};
      try { if (r.data_json) data = JSON.parse(r.data_json); } catch (e) {}

      if (r.table_name === "ip_assets") {
        const name = data.name || ipsMap[r.record_id] || r.record_id.substring(0, 8);
        if (r.operation === "INSERT") ev.ipStats.inserts.push(name);
        else if (r.operation === "UPDATE") ev.ipStats.updates.push(name);
        else if (r.operation === "DELETE") ev.ipStats.deletes.push(name);
      } else if (r.table_name === "ip_images") {
        if (r.operation === "INSERT") ev.imageStats.inserts++;
        else if (r.operation === "UPDATE") ev.imageStats.updates++;
        else if (r.operation === "DELETE") ev.imageStats.deletes++;
      } else {
        ev.otherStats++;
      }
    });

    const events = Object.values(groups).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return (
      <div className="space-y-6">
        {events.map((ev: any, i: number) => {
          const hasIps = ev.ipStats.inserts.length > 0 || ev.ipStats.updates.length > 0 || ev.ipStats.deletes.length > 0;
          const hasImages = ev.imageStats.inserts > 0 || ev.imageStats.updates > 0 || ev.imageStats.deletes > 0;
          const totalActions = ev.ipStats.inserts.length + ev.ipStats.updates.length + ev.ipStats.deletes.length + ev.imageStats.inserts + ev.imageStats.updates + ev.imageStats.deletes + ev.otherStats;

          return (
            <div key={i} className="flex gap-4">
              <div className="mt-1 flex flex-col items-center">
                <div className="w-2 h-2 rounded-full bg-primary ring-4 ring-primary/20"></div>
                {i !== events.length - 1 && <div className="w-px h-full bg-border my-2"></div>}
              </div>
              <div className="flex-1 pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium">{new Date(ev.timestamp).toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded-md">
                    设备: {ev.deviceId.substring(0, 8)}
                  </span>
                </div>
                
                <div className="bg-card border rounded-lg p-3 space-y-3">
                  <div className="text-xs text-muted-foreground mb-1">本次同步共处理了 {totalActions} 个数据项</div>
                  
                  {hasIps && (
                    <div className="flex items-start gap-2">
                      <Box className="w-4 h-4 text-primary mt-0.5" />
                      <div className="text-sm space-y-1">
                        {ev.ipStats.inserts.length > 0 && <div><span className="text-green-500 font-medium">新增 IP: </span>{ev.ipStats.inserts.join(", ")}</div>}
                        {ev.ipStats.updates.length > 0 && <div><span className="text-blue-500 font-medium">修改 IP: </span>{ev.ipStats.updates.join(", ")}</div>}
                        {ev.ipStats.deletes.length > 0 && <div><span className="text-red-500 font-medium">删除 IP: </span>{ev.ipStats.deletes.join(", ")}</div>}
                      </div>
                    </div>
                  )}

                  {hasImages && (
                    <div className="flex items-start gap-2">
                      <FileImage className="w-4 h-4 text-purple-500 mt-0.5" />
                      <div className="text-sm">
                        处理了 <span className="font-medium">{ev.imageStats.inserts + ev.imageStats.updates + ev.imageStats.deletes}</span> 张图片项
                        <span className="text-muted-foreground ml-1">
                          ({ev.imageStats.inserts > 0 ? `新增 ${ev.imageStats.inserts} ` : ''}
                           {ev.imageStats.updates > 0 ? `修改 ${ev.imageStats.updates} ` : ''}
                           {ev.imageStats.deletes > 0 ? `删除 ${ev.imageStats.deletes}` : ''})
                        </span>
                      </div>
                    </div>
                  )}

                  {ev.otherStats > 0 && (
                    <div className="flex items-start gap-2">
                      <Tag className="w-4 h-4 text-orange-500 mt-0.5" />
                      <div className="text-sm">更新了 {ev.otherStats} 个标签及关联信息</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await invoke<any>("sync_test_connection", { serverUrl, apiKey });
      if (res && res.success === false) {
        toast({ title: "测试失败", description: res.error || "未知错误", variant: "destructive" });
        return;
      }
      const data = res.data || res;
      if (data.authenticated) {
        toast({ title: "连接成功", description: `服务端响应延迟: ${data.latency_ms}ms`, variant: "success" });
      } else if (data.reachable) {
        toast({ title: "认证失败", description: "服务端可达，但 API Key 错误", variant: "destructive" });
      } else {
        toast({ title: "连接失败", description: "无法访问服务端地址", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "错误", description: e.toString(), variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const dbPath = await getDbPath();
      const res = await invoke<any>("sync_configure", { dbPath, serverUrl, apiKey });
      if (res && res.success === false) {
        throw new Error(res.error || "未知错误");
      }
      toast({ title: "配置已保存", variant: "success" });
      await loadStatus();
    } catch (e: any) {
      toast({ title: "保存失败", description: e.toString(), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (enable: boolean) => {
    try {
      const dbPath = await getDbPath();
      let res: any;
      if (enable) {
        res = await invoke("sync_enable", { dbPath });
      } else {
        res = await invoke("sync_disable", { dbPath });
      }
      if (res && res.success === false) {
        throw new Error(res.error || "未知错误");
      }
      toast({ title: enable ? "同步已开启" : "同步已关闭", variant: "success" });
      await loadStatus();
    } catch (e: any) {
      toast({ title: "操作失败", description: e.toString(), variant: "destructive" });
    }
  };

  const handleForceRepush = async () => {
    if (!confirm("这会将本地所有 IP 和图片数据重新排入推送队列。确定继续吗？")) return;
    setLoading(true);
    try {
      const dbPath = await getDbPath();
      const res = await invoke<any>("sync_force_repush", { dbPath });
      if (res && res.success === false) {
        throw new Error(res.error || "未知错误");
      }
      toast({ title: "队列已重置", description: "现在可以点击同步按钮将数据全量推送至云端", variant: "success" });
      await loadStatus();
    } catch (e: any) {
      toast({ title: "重推失败", description: e.toString(), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">同步与云端</h3>
        <p className="text-sm text-muted-foreground mt-1">配置多端同步的 san-sync-server 地址和鉴权密钥。</p>
      </div>
      
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">服务端 URL</label>
          <Input 
            placeholder="http://192.168.1.100:3000" 
            value={serverUrl} 
            onChange={e => setServerUrl(e.target.value)} 
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">API Key</label>
          <Input 
            type="password"
            placeholder="输入服务端配置的 sync_api_key" 
            value={apiKey} 
            onChange={e => setApiKey(e.target.value)} 
          />
        </div>
        
        <div className="flex gap-2">
          <Button onClick={handleTest} disabled={testing || !serverUrl} variant="secondary">
            {testing ? "测试中..." : "测试连接"}
          </Button>
          <Button onClick={handleSave} disabled={loading || !serverUrl}>
            保存配置
          </Button>
        </div>
      </div>

      <div className="h-px bg-border my-6"></div>

      <div className="space-y-4">
        <h3 className="text-md font-medium">同步状态</h3>
        {status ? (
          <div className="space-y-4 bg-muted/50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm">引擎状态</span>
              <div className="flex items-center gap-2">
                {status.enabled ? (
                  <><CheckCircle className="w-4 h-4 text-green-500"/> <span className="text-sm font-medium text-green-600 dark:text-green-400">已开启</span></>
                ) : (
                  <><XCircle className="w-4 h-4 text-muted-foreground"/> <span className="text-sm font-medium text-muted-foreground">未开启</span></>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">待推送本地变更记录数</span>
              <span className="text-sm font-medium">{status.pending_changes}</span>
            </div>
            
            <div className="pt-2 space-y-3">
              <div className="flex gap-2">
                {status.enabled ? (
                  <Button variant="destructive" onClick={() => handleToggle(false)}>停用同步引擎</Button>
                ) : (
                  <Button variant="default" onClick={() => handleToggle(true)}>启用同步引擎</Button>
                )}
                <Button variant="outline" onClick={handleForceRepush} disabled={loading}>
                  强制全量重推
                </Button>
              </div>
              <p className="text-xs text-muted-foreground bg-background/50 p-2 rounded border leading-relaxed">
                <span className="font-medium text-foreground">💡 什么是强制全量重推？</span><br/>
                当你发现云端数据有缺失、或者在一台数据最完整的设备上想要完全覆盖云端时使用。这会将本地**所有**的角色和图片重新加入待同步队列，下次点击“同步”时会强制把本地所有数据重新上传一遍。
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">加载中...</p>
        )}
      </div>

      {status?.enabled && serverUrl && (
        <>
          <div className="h-px bg-border my-6"></div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4" />
                <h3 className="text-md font-medium">同步记录</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => loadHistory(0)} disabled={historyLoading}>
                {historyLoading ? "加载中..." : "刷新"}
              </Button>
            </div>

            {historyRecords.length > 0 ? (
              <div className="rounded-lg border bg-card p-4">
                <div className="max-h-[500px] overflow-y-auto pr-2">
                  {renderTimeline()}
                </div>
                <div className="flex items-center justify-between pt-4 mt-2 border-t">
                  <span className="text-xs text-muted-foreground">共 {historyTotal} 条原始日志</span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={historyPage === 0 || historyLoading}
                      onClick={() => loadHistory(historyPage - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      上一页
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={(historyPage + 1) * 100 >= historyTotal || historyLoading}
                      onClick={() => loadHistory(historyPage + 1)}
                    >
                      下一页
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无同步记录，点击刷新加载。</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
