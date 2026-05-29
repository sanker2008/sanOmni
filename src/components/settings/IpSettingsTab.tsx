import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ScanLine, Loader2, FolderOpen, AlertTriangle, Plus, X, Trash2 } from "lucide-react";
import { scannerApi } from "@/services/tauri";
import { useImageStore } from "@/stores";
import { toast } from "@/hooks/useToast";
import type { ResetType } from "./ResetConfirmDialog";

interface IpSettingsTabProps {
  localSettings: Record<string, any>;
  handleLocalUpdate: (key: string, value: any) => void;
  onSelectPath: (key: string) => Promise<void>;
  onTriggerReset: (type: ResetType) => void;
  activeWatchers: any[];
}

export default function IpSettingsTab({
  localSettings,
  handleLocalUpdate,
  onSelectPath,
  onTriggerReset,
  activeWatchers,
}: IpSettingsTabProps) {
  const { setArchivedImages, setInboxImages } = useImageStore();
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [isCleaningInbox, setIsCleaningInbox] = useState(false);
  const [inboxCleanupResult, setInboxCleanupResult] = useState<any>(null);
  const [newWatchFolder, setNewWatchFolder] = useState("");

  const handleAddWatchFolder = () => {
    if (newWatchFolder.trim()) {
      const folders = [...(localSettings.ipWatchFolders || []), newWatchFolder.trim()];
      handleLocalUpdate("ipWatchFolders", folders);
      setNewWatchFolder("");
    }
  };

  const handleRemoveWatchFolder = (index: number) => {
    const folders = [...(localSettings.ipWatchFolders || [])];
    folders.splice(index, 1);
    handleLocalUpdate("ipWatchFolders", folders);
  };

  const handleSelectWatchFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selectedFolder = await open({
        directory: true,
        multiple: false,
      });

      if (selectedFolder && typeof selectedFolder === "string") {
        const folders = [...(localSettings.ipWatchFolders || []), selectedFolder];
        handleLocalUpdate("ipWatchFolders", folders);
      }
    } catch (error) {
      console.error("Failed to select folder:", error);
    }
  };

  return (
    <div className="space-y-6">
            <div className="space-y-6">
              <div className="text-lg font-semibold mb-4 border-b pb-2">归档与路径配置</div>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">IP 归档命名模板</CardTitle>
                  <CardDescription className="space-y-1.5 mt-1.5">
                    <div>配置归档 IP 资产图片时的文件名命名规则。</div>
                    <div className="flex flex-col gap-1.5 mt-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-primary font-semibold">{"{ip}"}</code>
                        <span>IP 路径标识（例如：<span className="font-mono text-slate-500">sanker</span>，即保存的小写、无空格/特殊符号的标识符，非中文显示名称）</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-primary font-semibold">{"{date}"}</code>
                        <span>归档当天日期（格式为：<span className="font-mono text-slate-500">YYYY-MM-DD</span>，例如 <span className="font-mono text-slate-500">2026-05-27</span>）</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-primary font-semibold">{"{index}"}</code>
                        <span>当天自增排序号（格式为：<span className="font-mono text-slate-500">001</span>, <span className="font-mono text-slate-500">002</span> ...）</span>
                      </div>
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Input
                    value={localSettings.ipNamingTemplate || ""}
                    onChange={(e) => handleLocalUpdate("ipNamingTemplate", e.target.value)}
                    placeholder="{ip}-{date}-{index}"
                  />
                  {(() => {
                    const template = localSettings.ipNamingTemplate || "{ip}-{date}-{index}";
                    const formattedDate = new Date().toISOString().split("T")[0];
                    const previewName = template
                      .replace(/{ip}/g, "sanker")
                      .replace(/{date}/g, formattedDate)
                      .replace(/{index}/g, "001");
                    return (
                      <p className="text-xs text-muted-foreground mt-2">
                        实时预览（以路径标识 <span className="font-mono font-medium text-slate-800 dark:text-slate-200 bg-muted px-1.5 py-0.5 rounded">sanker</span> 为例）：<span className="font-mono font-semibold text-primary">{previewName}.png</span>
                      </p>
                    );
                  })()}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">自定义 IP 待整理路径</CardTitle>
                  <CardDescription>
                    导入 IP 图片时的临时存储位置。留空则使用默认位置（AppData/ip_inbox）
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      value={localSettings.ipCustomInboxPath || ""}
                      onChange={(e) =>
                        handleLocalUpdate("ipCustomInboxPath", e.target.value)
                      }
                      placeholder="留空使用默认位置"
                      className="flex-1"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => onSelectPath("ipCustomInboxPath")}
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                  </div>
                  {!localSettings.ipCustomInboxPath && (
                    <p className="text-xs text-muted-foreground mt-2">
                      默认：%APPDATA%\com.sanmediabox.app\ip_inbox
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">自定义 IP 归档路径</CardTitle>
                  <CardDescription>
                    IP 图片归档的根目录。留空则使用默认位置（AppData/ip_archived）
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      value={localSettings.ipCustomArchivedPath || ""}
                      onChange={(e) =>
                        handleLocalUpdate("ipCustomArchivedPath", e.target.value)
                      }
                      placeholder="留空使用默认位置"
                      className="flex-1"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => onSelectPath("ipCustomArchivedPath")}
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                  </div>
                  {!localSettings.ipCustomArchivedPath && (
                    <p className="text-xs text-muted-foreground mt-2">
                      默认：%APPDATA%\com.sanmediabox.app\ip_archived
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="text-lg font-semibold mt-8 mb-4 border-b pb-2">自动化处理</div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ScanLine className="w-4 h-4" />
                    扫描 IP 待整理目录
                  </CardTitle>
                  <CardDescription>
                    扫描 IP 待整理目录当前实际存在的图片文件，清理数据库中已经被你手动删除的待整理记录。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isCleaningInbox}
                    onClick={async () => {
                      setIsCleaningInbox(true);
                      setInboxCleanupResult(null);
                      try {
                        let inboxPath: string;
                        const customPath = localSettings.ipCustomInboxPath;

                        if (customPath) {
                          inboxPath = customPath;
                        } else {
                          const { appDataDir, join } = await import("@tauri-apps/api/path");
                          const appDir = await appDataDir();
                          inboxPath = await join(appDir, "ip_inbox");
                        }

                        const result = await scannerApi.cleanupIpInbox(inboxPath);
                        setInboxCleanupResult(result);

                        if (result.removed_count > 0) {
                          const { ipImageApi } = await import("@/services/tauri");
                          const inbox = await ipImageApi.getInboxImages();
                          const { useIpImageStore } = await import("@/stores");
                          useIpImageStore.getState().setInboxImages(inbox);
                        }

                      } catch (error) {
                        toast({
                          title: "✗ 扫描失败",
                          description: String(error),
                          variant: "destructive",
                        });
                      } finally {
                        setIsCleaningInbox(false);
                      }
                    }}
                  >
                    {isCleaningInbox ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        扫描中...
                      </>
                    ) : (
                      <>
                        <ScanLine className="w-4 h-4 mr-2" />
                        开始扫描
                      </>
                    )}
                  </Button>

                  {inboxCleanupResult && (
                    <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-sm">
                      <p className="font-medium">扫描完成</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                        <span>检查记录数</span>
                        <span className="text-foreground font-medium">{inboxCleanupResult.scanned_count}</span>
                        <span>保留记录</span>
                        <span>{inboxCleanupResult.kept_count}</span>
                        <span>清理记录</span>
                        <span className="text-green-600 font-medium">{inboxCleanupResult.removed_count}</span>
                        <span>失败</span>
                        <span className={inboxCleanupResult.failed_count > 0 ? "text-destructive font-medium" : ""}>
                          {inboxCleanupResult.failed_count}
                        </span>
                      </div>
                      {inboxCleanupResult.errors.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs font-medium text-destructive">错误详情：</p>
                          {inboxCleanupResult.errors.map((err: any, i: number) => (
                            <p key={i} className="text-xs text-destructive/80 break-all">{err}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ScanLine className="w-4 h-4" />
                    扫描 IP 归档目录
                  </CardTitle>
                  <CardDescription>
                    扫描 IP 归档目录下的图片文件，将未入库的图片按命名模板重命名后直接写入归档数据库。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isScanning}
                    onClick={async () => {
                      setIsScanning(true);
                      setScanResult(null);
                      try {
                        let libraryPath: string;
                        const customPath = localSettings.ipCustomArchivedPath;
                        
                        if (customPath) {
                          libraryPath = customPath;
                        } else {
                          const { appDataDir } = await import("@tauri-apps/api/path");
                          libraryPath = await appDataDir();
                        }
                        
                        const result = await scannerApi.scanIpArchived(
                          libraryPath,
                          localSettings.ipNamingTemplate
                        );
                        setScanResult(result);
                        
                        if (result.imported_count > 0) {
                          const { ipImageApi } = await import("@/services/tauri");
                          const archived = await ipImageApi.getArchivedImages();
                          const { useIpImageStore } = await import("@/stores");
                          useIpImageStore.getState().setArchivedImages(archived);
                        }
                      } catch (error) {
                        toast({
                          title: "✗ 扫描失败",
                          description: String(error),
                          variant: "destructive",
                        });
                      } finally {
                        setIsScanning(false);
                      }
                    }}
                  >
                    {isScanning ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        扫描中...
                      </>
                    ) : (
                      <>
                        <ScanLine className="w-4 h-4 mr-2" />
                        开始扫描
                      </>
                    )}
                  </Button>

                  {scanResult && (
                    <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-sm">
                      <p className="font-medium">扫描完成</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                        <span>扫描文件数</span>
                        <span className="text-foreground font-medium">{scanResult.scanned_count}</span>
                        <span>新增入库</span>
                        <span className="text-green-600 font-medium">{scanResult.imported_count}</span>
                        <span>已重命名</span>
                        <span className="text-blue-600 font-medium">{scanResult.renamed_count}</span>
                        <span>已跳过（已入库）</span>
                        <span>{scanResult.skipped_count}</span>
                        <span>失败</span>
                        <span className={scanResult.failed_count > 0 ? "text-destructive font-medium" : ""}>
                          {scanResult.failed_count}
                        </span>
                      </div>
                      {scanResult.errors.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs font-medium text-destructive">错误详情：</p>
                          {scanResult.errors.map((err: any, i: number) => (
                            <p key={i} className="text-xs text-destructive/80 break-all">{err}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">IP 文件夹监控</CardTitle>
                  <CardDescription>
                    添加需要监控的文件夹，当有新图片时自动导入到 IP 待整理区。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="粘贴文件夹路径，或点击右侧选择..."
                      value={newWatchFolder}
                      onChange={(e) => setNewWatchFolder(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const folders = [...(localSettings.ipWatchFolders || []), newWatchFolder.trim()];
                          handleLocalUpdate("ipWatchFolders", folders);
                          setNewWatchFolder("");
                        }
                      }}
                      className="flex-1"
                    />
                    <Button variant="outline" onClick={handleSelectWatchFolder}>
                      <FolderOpen className="w-4 h-4 mr-2" />
                      浏览
                    </Button>
                    <Button onClick={() => {
                        if (newWatchFolder.trim()) {
                          const folders = [...(localSettings.ipWatchFolders || []), newWatchFolder.trim()];
                          handleLocalUpdate("ipWatchFolders", folders);
                          setNewWatchFolder("");
                        }
                    }}>
                      <Plus className="w-4 h-4 mr-2" />
                      添加
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {localSettings.ipWatchFolders?.map((folder: string, i: number) => {
                      const isActive = activeWatchers.some(
                        w => w.path === folder && w.is_active && w.watcher_type === "ip"
                      );
                      
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2 rounded-md bg-muted/50 border group"
                        >
                          <div className="flex items-center gap-2 overflow-hidden flex-1">
                            <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium truncate" title={folder}>
                              {folder}
                            </span>
                            {isActive ? (
                              <Badge variant="secondary" className="ml-2 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 shrink-0 border-transparent">
                                监控中
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="ml-2 shrink-0">
                                未激活
                              </Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2"
                            onClick={() => {
                              const folders = [...(localSettings.ipWatchFolders || [])];
                              folders.splice(i, 1);
                              handleLocalUpdate("ipWatchFolders", folders);
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      );
                    })}
                    {(!localSettings.ipWatchFolders || localSettings.ipWatchFolders.length === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
                        尚未添加监控文件夹
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-destructive/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-4 h-4" />
                    重置 IP 资产数据
                  </CardTitle>
                  <CardDescription>
                    管理与清除 IP 资产数据库记录（系统默认未知形象 'unknown' 将保留）及对应文件。此操作不可恢复！
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-4">
                  <Button 
                    variant="outline" 
                    className="border-destructive/50 text-destructive hover:bg-destructive/10"
                    size="sm"
                    onClick={() => {
                      onTriggerReset('ip_data');
                    }}
                  >
                    重置数据库记录
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => {
                      onTriggerReset('ip_all');
                    }}
                  >
                    重置数据并删除文件
                  </Button>
                </CardContent>
              </Card>
            </div>
          
    </div>
  );
}
