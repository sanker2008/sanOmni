import { useState, useEffect, useCallback } from "react";
import { useUIStore } from "@/stores";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X, ArrowRight } from "lucide-react";

import { DEFAULT_SETTINGS, SETTINGS_TABS, SettingsTab } from "./constants";
import ResetConfirmDialog, { ResetType } from "./ResetConfirmDialog";
import GeneralSettingsTab from "./GeneralSettingsTab";
import PromptSettingsTab from "./PromptSettingsTab";
import IpSettingsTab from "./IpSettingsTab";
import LabsSettingsTab from "./LabsSettingsTab";
import ShortcutsTab from "./ShortcutsTab";
import AboutTab from "./AboutTab";
import SyncTab from "./SyncTab";
import TrashView from "@/components/TrashView";

const KEYRING_SETTING_KEYS = new Set(["sanPromptPublishSecret"]);

function buildPersistedSettings(settings: Record<string, any>): Record<string, string> {
  const settingsToSave: Record<string, string> = {};
  Object.entries(settings).forEach(([k, v]) => {
    if (KEYRING_SETTING_KEYS.has(k)) return;
    if (typeof v === "string") settingsToSave[k] = v;
    else settingsToSave[k] = String(v);
  });
  return settingsToSave;
}

export default function SettingsView() {
  const { settingsOpen, closeSettings, settings, updateSetting, settingsTab, setSettingsTab } = useUIStore();
  const activeSettingsTab = (settingsTab as SettingsTab) || "general";
  const setActiveSettingsTab = (tab: SettingsTab) => setSettingsTab(tab);
  
  const [localSettings, setLocalSettings] = useState<Record<string, any>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [pendingMigrations, setPendingMigrations] = useState<{key: string, label: string, oldPath: string, newPath: string}[] | null>(null);

  const [resetType, setResetType] = useState<ResetType>(null);

  // 初始化本地设置
  useEffect(() => {
    if (settingsOpen) {
      setLocalSettings({ ...DEFAULT_SETTINGS, ...settings });
      setHasChanges(false);
      import("@/services/tauri").then(async ({ settingsApi }) => {
        try {
          const secret = await settingsApi.getSanPromptPublishSecret();
          setLocalSettings((prev) => ({ ...prev, sanPromptPublishSecret: secret }));
        } catch (e) {
          console.error("Failed to load sanPrompt publish secret:", e);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen]);

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
    const executeSave = useCallback(async (doMigrate: boolean) => {
    if (doMigrate && pendingMigrations && pendingMigrations.length > 0) {
      setIsMigrating(true);
      try {
        const { settingsApi, getDbPath } = await import("@/services/tauri");
        const { invoke } = await import("@tauri-apps/api/core");
        const { join } = await import("@tauri-apps/api/path");
        const { toast } = await import("@/hooks/useToast");
        
        for (const migration of pendingMigrations) {
          await settingsApi.migrateDirectory(migration.oldPath, migration.newPath);
          let dbPathToUpdate = await getDbPath();
          if (migration.key === "unifiedRootPath") {
            dbPathToUpdate = await join(migration.newPath, "data", "database.sqlite");
          }
          await invoke("update_database_paths", { dbPath: dbPathToUpdate, oldPath: migration.oldPath, newPath: migration.newPath });
        }
        
        toast({
          title: "迁移成功",
          description: `成功迁移 ${pendingMigrations.length} 个目录数据，应用即将刷新`,
          variant: "success"
        });
        
        // 保存其他设置
        const settingsToSave = buildPersistedSettings(localSettings);
        await settingsApi.setSanPromptPublishSecret(localSettings.sanPromptPublishSecret || "");
        
        await settingsApi.save(settingsToSave);

        // ALWAYS save to the default DB as well, because Rust relies on the default DB to find the unifiedRootPath
        try {
          const { appDataDir, join } = await import("@tauri-apps/api/path");
          const defaultDbPath = await join(await appDataDir(), "data", "database.sqlite");
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("save_settings", { dbPath: defaultDbPath, settings: settingsToSave });
        } catch (e) {
          console.error("Failed to save to default DB", e);
        }

        Object.entries(localSettings).forEach(([key, value]) => {
          updateSetting(key, value);
        });
        setHasChanges(false);
        setPendingMigrations(null);
        closeSettings();
        
        setTimeout(() => {
          window.location.reload();
        }, 1500);
        return;
      } catch (err: any) {
        const { toast } = await import("@/hooks/useToast");
        toast({
          title: "迁移失败",
          description: err.message || "未知错误",
          variant: "destructive"
        });
        setIsMigrating(false);
        return; // 遇到错误，终止
      }
    }

    // 如果不迁移或没有迁移需求
    import("@/services/tauri").then(async ({ settingsApi }) => {
      const settingsToSave = buildPersistedSettings(localSettings);
      await settingsApi.setSanPromptPublishSecret(localSettings.sanPromptPublishSecret || "");
      await settingsApi.save(settingsToSave).catch(e => console.error("Failed to save settings to DB:", e));

      // ALWAYS save to the default DB as well, because Rust relies on the default DB to find the unifiedRootPath
      try {
        const { appDataDir, join } = await import("@tauri-apps/api/path");
        const defaultDbPath = await join(await appDataDir(), "data", "database.sqlite");
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("save_settings", { dbPath: defaultDbPath, settings: settingsToSave });
      } catch (e) {
        console.error("Failed to save to default DB", e);
      }
    });

    Object.entries(localSettings).forEach(([key, value]) => {
      updateSetting(key, value);
    });
    setHasChanges(false);
    setPendingMigrations(null);
    closeSettings();
  }, [localSettings, updateSetting, closeSettings, pendingMigrations]);

  const handleSave = useCallback(async () => {
    const dirKeys = [
      "unifiedRootPath", "customInboxPath", "customArchivedPath", 
      "customWorksPath", "labsCustomRootPath", "ipCustomInboxPath", "ipCustomArchivedPath"
    ];
    
    const dirKeyLabels: Record<string, string> = {
      unifiedRootPath: "统一根目录",
      customInboxPath: "待整理路径",
      customArchivedPath: "归档路径",
      customWorksPath: "作品集路径",
      labsCustomRootPath: "实验室根目录",
      ipCustomInboxPath: "IP 待整理路径",
      ipCustomArchivedPath: "IP 归档路径",
    };

    const changedDirKeys = dirKeys.filter(key => localSettings[key] !== settings[key]);

    if (changedDirKeys.length > 0) {
      const { resolveSettingPath, getAppRoot } = await import("@/lib/pathUtils");
      const currentAppRoot = await getAppRoot();
      
      const required = [];
      for (const key of changedDirKeys) {
        const oldPath = await resolveSettingPath(key, settings[key] || "", currentAppRoot);
        const rawNewPath = localSettings[key] || "";
        const actualNewPath = await resolveSettingPath(key, rawNewPath, currentAppRoot);
        if (oldPath && actualNewPath && oldPath !== actualNewPath) {
          required.push({
            key,
            label: dirKeyLabels[key] || key,
            oldPath,
            newPath: actualNewPath
          });
        }
      }
      
      if (required.length > 0) {
        setPendingMigrations(required);
        return;
      }
    }
    
    // 如果没有迁移需求，直接保存
    executeSave(false);
  }, [localSettings, settings, executeSave]);

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
        <div className="absolute inset-0 bg-black/50" onClick={isMigrating ? undefined : closeSettings} />

        {/* 迁移时的全屏 Loading 覆盖层 */}
        {isMigrating && (
          <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/60 text-white backdrop-blur-sm">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mb-4"></div>
            <p className="text-lg font-medium">正在迁移目录数据，请勿关闭应用...</p>
            <p className="text-sm opacity-80 mt-2">跨盘符迁移可能需要较长时间</p>
          </div>
        )}

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

            {activeSettingsTab === "sync" && <SyncTab />}
            
            {activeSettingsTab === "prompt" && (
              <PromptSettingsTab 
                localSettings={localSettings} 
                handleLocalUpdate={handleLocalUpdate} 
                onSelectPath={handleSelectCustomPath} 
                onTriggerReset={setResetType} 
              />
            )}

            {activeSettingsTab === "ip" && import.meta.env.VITE_APP_MODE !== "prompt_only" && (
              <IpSettingsTab 
                localSettings={localSettings} 
                handleLocalUpdate={handleLocalUpdate} 
                onSelectPath={handleSelectCustomPath} 
                onTriggerReset={setResetType} 
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

      <Dialog open={pendingMigrations !== null} onOpenChange={(open) => {
        if (!open) setPendingMigrations(null);
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>检测到目录变更</DialogTitle>
            <DialogDescription>
              你修改了以下存储目录。是否需要将原目录下的现有数据迁移到新目录？<br/>
              如果不迁移，原目录的数据将保留在原地。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto space-y-3 py-4">
            {pendingMigrations?.map((m) => (
              <div key={m.key} className="bg-muted/50 p-3 rounded-md text-sm">
                <p className="font-medium text-foreground mb-1">{m.label}</p>
                <div className="flex items-center gap-2 text-muted-foreground text-xs break-all">
                  <span className="line-through opacity-70">{m.oldPath}</span>
                  <ArrowRight className="w-3 h-3 flex-shrink-0" />
                  <span className="text-primary font-medium">{m.newPath}</span>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => executeSave(false)}>
              仅保存设置，不迁移数据
            </Button>
            <Button onClick={() => executeSave(true)}>
              迁移数据并保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
