import { useState, useEffect, useCallback } from "react";
import { useUIStore } from "@/stores";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

import { DEFAULT_SETTINGS, SETTINGS_TABS, SettingsTab } from "./constants";
import ResetConfirmDialog, { ResetType } from "./ResetConfirmDialog";
import GeneralSettingsTab from "./GeneralSettingsTab";
import PromptSettingsTab from "./PromptSettingsTab";
import IpSettingsTab from "./IpSettingsTab";
import LabsSettingsTab from "./LabsSettingsTab";
import ShortcutsTab from "./ShortcutsTab";
import AboutTab from "./AboutTab";
import TrashView from "@/components/TrashView";

export default function SettingsView() {
  const { settingsOpen, closeSettings, settings, updateSetting, settingsTab, setSettingsTab } = useUIStore();
  const activeSettingsTab = (settingsTab as SettingsTab) || "general";
  const setActiveSettingsTab = (tab: SettingsTab) => setSettingsTab(tab);
  
  const [localSettings, setLocalSettings] = useState<Record<string, any>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [activeWatchers, setActiveWatchers] = useState<any[]>([]);

  const [resetType, setResetType] = useState<ResetType>(null);

  // 初始化本地设置
  useEffect(() => {
    if (settingsOpen) {
      setLocalSettings({ ...DEFAULT_SETTINGS, ...settings });
      setHasChanges(false);
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
            {SETTINGS_TABS.filter(tab => 
              import.meta.env.VITE_APP_MODE !== "prompt_only" || !["ip", "labs"].includes(tab.key)
            ).map((tab) => (
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
            {activeSettingsTab === "general" && (
              <GeneralSettingsTab 
                localSettings={localSettings} 
                handleLocalUpdate={handleLocalUpdate} 
                onSelectPath={handleSelectCustomPath}
                onTriggerReset={setResetType} 
              />
            )}
            
            {activeSettingsTab === "prompt" && (
              <PromptSettingsTab 
                localSettings={localSettings} 
                handleLocalUpdate={handleLocalUpdate} 
                onSelectPath={handleSelectCustomPath} 
                onTriggerReset={setResetType} 
                activeWatchers={activeWatchers}
              />
            )}

            {activeSettingsTab === "ip" && import.meta.env.VITE_APP_MODE !== "prompt_only" && (
              <IpSettingsTab 
                localSettings={localSettings} 
                handleLocalUpdate={handleLocalUpdate} 
                onSelectPath={handleSelectCustomPath} 
                onTriggerReset={setResetType} 
                activeWatchers={activeWatchers}
              />
            )}

            {activeSettingsTab === "labs" && import.meta.env.VITE_APP_MODE !== "prompt_only" && (
              <LabsSettingsTab 
                localSettings={localSettings} 
                handleLocalUpdate={handleLocalUpdate} 
                onSelectPath={handleSelectCustomPath} 
              />
            )}

            {activeSettingsTab === "shortcuts" && <ShortcutsTab />}

            {activeSettingsTab === "trash" && (
              <div className="space-y-6">
                <TrashView />
              </div>
            )}

            {activeSettingsTab === "about" && <AboutTab />}
          </div>
        </div>
      </div>

      <ResetConfirmDialog 
        resetType={resetType} 
        onClose={() => setResetType(null)} 
      />
    </>
  );
}
