import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScanLine, Loader2, FolderOpen, AlertTriangle } from "lucide-react";
import { scannerApi } from "@/services/tauri";
import { useImageStore } from "@/stores";
import { toast } from "@/hooks/useToast";
import type { ResetType } from "./ResetConfirmDialog";

interface PromptSettingsTabProps {
  localSettings: Record<string, any>;
  handleLocalUpdate: (key: string, value: any) => void;
  onSelectPath: (key: string) => Promise<void>;
  onTriggerReset: (type: ResetType) => void;
}

export default function PromptSettingsTab({
  localSettings,
  handleLocalUpdate,
  onSelectPath,
  onTriggerReset,
}: PromptSettingsTabProps) {
  const { setArchivedImages, setInboxImages } = useImageStore();
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
      const { imageApi, classifyApi } = await import("@/services/tauri");
      
      let successCount = 0;
      let failCount = 0;

      for (const item of inboxScanResult.missing_in_db) {
        let vendorId: string | undefined;
        let modelIds: string[] = [];
        
        try {
          const classification = await classifyApi.classify(item.filename);
          if (classification.confidence > 0.5) {
            vendorId = classification.vendor_id;
            if (classification.model_id) {
              modelIds = [classification.model_id];
            }
          }
        } catch (error) {
          console.error("Classification failed:", error);
        }

        try {
          const result = await imageApi.import({
            file_path: item.absolute_path,
            file_name: item.filename,
            file_size: item.file_size,
            vendor_id: vendorId,
            model_ids: modelIds,
            tags: [],
          });
          useImageStore.getState().addImage(result);
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
      
      let inboxPath = localSettings.customInboxPath;
      if (!inboxPath) {
        const { getAppRoot } = await import("@/lib/pathUtils");
        const { join } = await import("@tauri-apps/api/path");
        const appDir = await getAppRoot();
        inboxPath = await join(appDir, "inbox");
      }
      const result = await scannerApi.scanInbox(inboxPath);
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
                  <CardTitle className="text-base">图片归档命名模板</CardTitle>
                  <CardDescription className="space-y-1.5 mt-1.5">
                    <div>配置归档图片库（待整理/已归档）时的文件名命名规则。</div>
                    <div className="flex flex-col gap-1.5 mt-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-primary font-semibold">{"{vendor}"}</code>
                        <span>大模型厂商标识（例如：<span className="font-mono text-slate-500">openai</span>，即厂商的小写英文标识名，非中文显示名称）</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-primary font-semibold">{"{model}"}</code>
                        <span>生成模型标识（例如：<span className="font-mono text-slate-500">gpt-4</span>，即模型的小写英文/数字缩写标识，非显示名称）</span>
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
                    value={localSettings.namingTemplate || ""}
                    onChange={(e) => handleLocalUpdate("namingTemplate", e.target.value)}
                    placeholder="{vendor}-{model}-{date}-{index}"
                  />
                  {(() => {
                    const template = localSettings.namingTemplate || "{vendor}-{model}-{date}-{index}";
                    const formattedDate = new Date().toISOString().split("T")[0];
                    const previewName = template
                      .replace(/{vendor}/g, "openai")
                      .replace(/{model}/g, "gpt-4")
                      .replace(/{date}/g, formattedDate)
                      .replace(/{index}/g, "001");
                    return (
                      <p className="text-xs text-muted-foreground mt-2">
                        实时预览（以厂商 <span className="font-mono font-medium text-slate-800 dark:text-slate-200 bg-muted px-1.5 py-0.5 rounded">openai</span> 和模型 <span className="font-mono font-medium text-slate-800 dark:text-slate-200 bg-muted px-1.5 py-0.5 rounded">gpt-4</span> 为例）：<span className="font-mono font-semibold text-primary">{previewName}.png</span>
                      </p>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">自定义待整理路径</CardTitle>
                  <CardDescription>
                    导入图片时的临时存储位置。留空则使用默认位置（AppData）
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      value={localSettings.customInboxPath || ""}
                      onChange={(e) =>
                        handleLocalUpdate("customInboxPath", e.target.value)
                      }
                      placeholder="留空使用默认位置"
                      className="flex-1"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => onSelectPath("customInboxPath")}
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                  </div>
                  {!localSettings.customInboxPath && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {localSettings.unifiedRootPath ? `默认：${localSettings.unifiedRootPath}\\inbox` : '默认：%APPDATA%\\com.sanomni.app\\inbox'}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">自定义归档路径</CardTitle>
                  <CardDescription>
                    图片归档时的保存目录。留空则使用默认位置（AppData）
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      value={localSettings.customArchivedPath || ""}
                      onChange={(e) =>
                        handleLocalUpdate("customArchivedPath", e.target.value)
                      }
                      placeholder="留空使用默认位置"
                      className="flex-1"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => onSelectPath("customArchivedPath")}
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                  </div>
                  {!localSettings.customArchivedPath && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {localSettings.unifiedRootPath ? `默认：${localSettings.unifiedRootPath}\\archived` : '默认：%APPDATA%\\com.sanomni.app\\archived'}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ScanLine className="w-4 h-4" />
                    扫描待整理目录
                  </CardTitle>
                  <CardDescription>
                    扫描待整理目录当前实际存在的图片文件，清理数据库中已经被你手动删除的待整理记录。
                    适用于你在文件夹里直接删掉图片后，同步待整理列表。
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
                        const customPath = localSettings.customInboxPath;

                        if (customPath) {
                          inboxPath = customPath;
                        } else {
                          const { getAppRoot } = await import("@/lib/pathUtils");
                          const { join } = await import("@tauri-apps/api/path");
                          const appDir = await getAppRoot();
                          inboxPath = await join(appDir, "inbox");
                        }

                        const result = await scannerApi.scanInbox(inboxPath);
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
                                const result = await scannerApi.executeInboxCleanup(ids);
                                toast({
                                  title: "✓ 清理完成",
                                  description: `成功清理 ${result.removed_count} 条失效记录`,
                                });
                                setInboxScanResult(null);
                                const { imageApi } = await import("@/services/tauri");
                                const inbox = await imageApi.getInboxImages();
                                setInboxImages(inbox);
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
                    扫描归档目录
                  </CardTitle>
                  <CardDescription>
                    扫描归档目录下的图片文件，将未入库的图片按命名模板重命名后直接写入归档数据库。
                    适用于从外部复制图片到归档目录后的批量导入。
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
                        // 使用自定义路径或默认路径
                        let libraryPath: string;
                        const customPath = localSettings.customArchivedPath;
                        
                        if (customPath) {
                          libraryPath = customPath;
                        } else {
                          // 使用默认路径
                          const { getAppRoot } = await import("@/lib/pathUtils");
                          const { join } = await import("@tauri-apps/api/path");
                          const appDir = await getAppRoot();
                          libraryPath = await join(appDir, "archived");
                        }
                        
                        const result = await scannerApi.scanArchived(
                          libraryPath,
                          localSettings.namingTemplate
                        );
                        setScanResult(result);
                        // 刷新已归档图片列表
                        if (result.imported_count > 0) {
                          const { imageApi } = await import("@/services/tauri");
                          const archived = await imageApi.getArchivedImages();
                          setArchivedImages(archived);
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
                    重置 Prompt 模板数据
                  </CardTitle>
                  <CardDescription>
                    管理与清除 Prompt 模板数据库记录及对应文件。此操作不可恢复！
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-4">
                  <Button 
                    variant="outline" 
                    className="border-destructive/50 text-destructive hover:bg-destructive/10"
                    size="sm"
                    onClick={() => {
                      onTriggerReset('prompt_data');
                    }}
                  >
                    重置数据库记录
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => {
                      onTriggerReset('prompt_all');
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
