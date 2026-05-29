import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FolderOpen } from "lucide-react";

interface LabsSettingsTabProps {
  localSettings: Record<string, any>;
  handleLocalUpdate: (key: string, value: any) => void;
  onSelectPath: (key: string) => Promise<void>;
}

export default function LabsSettingsTab({ localSettings, handleLocalUpdate, onSelectPath }: LabsSettingsTabProps) {
  return (
    <div className="space-y-6">
      <div className="text-lg font-semibold mb-4 border-b pb-2">Labs 配置</div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="w-4 h-4" />
            全局数据根目录
          </CardTitle>
          <CardDescription>
            设置所有实验工具（如产品图制作等）的默认本地存储目录。如果留空，将自动保存在系统默认 AppData 目录下。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={localSettings.labsCustomRootPath || ""}
              onChange={(e) => handleLocalUpdate("labsCustomRootPath", e.target.value)}
              placeholder="留空使用默认位置"
              className="flex-1"
            />
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => onSelectPath("labsCustomRootPath")}
            >
              <FolderOpen className="w-4 h-4" />
            </Button>
          </div>
          {!localSettings.labsCustomRootPath && (
            <p className="text-xs text-muted-foreground mt-2">
              默认为: APPDATA%\com.sanmediabox.app\labs
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">产品图画布 — 最大撤回次数</CardTitle>
          <CardDescription>
            设置画布操作历史的最大保留步数（1 ~ 200）。步数越多，内存占用越高。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              max={200}
              value={localSettings.canvasUndoMaxCount ?? 50}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) {
                  handleLocalUpdate("canvasUndoMaxCount", Math.min(200, Math.max(1, val)));
                }
              }}
              className="w-28"
            />
            <span className="text-sm text-muted-foreground">步</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            当前值：{localSettings.canvasUndoMaxCount ?? 50} 步（默认 50 步）
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
