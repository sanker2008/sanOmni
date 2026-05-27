import { useState, useEffect, useCallback } from "react";
import { useUIStore, useImageStore } from "@/stores";
import { settingsApi, scannerApi } from "@/services/tauri";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { X, ScanLine, Loader2, Plus, Trash2, FolderOpen, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/useToast";
import TrashView from "./TrashView";
import ConfirmDialog from "./ConfirmDialog";

// 默认设置
const DEFAULT_SETTINGS: Record<string, any> = {
  // 通用设置
  namingTemplate: "{vendor}-{model}-{date}-{index}",
  customInboxPath: "",  // 自定义待整理路径（留空使用默认）
  customArchivedPath: "",  // 自定义 archived 路径（留空使用默认）
  showFullImage: false,  // 列表中是否显示完整图片（不裁剪）
  lightThemeColor: "#2563eb",
  darkThemeColor: "#60a5fa",



  // 监控设置
  watchFolders: [],
  watchExtensions: "png,jpg,jpeg,webp,gif",
  watchDebounceMs: 1000,

  // IP 专属设置
  ipNamingTemplate: "{ip}-{date}-{index}",
  ipCustomInboxPath: "",
  ipCustomArchivedPath: "",
  ipWatchFolders: [],
  ipWatchExtensions: "png,jpg,jpeg,webp,gif",
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

type SettingsTab = "general" | "prompt" | "ip" | "shortcuts" | "trash";

const SETTINGS_TABS: { key: SettingsTab; label: string }[] = [
  { key: "general", label: "通用设置" },
  { key: "prompt", label: "Prompt 模板管理" },
  { key: "ip", label: "IP 资产管理" },
  { key: "shortcuts", label: "快捷键" },
  { key: "trash", label: "回收站" },
];

function SettingsView() {
  const { settingsOpen, closeSettings, settings, updateSetting, settingsTab, setSettingsTab } = useUIStore();
  const { setArchivedImages, setInboxImages } = useImageStore();
  const activeSettingsTab = (settingsTab as SettingsTab) || "general";
  const setActiveSettingsTab = (tab: SettingsTab) => setSettingsTab(tab);
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
  
  // Reset management states
  const [resetType, setResetType] = useState<'general' | 'prompt_data' | 'prompt_all' | 'ip_data' | 'ip_all' | null>(null);
  const [resetStep, setResetStep] = useState(0); // 0, 1, 2

  const resetContent = (() => {
    switch (resetType) {
      case 'general':
        return {
          step1Title: "确认重置通用数据",
          step1Desc: "确定要重置通用数据吗？这将清除所有主题色、布局偏好等基础设置。注意：您的 Prompt 模板和 IP 资产数据将保持原样，不受任何影响！",
          step2Title: "⚠️ 通用设置最终确认",
          step2Desc: "【警告】重置通用数据是不可逆的！所有通用系统设置和界面显示首选项都将被恢复为默认值。您真的确定要重置吗？",
          confirmText: "确认重置",
          action: async () => {
            await settingsApi.resetGeneralSettings();
            toast({
              title: "✓ 通用设置已重置",
              description: "通用设置已恢复默认，应用将重新加载",
            });
            setTimeout(() => window.location.reload(), 1000);
          }
        };
      case 'prompt_data':
        return {
          step1Title: "确认重置 Prompt 模板数据",
          step1Desc: "确定要重置 Prompt 模板数据吗？这将清空数据库中的所有 Prompt 模板记录、图片关联和分类。注意：图片文件本身不会被删除！",
          step2Title: "⚠️ Prompt 记录最终确认",
          step2Desc: "【警告】此操作将清除所有 Prompt 模板的数据库记录，且不可恢复！您真的确定要重置吗？",
          confirmText: "确认重置记录",
          action: async () => {
            await settingsApi.resetPromptData(false);
            toast({
              title: "✓ Prompt 数据库记录已重置",
              description: "Prompt 模板数据已重置，应用将重新加载",
            });
            setTimeout(() => window.location.reload(), 1000);
          }
        };
      case 'prompt_all':
        return {
          step1Title: "⚠️ 确认重置数据并删除 Prompt 文件",
          step1Desc: "确定要重置 Prompt 数据并【删除所有关联图片文件】吗？这将清空 Prompt 模板数据库记录，并且【永久删除】待处理(inbox)和归档(archived)目录下的所有图片文件！",
          step2Title: "🚨 Prompt 文件永久删除警告",
          step2Desc: "【极其严重警告】所有待处理(inbox)和归档(archived)目录下的图片文件都将被彻底删除，无法恢复！请确保您已做好备份。确定要永久删除文件并重置吗？",
          confirmText: "永久删除并重置",
          action: async () => {
            await settingsApi.resetPromptData(true);
            toast({
              title: "✓ Prompt 数据及文件已彻底删除",
              description: "相关文件与记录已清理，应用将重新加载",
            });
            setTimeout(() => window.location.reload(), 1000);
          }
        };
      case 'ip_data':
        return {
          step1Title: "确认重置 IP 资产数据",
          step1Desc: "确定要重置 IP 资产数据吗？这将清空数据库中的所有 IP 形象记录、资产关联、表情包和贴纸（系统默认的未知形象 'unknown' 将予以保留）。注意：您的图片文件本身不会被删除！",
          step2Title: "⚠️ IP 资产记录最终确认",
          step2Desc: "【警告】此操作将清除所有 IP 形象及关联的数据库记录（除 'unknown' 外），且不可恢复！您真的确定要重置吗？",
          confirmText: "确认重置记录",
          action: async () => {
            await settingsApi.resetIpData(false);
            toast({
              title: "✓ IP 资产数据库记录已重置",
              description: "IP 资产数据已重置，应用将重新加载",
            });
            setTimeout(() => window.location.reload(), 1000);
          }
        };
      case 'ip_all':
        return {
          step1Title: "⚠️ 确认重置数据并删除 IP 文件",
          step1Desc: "确定要重置 IP 资产数据并【删除所有关联图片文件】吗？这将清空所有 IP 资产数据库记录（保留默认 'unknown'），并且【永久删除】IP待处理(ip_inbox)和IP归档(ip_archived)目录下的所有图片文件！",
          step2Title: "🚨 IP 文件永久删除警告",
          step2Desc: "【极其严重警告】所有 IP 待处理(ip_inbox)和归档(ip_archived)目录下的图片文件都将被彻底删除，无法恢复！请确保您已备份。确定要永久删除所有 IP 资产文件并重置吗？",
          confirmText: "永久删除并重置",
          action: async () => {
            await settingsApi.resetIpData(true);
            toast({
              title: "✓ IP 资产数据及文件已彻底删除",
              description: "相关 IP 文件与记录已清理，应用将重新加载",
            });
            setTimeout(() => window.location.reload(), 1000);
          }
        };
      default:
        return null;
    }
  })();

  // Tab 切换时清空扫描结果
  useEffect(() => {
    setScanResult(null);
    setInboxCleanupResult(null);
  }, [activeSettingsTab]);

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
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩层 */}
      <div className="absolute inset-0 bg-black/50" onClick={closeSettings} />

      {/* 设置面板 */}
      <div className="relative z-10 w-full max-w-3xl max-h-[85vh] bg-card rounded-lg border shadow-lg flex flex-col overflow-hidden">
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
                  <CardTitle className="text-base">图片显示模式</CardTitle>
                  <CardDescription>
                    控制网格列表中图片的显示方式
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">显示完整图片</p>
                      <p className="text-xs text-muted-foreground">
                        开启后图片不会被裁剪，将完整显示在卡片中；关闭则以正方形裁剪填充
                      </p>
                    </div>
                    <Switch
                      checked={localSettings.showFullImage ?? false}
                      onCheckedChange={(checked) =>
                        handleLocalUpdate("showFullImage", checked)
                      }
                    />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-destructive/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-4 h-4" />
                    重置通用数据
                  </CardTitle>
                  <CardDescription>
                    重置所有系统设置参数，但不会影响 IP 资产或 Prompt 模板数据。此操作不可恢复！
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => {
                      setResetType('general');
                      setResetStep(1);
                    }}
                  >
                    重置通用数据
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          
          {/* Prompt 模板相关 */}
          {activeSettingsTab === "prompt" && (
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
                          {scanResult.errors.map((err, i) => (
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
                      setResetType('prompt_data');
                      setResetStep(1);
                    }}
                  >
                    重置数据库记录
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => {
                      setResetType('prompt_all');
                      setResetStep(1);
                    }}
                  >
                    重置数据并删除文件
                  </Button>
                </CardContent>
              </Card>
                      
            </div>
          )}

          {/* IP 资产管理相关 */}
          {activeSettingsTab === "ip" && (
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
                      onClick={() => handleSelectCustomPath("ipCustomInboxPath")}
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
                      onClick={() => handleSelectCustomPath("ipCustomArchivedPath")}
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
                          {scanResult.errors.map((err, i) => (
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
                      setResetType('ip_data');
                      setResetStep(1);
                    }}
                  >
                    重置数据库记录
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => {
                      setResetType('ip_all');
                      setResetStep(1);
                    }}
                  >
                    重置数据并删除文件
                  </Button>
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

          {/* 回收站 */}
          {activeSettingsTab === "trash" && (
            <div className="space-y-6">
              <TrashView />
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

    {/* Unified Reset Confirmation - Step 1 */}
    <ConfirmDialog
      open={resetStep === 1 && resetContent !== null}
      title={resetContent?.step1Title || "确认重置"}
      description={resetContent?.step1Desc || ""}
      confirmText="继续"
      cancelText="取消"
      variant="destructive"
      onConfirm={() => setResetStep(2)}
      onCancel={() => {
        setResetStep(0);
        setResetType(null);
      }}
    />

    {/* Unified Reset Confirmation - Step 2 */}
    <ConfirmDialog
      open={resetStep === 2 && resetContent !== null}
      title={resetContent?.step2Title || "最终确认"}
      description={resetContent?.step2Desc || ""}
      confirmText={resetContent?.confirmText || "确认"}
      cancelText="取消"
      variant="destructive"
      onConfirm={async () => {
        setResetStep(0);
        const action = resetContent?.action;
        setResetType(null);
        if (action) {
          try {
            await action();
          } catch (error) {
            toast({
              title: "✗ 操作失败",
              description: String(error),
              variant: "destructive",
            });
          }
        }
      }}
      onCancel={() => {
        setResetStep(0);
        setResetType(null);
      }}
    />
    </>
  );
}

export default SettingsView;
