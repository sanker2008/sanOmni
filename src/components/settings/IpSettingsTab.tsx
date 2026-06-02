import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScanLine, Loader2, FolderOpen, AlertTriangle } from "lucide-react";
import { scannerApi } from "@/services/tauri";
import { toast } from "@/hooks/useToast";
import type { ResetType } from "./ResetConfirmDialog";

interface IpSettingsTabProps {
  localSettings: Record<string, any>;
  handleLocalUpdate: (key: string, value: any) => void;
  onSelectPath: (key: string) => Promise<void>;
  onTriggerReset: (type: ResetType) => void;
}

export default function IpSettingsTab({
  localSettings,
  handleLocalUpdate,
  onSelectPath,
  onTriggerReset,
}: IpSettingsTabProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [isCleaningInbox, setIsCleaningInbox] = useState(false);
  const [inboxScanResult, setInboxScanResult] = useState<any>(null);
  const [isExecutingCleanup, setIsExecutingCleanup] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleImportMissing = async () => {
    if (!inboxScanResult?.missing_in_db.length) return;
    setIsImporting(true);
    try {
      const { ipImageApi } = await import("@/services/tauri");
      
      let successCount = 0;
      let failCount = 0;

      for (const item of inboxScanResult.missing_in_db) {
        try {
          const result = await ipImageApi.import({
            file_path: item.absolute_path,
            file_name: item.filename,
            file_size: item.file_size,
            ip_id: "unknown", // 默认导入到 unknown，让用户稍后手动归类
            tags: [],
          });
          const { useIpImageStore } = await import("@/stores");
          useIpImageStore.getState().addImage(result);
          successCount++;
        } catch (error) {
          console.error("Failed to import:", error);
          failCount++;
        }
      }

      toast({
        title: "导入完成",
        description: `成功导入 ${successCount} 张图片${failCount > 0 ? `，失败 ${failCount} 张` : ''}`,
      });
      
      let inboxPath = localSettings.ipCustomInboxPath;
      if (!inboxPath) {
        const { getAppRoot } = await import("@/lib/pathUtils");
        const { join } = await import("@tauri-apps/api/path");
        const appDir = await getAppRoot();
        inboxPath = await join(appDir, "ip_inbox");
      }
      const result = await scannerApi.scanIpInbox(inboxPath);
      setInboxScanResult(result);

    } catch (error) {
      toast({
        title: "✗ 导入失败",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
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
                      {localSettings.unifiedRootPath ? `默认：${localSettings.unifiedRootPath}\\ip_inbox` : '默认：%APPDATA%\\com.sanomni.app\\ip_inbox'}
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
                      {localSettings.unifiedRootPath ? `默认：${localSettings.unifiedRootPath}\\ip_archived` : '默认：%APPDATA%\\com.sanomni.app\\ip_archived'}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">自定义作品集根目录</CardTitle>
                  <CardDescription>
                    作品及相关角色的存储位置。留空则使用默认位置（AppData/works）
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      value={localSettings.customWorksPath || ""}
                      onChange={(e) =>
                        handleLocalUpdate("customWorksPath", e.target.value)
                      }
                      placeholder="留空使用默认位置"
                      className="flex-1"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => onSelectPath("customWorksPath")}
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                  </div>
                  {!localSettings.customWorksPath && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {localSettings.unifiedRootPath ? `默认：${localSettings.unifiedRootPath}\\works` : '默认：%APPDATA%\\com.sanomni.app\\works'}
                    </p>
                  )}
                </CardContent>
              </Card>



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
                      setInboxScanResult(null);
                      try {
                        let inboxPath: string;
                        const customPath = localSettings.ipCustomInboxPath;

                        if (customPath) {
                          inboxPath = customPath;
                        } else {
                          const { getAppRoot } = await import("@/lib/pathUtils");
                          const { join } = await import("@tauri-apps/api/path");
                          const appDir = await getAppRoot();
                          inboxPath = await join(appDir, "ip_inbox");
                        }

                        const result = await scannerApi.scanIpInbox(inboxPath);
                        setInboxScanResult(result);
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

                  {inboxScanResult && (
                    <div className="rounded-md border bg-muted/40 p-4 space-y-4 text-sm">
                      <div className="flex justify-between items-center">
                        <p className="font-medium text-base">扫描结果</p>
                        <div className="space-x-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={inboxScanResult.missing_in_db.length === 0 || isImporting}
                            onClick={handleImportMissing}
                          >
                            {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            导入文件 ({inboxScanResult.missing_in_db.length})
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={inboxScanResult.missing_on_disk.length === 0 || isExecutingCleanup}
                            onClick={async () => {
                              setIsExecutingCleanup(true);
                              try {
                                const ids = inboxScanResult.missing_on_disk.map((item: any) => item.id);
                                const result = await scannerApi.executeIpInboxCleanup(ids);
                                toast({
                                  title: "✓ 清理完成",
                                  description: `成功清理 ${result.removed_count} 条失效记录`,
                                });
                                setInboxScanResult(null);
                                const { ipImageApi } = await import("@/services/tauri");
                                const inbox = await ipImageApi.getInboxImages();
                                const { useIpImageStore } = await import("@/stores");
                                useIpImageStore.getState().setInboxImages(inbox);
                              } catch (error) {
                                toast({
                                  title: "✗ 清理失败",
                                  description: String(error),
                                  variant: "destructive",
                                });
                              } finally {
                                setIsExecutingCleanup(false);
                              }
                            }}
                          >
                            {isExecutingCleanup ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            确认清理 ({inboxScanResult.missing_on_disk.length})
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-muted-foreground">
                        <span>新增文件 (未入库)</span>
                        <span className="text-blue-600 font-medium">{inboxScanResult.missing_in_db.length}</span>
                        <span>失效记录 (文件已删除)</span>
                        <span className="text-destructive font-medium">{inboxScanResult.missing_on_disk.length}</span>
                      </div>
                      {inboxScanResult.missing_on_disk.length > 0 && (
                        <div className="mt-2 space-y-1 max-h-32 overflow-y-auto bg-background rounded border p-2">
                          <p className="text-xs font-medium text-destructive mb-1 sticky top-0 bg-background">待清理的失效记录：</p>
                          {inboxScanResult.missing_on_disk.map((item: any) => (
                            <p key={item.id} className="text-xs text-muted-foreground truncate" title={item.absolute_path}>
                              {item.id} - {item.absolute_path}
                            </p>
                          ))}
                        </div>
                      )}
                      {inboxScanResult.errors.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs font-medium text-destructive">错误详情：</p>
                          {inboxScanResult.errors.map((err: any, i: number) => (
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
                          const { getAppRoot } = await import("@/lib/pathUtils");
                          const { join } = await import("@tauri-apps/api/path");
                          const appDir = await getAppRoot();
                          libraryPath = await join(appDir, "ip_archived");
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
