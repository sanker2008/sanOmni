import { useState, useEffect, useCallback } from "react";
import { useUIStore, useVendorStore, useImageStore } from "@/stores";
import { settingsApi, scannerApi } from "@/services/tauri";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { X, Plus, FolderOpen, AlertTriangle, Edit2, Trash2, ChevronDown, ChevronRight, Save, ScanLine, Loader2 } from "lucide-react";

// 默认设置
const DEFAULT_SETTINGS: Record<string, any> = {
  // 通用设置
  namingTemplate: "{vendor}-{model}-{date}-{index}",
  customInboxPath: "",  // 自定义待整理路径（留空使用默认）
  customArchivedPath: "",  // 自定义 archived 路径（留空使用默认）
  lightThemeColor: "#2563eb",
  darkThemeColor: "#60a5fa",

  // 水印设置
  watermarkAutoDetect: true,
  watermarkConfidenceThreshold: 0.7,

  // 监控设置
  watchFolders: [],
  watchExtensions: "png,jpg,jpeg,webp,gif",
  watchDebounceMs: 1000,
};

// 快捷键列表（只读）
const SHORTCUTS = [
  { key: "Ctrl + N", description: "导入新图片" },
  { key: "Ctrl + A", description: "全选图片" },
  { key: "Delete", description: "删除选中图片" },
  { key: "Ctrl + E", description: "快速编辑" },
  { key: "Ctrl + S", description: "归档选中图片" },
  { key: "Ctrl + F", description: "聚焦搜索框" },
  { key: "Escape", description: "取消选择 / 关闭弹窗" },
  { key: "Ctrl + 1", description: "切换到待整理" },
  { key: "Ctrl + 2", description: "切换到已归档" },
  { key: "Ctrl + ,", description: "打开设置" },
];

type SettingsTab = "general" | "watermark" | "monitor" | "vendors" | "shortcuts";

const SETTINGS_TABS: { key: SettingsTab; label: string }[] = [
  { key: "general", label: "通用设置" },
  { key: "watermark", label: "水印设置" },
  { key: "monitor", label: "监控设置" },
  { key: "vendors", label: "厂商管理" },
  { key: "shortcuts", label: "快捷键" },
];

