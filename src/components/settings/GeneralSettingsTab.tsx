import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Database, Wrench, Loader2 } from "lucide-react";
import { DEFAULT_SETTINGS } from "./constants";
import { useState } from "react";
import { settingsApi, type RepairReport } from "@/services/tauri";
import { toast } from "@/hooks/useToast";
import type { ResetType } from "./ResetConfirmDialog";

interface GeneralSettingsTabProps {
  localSettings: Record<string, any>;
  handleLocalUpdate: (key: string, value: any) => void;
  onSelectPath: (key: string) => Promise<void>;
  onTriggerReset: (type: ResetType) => void;
}

export default function GeneralSettingsTab({ localSettings, handleLocalUpdate, onSelectPath, onTriggerReset }: GeneralSettingsTabProps) {
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [repairReport, setRepairReport] = useState<RepairReport | null>(null);

  const handleDiagnose = async (autoFix: boolean) => {
    setIsDiagnosing(true);
    try {
      const { resolveSettingPath, getAppRoot } = await import("@/lib/pathUtils");
      const currentAppRoot = await getAppRoot();
      
      const dirKeys = [
        "unifiedRootPath", "customInboxPath", "customArchivedPath", 
        "customWorksPath", "labsCustomRootPath", "ipCustomInboxPath", "ipCustomArchivedPath"
      ];
      
      const searchDirs = [];
      for (const key of dirKeys) {
        const path = await resolveSettingPath(key, localSettings[key] || "", currentAppRoot);
        if (path) searchDirs.push(path);
      }
      
      const report = await settingsApi.repairDatabasePaths(searchDirs, autoFix);
      setRepairReport(report);
      
      if (autoFix) {
        toast({
          title: "修复完成",
          description: `成功修复 ${report.fixed_count} 条失效路径，应用即将刷新`,
          variant: "success",
        });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast({
          title: "诊断完成",
          description: `扫描 ${report.total_records} 条记录，发现 ${report.broken_count} 条失效`,
        });
      }
    } catch (err: any) {
      toast({
        title: autoFix ? "修复失败" : "诊断失败",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setIsDiagnosing(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            统一根目录
          </CardTitle>
          <CardDescription>
            统一设置所有实验工具、图片资产、待整理和归档等功能的数据存储根目录。
            如果单独配置了某个功能的路径，则优先使用单独的配置。留空则默认保存在系统 AppData 目录下。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={localSettings.unifiedRootPath || ""}
              onChange={(e) => handleLocalUpdate("unifiedRootPath", e.target.value)}
              placeholder="留空使用系统默认位置"
              className="flex-1"
            />
            <Button 
              variant="outline" 
              onClick={() => onSelectPath("unifiedRootPath")}
            >
              浏览...
            </Button>
          </div>
          <div className="flex flex-col gap-1 mt-2">
            {!localSettings.unifiedRootPath && (
              <p className="text-xs text-muted-foreground">
                默认：%APPDATA%\com.sanomni.app
              </p>
            )}
            <p className="text-xs text-green-600 dark:text-green-500">
              ✓ 系统现已原生支持跨盘（跨分区）无缝转移，可放心修改根目录或跨盘存放资产。
            </p>
          </div>
        </CardContent>
      </Card>

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
              onCheckedChange={(checked) => handleLocalUpdate("showFullImage", checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">窗口关闭行为</CardTitle>
          <CardDescription>
            控制点击窗口关闭按钮时，是直接退出应用，还是隐藏到系统托盘继续运行。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">关闭时最小化到托盘</p>
              <p className="text-xs text-muted-foreground">
                关闭后可通过托盘图标恢复窗口；关闭此选项则点击关闭按钮会真正退出。
              </p>
            </div>
            <Switch
              checked={localSettings.closeToTray ?? false}
              onCheckedChange={(checked) => handleLocalUpdate("closeToTray", checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4" />
            数据诊断与修复
          </CardTitle>
          <CardDescription>
            扫描数据库中的路径引用，检测因目录变更、文件移动导致的文件失效问题，并尝试一键修复。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            variant="outline" 
            onClick={() => handleDiagnose(false)}
            disabled={isDiagnosing}
          >
            {isDiagnosing && !repairReport?.fixable_count ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}
            开始诊断
          </Button>

          {repairReport && (
            <div className="bg-muted p-4 rounded-md text-sm space-y-2 mt-4">
              <div className="flex justify-between border-b pb-2 mb-2">
                <span className="font-medium text-foreground">诊断结果</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <div>扫描记录数: <span className="text-foreground">{repairReport.total_records}</span></div>
                <div>路径有效: <span className="text-foreground">{repairReport.valid_count}</span></div>
                <div>路径失效: <span className="text-destructive font-medium">{repairReport.broken_count}</span></div>
                <div>可自动修复: <span className="text-green-600 font-medium">{repairReport.fixable_count}</span></div>
              </div>
              
              {repairReport.fixable_count > 0 && (
                <div className="pt-4 mt-2 border-t">
                  <Button 
                    variant="default"
                    className="w-full"
                    onClick={() => handleDiagnose(true)}
                    disabled={isDiagnosing}
                  >
                    {isDiagnosing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wrench className="w-4 h-4 mr-2" />}
                    一键修复 ({repairReport.fixable_count} 条记录)
                  </Button>
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
            onClick={() => onTriggerReset('general')}
          >
            重置通用数据
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
