import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getDbPath } from "@/services/tauri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/useToast";
import { CheckCircle, XCircle } from "lucide-react";

export default function SyncTab() {
  const [serverUrl, setServerUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

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

  useEffect(() => {
    loadStatus();
  }, []);

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
            
            <div className="pt-2">
              {status.enabled ? (
                <Button variant="destructive" onClick={() => handleToggle(false)}>停用同步引擎</Button>
              ) : (
                <Button variant="default" onClick={() => handleToggle(true)}>启用同步引擎</Button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">加载中...</p>
        )}
      </div>
    </div>
  );
}
