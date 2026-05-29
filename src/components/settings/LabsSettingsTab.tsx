import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FolderOpen, Wand2 } from "lucide-react";
import { ALL_PROVIDER_METAS } from "@/components/lab/ai-image-editor/providers";

interface LabsSettingsTabProps {
  localSettings: Record<string, any>;
  handleLocalUpdate: (key: string, value: any) => void;
  onSelectPath: (key: string) => Promise<void>;
}

export default function LabsSettingsTab({ localSettings, handleLocalUpdate, onSelectPath }: LabsSettingsTabProps) {
  const currentProvider = localSettings.aiImageEditorProvider || "mock";
  const providerConfig: Record<string, any> = localSettings.aiImageEditorProviderConfig || {};

  // 获取当前供应商的字段定义
  const providerMeta = ALL_PROVIDER_METAS.find((m) => m.id === currentProvider);
  const fields = providerMeta?.fields || [];

  const updateProviderConfig = (key: string, value: any) => {
    const newConfig = { ...providerConfig, [key]: value };
    handleLocalUpdate("aiImageEditorProviderConfig", newConfig);
  };

  return (
    <div className="space-y-6">
      <div className="text-lg font-semibold mb-4 border-b pb-2">Labs 配置</div>
      
      {/* AI P图 API 配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="w-4 h-4" />
            AI P图 — API 供应商配置
          </CardTitle>
          <CardDescription>
            选择 AI 图片生成服务供应商并配置对应参数。选择「Mock 模拟」可在无 API 的情况下测试功能。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 供应商选择器 */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">供应商</label>
            <select
              className="w-full bg-muted border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
              value={currentProvider}
              onChange={(e) => handleLocalUpdate("aiImageEditorProvider", e.target.value)}
            >
              {ALL_PROVIDER_METAS.map((meta) => (
                <option key={meta.id} value={meta.id}>
                  {meta.name}
                </option>
              ))}
            </select>
            {providerMeta && (
              <p className="text-xs text-muted-foreground mt-1">{providerMeta.description}</p>
            )}
          </div>

          {/* 动态参数表单 */}
          {fields.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-border">
              {fields.map((field) => (
                <div key={field.key}>
                  <label className="text-sm font-medium mb-1 block">{field.label}</label>
                  {field.type === "select" ? (
                    <select
                      className="w-full bg-muted border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
                      value={providerConfig[field.key] ?? field.defaultValue ?? ""}
                      onChange={(e) => updateProviderConfig(field.key, e.target.value)}
                    >
                      {(field.options || []).map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea
                      className="w-full bg-muted border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary transition-colors resize-y min-h-[80px]"
                      rows={4}
                      placeholder={field.placeholder}
                      value={providerConfig[field.key] ?? field.defaultValue ?? ""}
                      onChange={(e) => updateProviderConfig(field.key, e.target.value)}
                    />
                  ) : field.type === "number" ? (
                    <Input
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      placeholder={field.placeholder}
                      value={providerConfig[field.key] ?? field.defaultValue ?? ""}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) updateProviderConfig(field.key, val);
                        else if (e.target.value === "") updateProviderConfig(field.key, "");
                      }}
                      className="w-40"
                    />
                  ) : (
                    <Input
                      type={field.type === "password" ? "password" : "text"}
                      placeholder={field.placeholder}
                      value={providerConfig[field.key] ?? field.defaultValue ?? ""}
                      onChange={(e) => updateProviderConfig(field.key, e.target.value)}
                    />
                  )}
                  {field.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{field.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 全局数据根目录 */}
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

      {/* 产品图画布设置 */}
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
