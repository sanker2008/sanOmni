import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ExternalLink, Download, CheckCircle, Info, Database } from "lucide-react";

interface UpdateInfo {
  has_update: boolean;
  latest_version: string;
  current_version: string;
  download_url: string;
  release_notes: string;
  published_at: string;
}

export default function AboutTab() {
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheckUpdate = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{
        success: boolean;
        data?: UpdateInfo;
        error?: string;
      }>("check_for_update");
      if (result.success && result.data) {
        setUpdateInfo(result.data);
      } else {
        setError(result.error || "检查更新失败");
      }
    } catch (err: any) {
      setError(err?.message || "网络请求失败");
    } finally {
      setChecking(false);
    }
  }, []);

  const handleDownload = async () => {
    if (!updateInfo?.download_url) return;
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(updateInfo.download_url);
    } catch {
      window.open(updateInfo.download_url, "_blank");
    }
  };

  const handleOpenRepo = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open("https://github.com/sanker2008/sanOmni");
    } catch {
      window.open("https://github.com/sanker2008/sanOmni", "_blank");
    }
  };

  // Get current version from updateInfo or fallback
  const currentVersion = updateInfo?.current_version || "0.1.0";

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
            检查是否有可用的新版本
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              variant="default"
              size="sm"
              onClick={handleCheckUpdate}
              disabled={checking}
              className="gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checking ? "animate-spin" : ""}`} />
              {checking ? "检查中..." : "检查更新"}
            </Button>
          </div>

          {/* 检查结果 */}
          {updateInfo && (
            <div className={`rounded-lg border p-4 ${updateInfo.has_update
                ? "border-primary/50 bg-primary/5"
                : "border-green-500/50 bg-green-500/5"
              }`}>
              {updateInfo.has_update ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                    </span>
                    <span className="text-sm font-medium">
                      发现新版本
                      <span className="font-semibold ml-1">v{updateInfo.latest_version}</span>
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      当前 v{updateInfo.current_version}
                    </Badge>
                  </div>

                  {updateInfo.release_notes && (
                    <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3 max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {updateInfo.release_notes}
                    </div>
                  )}

                  {updateInfo.published_at && (
                    <p className="text-xs text-muted-foreground">
                      发布于 {new Date(updateInfo.published_at).toLocaleDateString("zh-CN", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  )}

                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={handleDownload}
                  >
                    <Download className="w-3.5 h-3.5" />
                    前往下载
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  已是最新版本
                </div>
              )}
            </div>
          )}

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
