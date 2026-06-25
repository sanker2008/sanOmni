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
      <div className="text-lg font-semibold mb-4 border-b pb-2">sanLabs 配置</div>
      
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
              {localSettings.unifiedRootPath ? `默认：${localSettings.unifiedRootPath}\\labs` : '默认：%APPDATA%\\com.sanomni.app\\labs'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 高级抠图引擎配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="w-4 h-4" />
            高级抠图 (Pro) 引擎配置
          </CardTitle>
          <CardDescription>
            支持精细发丝抠图和文字保护。你可以选择使用本地 Python 环境，或者下载免配置的独立引擎包。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">运行模式</label>
            <select
              className="w-full bg-muted border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
              value={localSettings.bgRemovalEngineMode || "local"}
              onChange={(e) => handleLocalUpdate("bgRemovalEngineMode", e.target.value)}
            >
              <option value="local">使用本地 Python 环境 (推荐极客使用)</option>
              <option value="download">使用内置独立引擎包 (约需下载 300MB+)</option>
            </select>
          </div>

          {localSettings.bgRemovalEngineMode === "local" || !localSettings.bgRemovalEngineMode ? (
            <div className="pt-2 border-t border-border">
              <label className="text-sm font-medium mb-1 block">Python 解释器路径</label>
              <div className="flex gap-2 mb-2">
                <Input
                  value={localSettings.bgRemovalPythonPath || ""}
                  onChange={(e) => handleLocalUpdate("bgRemovalPythonPath", e.target.value)}
                  placeholder="留空使用系统全局 python 命令"
                  className="flex-1"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => onSelectPath("bgRemovalPythonPath")}
                >
                  <FolderOpen className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                必须安装依赖: <code className="bg-muted px-1 py-0.5 rounded">pip install rembg Pillow opencv-python</code>
              </p>
              <Button variant="secondary" size="sm" onClick={() => {
                alert("即将开发：一键调用 pip 安装依赖功能");
              }}>
                一键安装所需依赖包
              </Button>
            </div>
          ) : (
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium mb-1">独立引擎包状态</div>
                  <div className="text-xs text-muted-foreground">
                    {localSettings.bgRemovalEngineDownloaded 
                      ? "引擎已就绪，可直接使用。"
                      : "尚未下载引擎包。首次使用功能前需先下载引擎。"}
                  </div>
                </div>
                {localSettings.bgRemovalEngineDownloaded ? (
                  <Button variant="destructive" size="sm" onClick={() => handleLocalUpdate("bgRemovalEngineDownloaded", false)}>
                    清除引擎 (释放空间)
                  </Button>
                ) : (
                  <Button variant="default" size="sm" onClick={() => {
                     // 模拟下载完成
                     handleLocalUpdate("bgRemovalEngineDownloaded", true);
                  }}>
                    下载独立引擎
                  </Button>
                )}
              </div>
            </div>
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
