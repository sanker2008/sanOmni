import { useState, useEffect, useCallback } from "react";
import { useUIStore } from "@/stores";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { X, Plus, FolderOpen } from "lucide-react";

// 默认设置
const DEFAULT_SETTINGS: Record<string, any> = {
  // 通用设置
  namingTemplate: "{vendor}-{model}-{date}-{index}",
  defaultArchivePath: "",

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
  { key: "Ctrl + 1", description: "切换到收件箱" },
  { key: "Ctrl + 2", description: "切换到已归档" },
  { key: "Ctrl + ,", description: "打开设置" },
];

type SettingsTab = "general" | "watermark" | "monitor" | "shortcuts";

const SETTINGS_TABS: { key: SettingsTab; label: string }[] = [
  { key: "general", label: "通用设置" },
  { key: "watermark", label: "水印设置" },
  { key: "monitor", label: "监控设置" },
  { key: "shortcuts", label: "快捷键" },
];

function SettingsView() {
  const { settingsOpen, closeSettings, settings, updateSetting } = useUIStore();
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>("general");
  const [localSettings, setLocalSettings] = useState<Record<string, any>>({});
  const [newWatchFolder, setNewWatchFolder] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  // 初始化本地设置
  useEffect(() => {
    if (settingsOpen) {
      setLocalSettings({ ...DEFAULT_SETTINGS, ...settings });
      setHasChanges(false);
    }
  }, [settingsOpen, settings]);

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
  }, [localSettings, updateSetting]);

  // 添加监控文件夹
  const handleAddWatchFolder = useCallback(() => {
    if (newWatchFolder.trim()) {
      const folders = [...(localSettings.watchFolders || []), newWatchFolder.trim()];
      handleLocalUpdate("watchFolders", folders);
      setNewWatchFolder("");
    }
  }, [newWatchFolder, localSettings.watchFolders, handleLocalUpdate]);

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
                  <CardTitle className="text-base">默认归档路径</CardTitle>
                  <CardDescription>图片归档时的默认保存目录</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      value={localSettings.defaultArchivePath || ""}
                      onChange={(e) =>
                        handleLocalUpdate("defaultArchivePath", e.target.value)
                      }
                      placeholder="留空则每次手动选择"
                      className="flex-1"
                    />
                    <Button variant="outline" size="icon">
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                  </div>
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
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">监控文件夹</CardTitle>
                  <CardDescription>
                    添加需要自动监控的文件夹路径
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
                        onClick={handleAddWatchFolder}
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
