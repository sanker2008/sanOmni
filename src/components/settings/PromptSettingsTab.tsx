import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { ScanLine, Loader2, FolderOpen, AlertTriangle, Plus, X } from "lucide-react";
import { scannerApi } from "@/services/tauri";
import { useImageStore } from "@/stores";
import { toast } from "@/hooks/useToast";
import type { ResetType } from "./ResetConfirmDialog";

interface PromptSettingsTabProps {
  localSettings: Record<string, any>;
  handleLocalUpdate: (key: string, value: any) => void;
  onSelectPath: (key: string) => Promise<void>;
  onTriggerReset: (type: ResetType) => void;
  activeWatchers: any[];
}

export default function PromptSettingsTab({
  localSettings,
  handleLocalUpdate,
  onSelectPath,
  onTriggerReset,
  activeWatchers,
}: PromptSettingsTabProps) {
  const { setArchivedImages, setInboxImages } = useImageStore();
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [isCleaningInbox, setIsCleaningInbox] = useState(false);
  const [inboxCleanupResult, setInboxCleanupResult] = useState<any>(null);
  const [newWatchFolder, setNewWatchFolder] = useState("");

  const handleAddWatchFolder = () => {
    if (newWatchFolder.trim()) {
      const folders = [...(localSettings.watchFolders || []), newWatchFolder.trim()];
      handleLocalUpdate("watchFolders", folders);
      setNewWatchFolder("");
    }
  };

  const handleRemoveWatchFolder = (index: number) => {
    const folders = [...(localSettings.watchFolders || [])];
    folders.splice(index, 1);
    handleLocalUpdate("watchFolders", folders);
  };

  const handleSelectWatchFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selectedFolder = await open({
        directory: true,
        multiple: false,
      });

      if (selectedFolder && typeof selectedFolder === "string") {
        const folders = [...(localSettings.watchFolders || []), selectedFolder];
        handleLocalUpdate("watchFolders", folders);
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
                      setInboxCleanupResult(null);
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

                        const result = await scannerApi.cleanupInbox(inboxPath);
                        setInboxCleanupResult(result);

                        if (result.removed_count > 0) {
                          const { imageApi } = await import("@/services/tauri");
                          const inbox = await imageApi.getInboxImages();
                          setInboxImages(inbox);
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

              
{/* 监控设置 */}
              <div className="text-lg font-semibold mt-8 mb-4 border-b pb-2">文件夹监控与自动分类</div>
              {/* 活跃的监控器 */}
              {activeWatchers.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">活跃的监控器</CardTitle>
                    <CardDescription>
                      当前正在运行的文件夹监控
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {activeWatchers.map((watcher: any) => (
                        <div
                          key={watcher.id}
                          className="flex items-center gap-2 p-2 rounded-md border bg-green-50 dark:bg-green-950"
                        >
                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                          <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm flex-1 truncate">{watcher.path}</span>
                          <Badge variant="outline" className="text-xs">运行中</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">监控文件夹</CardTitle>
                  <CardDescription>
                    添加需要自动监控的文件夹路径，新图片会自动导入到待整理
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(localSettings.watchFolders || []).length === 0 && (
                      <p className="text-sm text-muted-foreground py-2">
                        暂未添加监控文件夹
                      </p>
                    )}
                    {(localSettings.watchFolders || []).map(
                      (folder: string, index: number) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-2 rounded-md border bg-muted/50"
                        >
                          <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm flex-1 truncate">{folder}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => handleRemoveWatchFolder(index)}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )
                    )}
                    <Separator />
                    <div className="flex gap-2">
                      <Input
                        value={newWatchFolder}
                        onChange={(e) => setNewWatchFolder(e.target.value)}
                        placeholder="输入文件夹路径..."
                        className="flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddWatchFolder();
                        }}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleSelectWatchFolder}
                        title="浏览文件夹"
                      >
                        <FolderOpen className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleAddWatchFolder}
                        title="添加"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">文件扩展名过滤</CardTitle>
                  <CardDescription>
                    只监控指定扩展名的文件，多个扩展名用逗号分隔
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Input
                    value={localSettings.watchExtensions || "png,jpg,jpeg,webp,gif"}
                    onChange={(e) =>
                      handleLocalUpdate("watchExtensions", e.target.value)
                    }
                    placeholder="png,jpg,jpeg,webp,gif"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {(localSettings.watchExtensions || "png,jpg,jpeg,webp,gif")
                      .split(",")
                      .filter(Boolean)
                      .map((ext: string) => (
                        <Badge key={ext.trim()} variant="outline">
                          .{ext.trim()}
                        </Badge>
                      ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">防抖时间</CardTitle>
                  <CardDescription>
                    文件变更后等待多久再触发处理，避免重复触发（毫秒）
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Slider
                      value={[localSettings.watchDebounceMs ?? 1000]}
                      onValueChange={([val]) =>
                        handleLocalUpdate("watchDebounceMs", val)
                      }
                      min={200}
                      max={5000}
                      step={100}
                      className="w-full"
                    />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">200ms</span>
                      <Badge variant="secondary">
                        {localSettings.watchDebounceMs ?? 1000}ms
                      </Badge>
                      <span className="text-muted-foreground">5000ms</span>
                    </div>
                  </div>
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