function SettingsView() {
  const { settingsOpen, closeSettings, settings, updateSetting } = useUIStore();
  const { vendors, setVendors } = useVendorStore();
  const { setArchivedImages, setInboxImages } = useImageStore();
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>("general");
  const [localSettings, setLocalSettings] = useState<Record<string, any>>({});
  const [newWatchFolder, setNewWatchFolder] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [activeWatchers, setActiveWatchers] = useState<any[]>([]);

  // 扫描状态
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    scanned_count: number;
    imported_count: number;
    skipped_count: number;
    renamed_count: number;
    failed_count: number;
    errors: string[];
  } | null>(null);
  const [isCleaningInbox, setIsCleaningInbox] = useState(false);
  const [inboxCleanupResult, setInboxCleanupResult] = useState<{
    scanned_count: number;
    kept_count: number;
    removed_count: number;
    failed_count: number;
    errors: string[];
  } | null>(null);
  
  // Vendor management state
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());
  const [editingVendor, setEditingVendor] = useState<string | null>(null);
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [vendorForm, setVendorForm] = useState({ name: "", path: "" });
  const [modelForm, setModelForm] = useState({ name: "", path: "", description: "" });
  const [addingModelForVendor, setAddingModelForVendor] = useState<string | null>(null);

  // 初始化本地设置
  useEffect(() => {
    if (settingsOpen) {
      setLocalSettings({ ...DEFAULT_SETTINGS, ...settings });
      setHasChanges(false);
      
      // 加载活跃的监控器
      loadActiveWatchers();
    }
  }, [settingsOpen, settings]);

  // 加载活跃的监控器
  const loadActiveWatchers = async () => {
    try {
      const { watcherApi } = await import("@/services/tauri");
      const watchers = await watcherApi.getActive();
      setActiveWatchers(watchers);
    } catch (error) {
      console.error("Failed to load active watchers:", error);
    }
  };

  // 检测变更
  useEffect(() => {
    const hasDiff = JSON.stringify(localSettings) !== JSON.stringify({ ...DEFAULT_SETTINGS, ...settings });
    setHasChanges(hasDiff);
  }, [localSettings, settings]);

  // 更新本地设置
  const handleLocalUpdate = useCallback((key: string, value: any) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  // 保存设置
  const handleSave = useCallback(() => {
    Object.entries(localSettings).forEach(([key, value]) => {
      updateSetting(key, value);
    });
    setHasChanges(false);
    closeSettings();
  }, [closeSettings, localSettings, updateSetting]);

  // 添加监控文件夹
  const handleAddWatchFolder = useCallback(() => {
    if (newWatchFolder.trim()) {
      const folders = [...(localSettings.watchFolders || []), newWatchFolder.trim()];
      handleLocalUpdate("watchFolders", folders);
      setNewWatchFolder("");
    }
  }, [newWatchFolder, localSettings.watchFolders, handleLocalUpdate]);

  // 通过对话框选择文件夹
  const handleSelectWatchFolder = useCallback(async () => {
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
  }, [localSettings.watchFolders, handleLocalUpdate]);

  // 选择自定义路径
  const handleSelectCustomPath = useCallback(async (settingKey: string) => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selectedFolder = await open({
        directory: true,
        multiple: false,
      });

      if (selectedFolder && typeof selectedFolder === "string") {
        handleLocalUpdate(settingKey, selectedFolder);
      }
    } catch (error) {
      console.error("Failed to select folder:", error);
    }
  }, [handleLocalUpdate]);

  // 移除监控文件夹
  const handleRemoveWatchFolder = useCallback(
    (index: number) => {
      const folders = [...(localSettings.watchFolders || [])];
      folders.splice(index, 1);
      handleLocalUpdate("watchFolders", folders);
    },
    [localSettings.watchFolders, handleLocalUpdate]
  );

  if (!settingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩层 */}
      <div className="absolute inset-0 bg-black/50" onClick={closeSettings} />

      {/* 设置面板 */}
      <div className="relative z-10 w-full max-w-3xl max-h-[85vh] bg-background rounded-lg border shadow-lg flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">设置</h2>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Button size="sm" onClick={handleSave}>
                保存更改
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={closeSettings}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* 标签栏 */}
        <div className="flex border-b px-6">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeSettingsTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveSettingsTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 通用设置 */}
          {activeSettingsTab === "general" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">主题色</CardTitle>
                  <CardDescription>
                    分别设置普通模式和暗黑模式下的主色，保存后会应用到按钮、选中态和强调色。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">普通模式主题色</p>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={localSettings.lightThemeColor || DEFAULT_SETTINGS.lightThemeColor}
                          onChange={(e) => handleLocalUpdate("lightThemeColor", e.target.value)}
                          className="h-10 w-16 cursor-pointer rounded border bg-background p-1"
                        />
                        <Input
                          value={localSettings.lightThemeColor || DEFAULT_SETTINGS.lightThemeColor}
                          onChange={(e) => handleLocalUpdate("lightThemeColor", e.target.value)}
                          placeholder="#2563eb"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">暗黑模式主题色</p>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={localSettings.darkThemeColor || DEFAULT_SETTINGS.darkThemeColor}
                          onChange={(e) => handleLocalUpdate("darkThemeColor", e.target.value)}
                          className="h-10 w-16 cursor-pointer rounded border bg-background p-1"
                        />
                        <Input
                          value={localSettings.darkThemeColor || DEFAULT_SETTINGS.darkThemeColor}
                          onChange={(e) => handleLocalUpdate("darkThemeColor", e.target.value)}
                          placeholder="#60a5fa"
                        />
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    支持 `#RRGGBB` 格式，例如 `#2563eb`。
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">命名模板</CardTitle>
                  <CardDescription>
                    配置归档图片时的文件名模板。可用变量：
                    <code className="text-xs bg-muted px-1 py-0.5 rounded ml-1">
                      {"{vendor}"}
                    </code>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded ml-1">
                      {"{model}"}
                    </code>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded ml-1">
                      {"{date}"}
                    </code>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded ml-1">
                      {"{index}"}
                    </code>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Input
                    value={localSettings.namingTemplate || ""}
                    onChange={(e) => handleLocalUpdate("namingTemplate", e.target.value)}
                    placeholder="{vendor}-{model}-{date}-{index}"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    示例：OpenAI-GPT Image 2-20260509-001.png
                  </p>
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
                      onClick={() => handleSelectCustomPath("customInboxPath")}
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                  </div>
                  {!localSettings.customInboxPath && (
                    <p className="text-xs text-muted-foreground mt-2">
                      默认：%APPDATA%\com.sanmediabox.app\inbox
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
                      onClick={() => handleSelectCustomPath("customArchivedPath")}
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                  </div>
                  {!localSettings.customArchivedPath && (
                    <p className="text-xs text-muted-foreground mt-2">
                      默认：%APPDATA%\com.sanmediabox.app\archived
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
                          const { appDataDir, join } = await import("@tauri-apps/api/path");
                          const appDir = await appDataDir();
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
                        alert(`扫描失败: ${error}`);
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
                          {inboxCleanupResult.errors.map((err, i) => (
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
                          const { appDataDir } = await import("@tauri-apps/api/path");
                          libraryPath = await appDataDir();
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
                        alert(`扫描失败: ${error}`);
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
                          {scanResult.errors.map((err, i) => (
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
                    重置数据库
                  </CardTitle>
                  <CardDescription>
                    删除所有数据并重新初始化数据库。此操作不可恢复！
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={async () => {
                      if (confirm("确定要重置数据库吗？这将删除所有图片记录、标签和设置！\n\n注意：图片文件本身不会被删除。")) {
                        try {
                          await settingsApi.resetDatabase();
                          alert("数据库已重置，请重启应用。");
                          window.location.reload();
                        } catch (error) {
                          alert(`重置失败: ${error}`);
                        }
                      }
                    }}
                  >
                    重置数据库
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 水印设置 */}
          {activeSettingsTab === "watermark" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">自动检测水印</CardTitle>
                  <CardDescription>
                    导入图片时自动检测是否包含水印
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">启用自动检测</p>
                      <p className="text-xs text-muted-foreground">
                        开启后将在导入时自动运行水印检测
                      </p>
                    </div>
                    <Switch
                      checked={localSettings.watermarkAutoDetect ?? true}
                      onCheckedChange={(checked) =>
                        handleLocalUpdate("watermarkAutoDetect", checked)
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">检测置信度阈值</CardTitle>
                  <CardDescription>
                    水印检测的置信度阈值，低于此值的结果将被忽略
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Slider
                      value={[
                        (localSettings.watermarkConfidenceThreshold ?? 0.7) * 100,
                      ]}
                      onValueChange={([val]) =>
                        handleLocalUpdate(
                          "watermarkConfidenceThreshold",
                          Math.round(val) / 100
                        )
                      }
                      min={0}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">宽松 (0%)</span>
                      <Badge variant="secondary">
                        {Math.round((localSettings.watermarkConfidenceThreshold ?? 0.7) * 100)}%
                      </Badge>
                      <span className="text-muted-foreground">严格 (100%)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 监控设置 */}
          {activeSettingsTab === "monitor" && (
            <div className="space-y-6">
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
            </div>
          )}

          {/* 厂商管理 */}
          {activeSettingsTab === "vendors" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">厂商和模型管理</CardTitle>
                  <CardDescription>
                    管理所有 AI 图片生成厂商和对应的模型
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {vendors.map((vendor) => {
                      const isExpanded = expandedVendors.has(vendor.id);
                      const isEditing = editingVendor === vendor.id;

                      return (
                        <div key={vendor.id} className="border rounded-lg p-3">
                          {/* Vendor Header */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                const next = new Set(expandedVendors);
                                if (next.has(vendor.id)) {
                                  next.delete(vendor.id);
                                } else {
                                  next.add(vendor.id);
                                }
                                setExpandedVendors(next);
                              }}
                              className="p-1 hover:bg-muted rounded"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>

                            {isEditing ? (
                              <div className="flex-1 flex items-center gap-2">
                                <Input
                                  value={vendorForm.name}
                                  onChange={(e) =>
                                    setVendorForm({ ...vendorForm, name: e.target.value })
                                  }
                                  placeholder="厂商名称"
                                  className="flex-1"
                                />
                                <Input
                                  value={vendorForm.path}
                                  onChange={(e) =>
                                    setVendorForm({ ...vendorForm, path: e.target.value })
                                  }
                                  placeholder="路径标识"
                                  className="flex-1"
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={async () => {
                                    try {
                                      const { vendorApi } = await import("@/services/tauri");
                                      await vendorApi.update(vendor.id, vendorForm.name, vendorForm.path);
                                      // Reload vendors
                                      const updatedVendors = await vendorApi.getAll();
                                      setVendors(updatedVendors);
                                      setEditingVendor(null);
                                    } catch (error) {
                                      alert(`更新失败: ${error}`);
                                    }
                                  }}
                                >
                                  <Save className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingVendor(null)}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <span className="font-medium flex-1">{vendor.name}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {vendor.models.length} 个模型
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingVendor(vendor.id);
                                    setVendorForm({ name: vendor.name, path: vendor.path });
                                  }}
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={async () => {
                                    if (confirm(`确定要删除厂商 "${vendor.name}" 吗？`)) {
                                      try {
                                        const { vendorApi } = await import("@/services/tauri");
                                        await vendorApi.delete(vendor.id);
                                        const updatedVendors = await vendorApi.getAll();
                                        setVendors(updatedVendors);
                                      } catch (error) {
                                        alert(`删除失败: ${error}`);
                                      }
                                    }
                                  }}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                          </div>

                          {/* Models List */}
                          {isExpanded && (
                            <div className="ml-8 mt-3 space-y-2">
                              {vendor.models.map((model) => {
                                const isEditingModel = editingModel === model.id;

                                return (
                                  <div
                                    key={model.id}
                                    className="flex items-center gap-2 p-2 rounded-md border bg-muted/30"
                                  >
                                    {isEditingModel ? (
                                      <>
                                        <Input
                                          value={modelForm.name}
                                          onChange={(e) =>
                                            setModelForm({ ...modelForm, name: e.target.value })
                                          }
                                          placeholder="模型名称"
                                          className="flex-1"
                                        />
                                        <Input
                                          value={modelForm.path}
                                          onChange={(e) =>
                                            setModelForm({ ...modelForm, path: e.target.value })
                                          }
                                          placeholder="路径标识"
                                          className="flex-1"
                                        />
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={async () => {
                                            try {
                                              const { vendorApi } = await import("@/services/tauri");
                                              await vendorApi.updateModel(
                                                model.id,
                                                modelForm.name,
                                                modelForm.path,
                                                modelForm.description
                                              );
                                              const updatedVendors = await vendorApi.getAll();
                                              setVendors(updatedVendors);
                                              setEditingModel(null);
                                            } catch (error) {
                                              alert(`更新失败: ${error}`);
                                            }
                                          }}
                                        >
                                          <Save className="w-4 h-4" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => setEditingModel(null)}
                                        >
                                          <X className="w-4 h-4" />
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-sm flex-1">{model.name}</span>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => {
                                            setEditingModel(model.id);
                                            setModelForm({
                                              name: model.name,
                                              path: model.path,
                                              description: model.description || "",
                                            });
                                          }}
                                        >
                                          <Edit2 className="w-3 h-3" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={async () => {
                                            if (confirm(`确定要删除模型 "${model.name}" 吗？`)) {
                                              try {
                                                const { vendorApi } = await import("@/services/tauri");
                                                await vendorApi.deleteModel(model.id);
                                                const updatedVendors = await vendorApi.getAll();
                                                setVendors(updatedVendors);
                                              } catch (error) {
                                                alert(`删除失败: ${error}`);
                                              }
                                            }
                                          }}
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                );
                              })}

                              {/* Add Model Form */}
                              {addingModelForVendor === vendor.id ? (
                                <div className="flex items-center gap-2 p-2 rounded-md border bg-blue-50 dark:bg-blue-950">
                                  <Input
                                    value={modelForm.name}
                                    onChange={(e) =>
                                      setModelForm({ ...modelForm, name: e.target.value })
                                    }
                                    placeholder="模型名称"
                                    className="flex-1"
                                  />
                                  <Input
                                    value={modelForm.path}
                                    onChange={(e) =>
                                      setModelForm({ ...modelForm, path: e.target.value })
                                    }
                                    placeholder="路径标识"
                                    className="flex-1"
                                  />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={async () => {
                                      try {
                                        const { vendorApi } = await import("@/services/tauri");
                                        await vendorApi.addModel(
                                          vendor.id,
                                          modelForm.name,
                                          modelForm.path,
                                          modelForm.description
                                        );
                                        const updatedVendors = await vendorApi.getAll();
                                        setVendors(updatedVendors);
                                        setAddingModelForVendor(null);
                                        setModelForm({ name: "", path: "", description: "" });
                                      } catch (error) {
                                        alert(`添加失败: ${error}`);
                                      }
                                    }}
                                  >
                                    <Save className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setAddingModelForVendor(null);
                                      setModelForm({ name: "", path: "", description: "" });
                                    }}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full"
                                  onClick={() => {
                                    setAddingModelForVendor(vendor.id);
                                    setModelForm({ name: "", path: "", description: "" });
                                  }}
                                >
                                  <Plus className="w-3.5 h-3.5 mr-1" />
                                  添加模型
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Add Vendor Button */}
                    <Separator />
                    {editingVendor === "new" ? (
                      <div className="flex items-center gap-2 p-3 rounded-lg border bg-blue-50 dark:bg-blue-950">
                        <Input
                          value={vendorForm.name}
                          onChange={(e) =>
                            setVendorForm({ ...vendorForm, name: e.target.value })
                          }
                          placeholder="厂商名称（如：OpenAI）"
                          className="flex-1"
                        />
                        <Input
                          value={vendorForm.path}
                          onChange={(e) =>
                            setVendorForm({ ...vendorForm, path: e.target.value })
                          }
                          placeholder="路径标识（如：openai）"
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              const { vendorApi } = await import("@/services/tauri");
                              await vendorApi.add(vendorForm.name, vendorForm.path);
                              const updatedVendors = await vendorApi.getAll();
                              setVendors(updatedVendors);
                              setEditingVendor(null);
                              setVendorForm({ name: "", path: "" });
                            } catch (error) {
                              alert(`添加失败: ${error}`);
                            }
                          }}
                        >
                          <Save className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingVendor(null);
                            setVendorForm({ name: "", path: "" });
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setEditingVendor("new");
                          setVendorForm({ name: "", path: "" });
                        }}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        添加新厂商
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 快捷键 */}
          {activeSettingsTab === "shortcuts" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">快捷键列表</CardTitle>
                  <CardDescription>当前应用支持的所有快捷键</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {SHORTCUTS.map((shortcut) => (
                      <div
                        key={shortcut.key}
                        className="flex items-center justify-between py-2.5 px-3 rounded-md hover:bg-muted/50"
                      >
                        <span className="text-sm">{shortcut.description}</span>
                        <kbd className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono bg-muted border rounded">
                          {shortcut.key.split(" + ").map((k, i) => (
                            <span key={i}>
                              {i > 0 && <span className="text-muted-foreground mr-1">+</span>}
                              {k}
                            </span>
                          ))}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30">
          <p className="text-xs text-muted-foreground">
            设置自动保存到本地存储
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={closeSettings}>
              关闭
            </Button>
            {hasChanges && (
              <Button size="sm" onClick={handleSave}>
                保存更改
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsView;
