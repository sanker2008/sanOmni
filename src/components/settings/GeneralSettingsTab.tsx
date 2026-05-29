import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle } from "lucide-react";
import { DEFAULT_SETTINGS } from "./constants";
import type { ResetType } from "./ResetConfirmDialog";

interface GeneralSettingsTabProps {
  localSettings: Record<string, any>;
  handleLocalUpdate: (key: string, value: any) => void;
  onTriggerReset: (type: ResetType) => void;
}

export default function GeneralSettingsTab({ localSettings, handleLocalUpdate, onTriggerReset }: GeneralSettingsTabProps) {
  return (
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
              onCheckedChange={(checked) => handleLocalUpdate("showFullImage", checked)}
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
            onClick={() => onTriggerReset('general')}
          >
            重置通用数据
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
