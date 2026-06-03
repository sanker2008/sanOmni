import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ExternalLink, Download, CheckCircle, Info, Database, RotateCw } from "lucide-react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

export default function AboutTab() {
  const [checking, setChecking] = useState(false);
  const [updateObj, setUpdateObj] = useState<Update | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>("...");
  
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isReadyToRestart, setIsReadyToRestart] = useState(false);

  useEffect(() => {
    getVersion().then(v => setCurrentVersion(v)).catch(console.error);
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    setChecking(true);
    setError(null);
    setUpdateObj(null);
    
    try {
      const update = await check();
      if (update) {
        setUpdateObj(update);
      } else {
        // null means no update available
        setUpdateObj(null);
      }
    } catch (err: any) {
      const errMsg = typeof err === 'string' ? err : (err?.message || "网络请求失败");
      setError(errMsg);
    } finally {
      setChecking(false);
    }
  }, []);

  const handleDownloadAndInstall = async () => {
    if (!updateObj) return;
    
    setIsDownloading(true);
    setDownloadProgress(0);
    
    let downloaded = 0;
    let contentLength = 0;

    try {
      await updateObj.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setDownloadProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case 'Finished':
            setIsDownloading(false);
            setIsReadyToRestart(true);
            break;
        }
      });
    } catch (err: any) {
      console.error("Failed to download and install update:", err);
      setIsDownloading(false);
      setError("自动下载更新失败: " + (err?.message || "未知错误"));
      
      // Fallback
      try {
        const { open } = await import("@tauri-apps/plugin-shell");
        if (updateObj.body) {
           await open("https://github.com/sanker2008/sanOmni/releases/latest");
        }
      } catch {}
    }
  };

  const handleRestart = async () => {
    await relaunch();
  };

  const handleOpenRepo = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open("https://github.com/sanker2008/sanOmni");
    } catch {
      window.open("https://github.com/sanker2008/sanOmni", "_blank");
    }
  };

  return (
    <div className="space-y-6">
      {/* 版本信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="w-4 h-4" />
            应用信息
          </CardTitle>
          <CardDescription>
            sanOmni — 工具集合
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">当前版本</span>
              <Badge variant="outline" className="font-mono">
                v{currentVersion}
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleOpenRepo}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              GitHub
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 检查更新 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="w-4 h-4" />
            版本更新
          </CardTitle>
          <CardDescription>
            检查是否有可用的新版本并自动安装
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              variant="default"
              size="sm"
              onClick={handleCheckUpdate}
              disabled={checking || isDownloading || isReadyToRestart}
              className="gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checking ? "animate-spin" : ""}`} />
              {checking ? "检查中..." : "检查更新"}
            </Button>
          </div>

          {/* 检查结果 */}
          {updateObj !== null ? (
            <div className="rounded-lg border p-4 border-primary/50 bg-primary/5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                    </span>
                    <span className="text-sm font-medium">
                      发现新版本
                      <span className="font-semibold ml-1">v{updateObj.version}</span>
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      当前 v{currentVersion}
                    </Badge>
                  </div>
                  
                  {isReadyToRestart ? (
                    <Button
                      size="sm"
                      className="gap-2 bg-green-500 hover:bg-green-600 text-white"
                      onClick={handleRestart}
                    >
                      <RotateCw className="w-4 h-4" />
                      立即重启
                    </Button>
                  ) : isDownloading ? (
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-muted-foreground">{downloadProgress}%</span>
                      <div className="w-24 h-1.5 bg-muted overflow-hidden rounded-full">
                        <div 
                          className="h-full bg-primary transition-all duration-200"
                          style={{ width: `${downloadProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={handleDownloadAndInstall}
                    >
                      <Download className="w-4 h-4" />
                      自动更新
                    </Button>
                  )}
                </div>

                {updateObj.body && (
                  <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3 max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {updateObj.body}
                  </div>
                )}
                
                {updateObj.date && (
                  <p className="text-xs text-muted-foreground">
                    发布于 {new Date(updateObj.date).toLocaleDateString("zh-CN", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                )}
              </div>
            </div>
          ) : !checking && !error ? (
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 p-4 rounded-lg bg-green-500/5 border border-green-500/50">
              <CheckCircle className="w-4 h-4" />
              已是最新版本
            </div>
          ) : null}

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">
                检查更新失败：{error}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                请检查网络连接后重试
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 数据安全 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4" />
            数据安全
          </CardTitle>
          <CardDescription>
            应用更新时会自动保护您的数据
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>数据库在每次启动时自动备份，保留最近 3 份</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>用户数据存储在 AppData 目录，与程序文件分离</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>更新安装不会覆盖或删除您的图片和设置</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
