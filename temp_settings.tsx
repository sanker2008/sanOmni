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

// 榛樿璁剧疆
const DEFAULT_SETTINGS: Record<string, any> = {
  // 閫氱敤璁剧疆
  namingTemplate: "{vendor}-{model}-{date}-{index}",
  customInboxPath: "",  // 鑷畾涔夊緟鏁寸悊璺緞锛堢暀绌轰娇鐢ㄩ粯璁わ級
  customArchivedPath: "",  // 鑷畾涔?archived 璺緞锛堢暀绌轰娇鐢ㄩ粯璁わ級
  showFullImage: false,  // 鍒楄〃涓槸鍚︽樉绀哄畬鏁村浘鐗囷紙涓嶈鍓級
  lightThemeColor: "#2563eb",
  darkThemeColor: "#60a5fa",



  // 鐩戞帶璁剧疆
  watchFolders: [],
  watchExtensions: "png,jpg,jpeg,webp,gif",
  watchDebounceMs: 1000,

  // IP 涓撳睘璁剧疆
  ipNamingTemplate: "{ip}-{date}-{index}",
  ipCustomInboxPath: "",
  ipCustomArchivedPath: "",
  ipWatchFolders: [],
  ipWatchExtensions: "png,jpg,jpeg,webp,gif",
};

// 蹇嵎閿垪琛紙鍙锛?const SHORTCUTS = [
  { key: "Ctrl + N", description: "瀵煎叆鏂板浘鐗? },
  { key: "Ctrl + A", description: "鍏ㄩ€夊浘鐗? },
  { key: "Delete", description: "鍒犻櫎閫変腑鍥剧墖" },
  { key: "Ctrl + E", description: "蹇€熺紪杈? },
  { key: "Ctrl + S", description: "褰掓。閫変腑鍥剧墖" },
  { key: "Ctrl + F", description: "鑱氱劍鎼滅储妗? },
  { key: "Escape", description: "鍙栨秷閫夋嫨 / 鍏抽棴寮圭獥" },
  { key: "Ctrl + 1", description: "鍒囨崲鍒板緟鏁寸悊" },
  { key: "Ctrl + 2", description: "鍒囨崲鍒板凡褰掓。" },
  { key: "Ctrl + ,", description: "鎵撳紑璁剧疆" },
];

type SettingsTab = "general" | "prompt" | "ip" | "shortcuts" | "trash";

const SETTINGS_TABS: { key: SettingsTab; label: string }[] = [
  { key: "general", label: "閫氱敤璁剧疆" },
  { key: "prompt", label: "Prompt 妯℃澘绠＄悊" },
  { key: "ip", label: "IP 璧勪骇绠＄悊" },
  { key: "shortcuts", label: "蹇嵎閿? },
  { key: "trash", label: "鍥炴敹绔? },
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

  // 鎵弿鐘舵€?  const [isScanning, setIsScanning] = useState(false);
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
          step1Title: "纭閲嶇疆閫氱敤鏁版嵁",
          step1Desc: "纭畾瑕侀噸缃€氱敤鏁版嵁鍚楋紵杩欏皢娓呴櫎鎵€鏈変富棰樿壊銆佸竷灞€鍋忓ソ绛夊熀纭€璁剧疆銆傛敞鎰忥細鎮ㄧ殑 Prompt 妯℃澘鍜?IP 璧勪骇鏁版嵁灏嗕繚鎸佸師鏍凤紝涓嶅彈浠讳綍褰卞搷锛?,
          step2Title: "鈿狅笍 閫氱敤璁剧疆鏈€缁堢‘璁?,
          step2Desc: "銆愯鍛娿€戦噸缃€氱敤鏁版嵁鏄笉鍙€嗙殑锛佹墍鏈夐€氱敤绯荤粺璁剧疆鍜岀晫闈㈡樉绀洪閫夐」閮藉皢琚仮澶嶄负榛樿鍊笺€傛偍鐪熺殑纭畾瑕侀噸缃悧锛?,
          confirmText: "纭閲嶇疆",
          action: async () => {
            await settingsApi.resetGeneralSettings();
            toast({
              title: "鉁?閫氱敤璁剧疆宸查噸缃?,
              description: "閫氱敤璁剧疆宸叉仮澶嶉粯璁わ紝搴旂敤灏嗛噸鏂板姞杞?,
            });
            setTimeout(() => window.location.reload(), 1000);
          }
        };
      case 'prompt_data':
        return {
          step1Title: "纭閲嶇疆 Prompt 妯℃澘鏁版嵁",
          step1Desc: "纭畾瑕侀噸缃?Prompt 妯℃澘鏁版嵁鍚楋紵杩欏皢娓呯┖鏁版嵁搴撲腑鐨勬墍鏈?Prompt 妯℃澘璁板綍銆佸浘鐗囧叧鑱斿拰鍒嗙被銆傛敞鎰忥細鍥剧墖鏂囦欢鏈韩涓嶄細琚垹闄わ紒",
          step2Title: "鈿狅笍 Prompt 璁板綍鏈€缁堢‘璁?,
          step2Desc: "銆愯鍛娿€戞鎿嶄綔灏嗘竻闄ゆ墍鏈?Prompt 妯℃澘鐨勬暟鎹簱璁板綍锛屼笖涓嶅彲鎭㈠锛佹偍鐪熺殑纭畾瑕侀噸缃悧锛?,
          confirmText: "纭閲嶇疆璁板綍",
          action: async () => {
            await settingsApi.resetPromptData(false);
            toast({
              title: "鉁?Prompt 鏁版嵁搴撹褰曞凡閲嶇疆",
              description: "Prompt 妯℃澘鏁版嵁宸查噸缃紝搴旂敤灏嗛噸鏂板姞杞?,
            });
            setTimeout(() => window.location.reload(), 1000);
          }
        };
      case 'prompt_all':
        return {
          step1Title: "鈿狅笍 纭閲嶇疆鏁版嵁骞跺垹闄?Prompt 鏂囦欢",
          step1Desc: "纭畾瑕侀噸缃?Prompt 鏁版嵁骞躲€愬垹闄ゆ墍鏈夊叧鑱斿浘鐗囨枃浠躲€戝悧锛熻繖灏嗘竻绌?Prompt 妯℃澘鏁版嵁搴撹褰曪紝骞朵笖銆愭案涔呭垹闄ゃ€戝緟澶勭悊(inbox)鍜屽綊妗?archived)鐩綍涓嬬殑鎵€鏈夊浘鐗囨枃浠讹紒",
          step2Title: "馃毃 Prompt 鏂囦欢姘镐箙鍒犻櫎璀﹀憡",
          step2Desc: "銆愭瀬鍏朵弗閲嶈鍛娿€戞墍鏈夊緟澶勭悊(inbox)鍜屽綊妗?archived)鐩綍涓嬬殑鍥剧墖鏂囦欢閮藉皢琚交搴曞垹闄わ紝鏃犳硶鎭㈠锛佽纭繚鎮ㄥ凡鍋氬ソ澶囦唤銆傜‘瀹氳姘镐箙鍒犻櫎鏂囦欢骞堕噸缃悧锛?,
          confirmText: "姘镐箙鍒犻櫎骞堕噸缃?,
          action: async () => {
            await settingsApi.resetPromptData(true);
            toast({
              title: "鉁?Prompt 鏁版嵁鍙婃枃浠跺凡褰诲簳鍒犻櫎",
              description: "鐩稿叧鏂囦欢涓庤褰曞凡娓呯悊锛屽簲鐢ㄥ皢閲嶆柊鍔犺浇",
            });
            setTimeout(() => window.location.reload(), 1000);
          }
        };
      case 'ip_data':
        return {
          step1Title: "纭閲嶇疆 IP 璧勪骇鏁版嵁",
          step1Desc: "纭畾瑕侀噸缃?IP 璧勪骇鏁版嵁鍚楋紵杩欏皢娓呯┖鏁版嵁搴撲腑鐨勬墍鏈?IP 褰㈣薄璁板綍銆佽祫浜у叧鑱斻€佽〃鎯呭寘鍜岃创绾革紙绯荤粺榛樿鐨勬湭鐭ュ舰璞?'unknown' 灏嗕簣浠ヤ繚鐣欙級銆傛敞鎰忥細鎮ㄧ殑鍥剧墖鏂囦欢鏈韩涓嶄細琚垹闄わ紒",
          step2Title: "鈿狅笍 IP 璧勪骇璁板綍鏈€缁堢‘璁?,
          step2Desc: "銆愯鍛娿€戞鎿嶄綔灏嗘竻闄ゆ墍鏈?IP 褰㈣薄鍙婂叧鑱旂殑鏁版嵁搴撹褰曪紙闄?'unknown' 澶栵級锛屼笖涓嶅彲鎭㈠锛佹偍鐪熺殑纭畾瑕侀噸缃悧锛?,
          confirmText: "纭閲嶇疆璁板綍",
          action: async () => {
            await settingsApi.resetIpData(false);
            toast({
              title: "鉁?IP 璧勪骇鏁版嵁搴撹褰曞凡閲嶇疆",
              description: "IP 璧勪骇鏁版嵁宸查噸缃紝搴旂敤灏嗛噸鏂板姞杞?,
            });
            setTimeout(() => window.location.reload(), 1000);
          }
        };
      case 'ip_all':
        return {
          step1Title: "鈿狅笍 纭閲嶇疆鏁版嵁骞跺垹闄?IP 鏂囦欢",
          step1Desc: "纭畾瑕侀噸缃?IP 璧勪骇鏁版嵁骞躲€愬垹闄ゆ墍鏈夊叧鑱斿浘鐗囨枃浠躲€戝悧锛熻繖灏嗘竻绌烘墍鏈?IP 璧勪骇鏁版嵁搴撹褰曪紙淇濈暀榛樿 'unknown'锛夛紝骞朵笖銆愭案涔呭垹闄ゃ€慖P寰呭鐞?ip_inbox)鍜孖P褰掓。(ip_archived)鐩綍涓嬬殑鎵€鏈夊浘鐗囨枃浠讹紒",
          step2Title: "馃毃 IP 鏂囦欢姘镐箙鍒犻櫎璀﹀憡",
          step2Desc: "銆愭瀬鍏朵弗閲嶈鍛娿€戞墍鏈?IP 寰呭鐞?ip_inbox)鍜屽綊妗?ip_archived)鐩綍涓嬬殑鍥剧墖鏂囦欢閮藉皢琚交搴曞垹闄わ紝鏃犳硶鎭㈠锛佽纭繚鎮ㄥ凡澶囦唤銆傜‘瀹氳姘镐箙鍒犻櫎鎵€鏈?IP 璧勪骇鏂囦欢骞堕噸缃悧锛?,
          confirmText: "姘镐箙鍒犻櫎骞堕噸缃?,
          action: async () => {
            await settingsApi.resetIpData(true);
            toast({
              title: "鉁?IP 璧勪骇鏁版嵁鍙婃枃浠跺凡褰诲簳鍒犻櫎",
              description: "鐩稿叧 IP 鏂囦欢涓庤褰曞凡娓呯悊锛屽簲鐢ㄥ皢閲嶆柊鍔犺浇",
            });
            setTimeout(() => window.location.reload(), 1000);
          }
        };
      default:
        return null;
    }
  })();

  // Tab 鍒囨崲鏃舵竻绌烘壂鎻忕粨鏋?  useEffect(() => {
    setScanResult(null);
    setInboxCleanupResult(null);
  }, [activeSettingsTab]);

  // 鍒濆鍖栨湰鍦拌缃?  useEffect(() => {
    if (settingsOpen) {
      setLocalSettings({ ...DEFAULT_SETTINGS, ...settings });
      setHasChanges(false);
      
      // 鍔犺浇娲昏穬鐨勭洃鎺у櫒
      loadActiveWatchers();
    }
  }, [settingsOpen, settings]);

  // 鍔犺浇娲昏穬鐨勭洃鎺у櫒
  const loadActiveWatchers = async () => {
    try {
      const { watcherApi } = await import("@/services/tauri");
      const watchers = await watcherApi.getActive();
      setActiveWatchers(watchers);
    } catch (error) {
      console.error("Failed to load active watchers:", error);
    }
  };

  // 妫€娴嬪彉鏇?  useEffect(() => {
    const hasDiff = JSON.stringify(localSettings) !== JSON.stringify({ ...DEFAULT_SETTINGS, ...settings });
    setHasChanges(hasDiff);
  }, [localSettings, settings]);

  // 鏇存柊鏈湴璁剧疆
  const handleLocalUpdate = useCallback((key: string, value: any) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  // 淇濆瓨璁剧疆
  const handleSave = useCallback(() => {
    Object.entries(localSettings).forEach(([key, value]) => {
      updateSetting(key, value);
    });
    setHasChanges(false);
    closeSettings();
  }, [closeSettings, localSettings, updateSetting]);

  // 娣诲姞鐩戞帶鏂囦欢澶?  const handleAddWatchFolder = useCallback(() => {
    if (newWatchFolder.trim()) {
      const folders = [...(localSettings.watchFolders || []), newWatchFolder.trim()];
      handleLocalUpdate("watchFolders", folders);
      setNewWatchFolder("");
    }
  }, [newWatchFolder, localSettings.watchFolders, handleLocalUpdate]);

  // 閫氳繃瀵硅瘽妗嗛€夋嫨鏂囦欢澶?  const handleSelectWatchFolder = useCallback(async () => {
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

  // 閫夋嫨鑷畾涔夎矾寰?  const handleSelectCustomPath = useCallback(async (settingKey: string) => {
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

  // 绉婚櫎鐩戞帶鏂囦欢澶?  const handleRemoveWatchFolder = useCallback(
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
      {/* 閬僵灞?*/}
      <div className="absolute inset-0 bg-black/50" onClick={closeSettings} />

      {/* 璁剧疆闈㈡澘 */}
      <div className="relative z-10 w-full max-w-3xl max-h-[85vh] bg-card rounded-lg border shadow-lg flex flex-col overflow-hidden">
        {/* 澶撮儴 */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">璁剧疆</h2>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Button size="sm" onClick={handleSave}>
                淇濆瓨鏇存敼
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={closeSettings}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* 鏍囩鏍?*/}
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

        {/* 鍐呭鍖哄煙 */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 閫氱敤璁剧疆 */}
          {activeSettingsTab === "general" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">涓婚鑹?/CardTitle>
                  <CardDescription>
                    鍒嗗埆璁剧疆鏅€氭ā寮忓拰鏆楅粦妯″紡涓嬬殑涓昏壊锛屼繚瀛樺悗浼氬簲鐢ㄥ埌鎸夐挳銆侀€変腑鎬佸拰寮鸿皟鑹层€?                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">鏅€氭ā寮忎富棰樿壊</p>
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
                      <p className="text-sm font-medium">鏆楅粦妯″紡涓婚鑹?/p>
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
                    鏀寔 `#RRGGBB` 鏍煎紡锛屼緥濡?`#2563eb`銆?                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">鍥剧墖鏄剧ず妯″紡</CardTitle>
                  <CardDescription>
                    鎺у埗缃戞牸鍒楄〃涓浘鐗囩殑鏄剧ず鏂瑰紡
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">鏄剧ず瀹屾暣鍥剧墖</p>
                      <p className="text-xs text-muted-foreground">
                        寮€鍚悗鍥剧墖涓嶄細琚鍓紝灏嗗畬鏁存樉绀哄湪鍗＄墖涓紱鍏抽棴鍒欎互姝ｆ柟褰㈣鍓～鍏?                      </p>
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
                    閲嶇疆閫氱敤鏁版嵁
                  </CardTitle>
                  <CardDescription>
                    閲嶇疆鎵€鏈夌郴缁熻缃弬鏁帮紝浣嗕笉浼氬奖鍝?IP 璧勪骇鎴?Prompt 妯℃澘鏁版嵁銆傛鎿嶄綔涓嶅彲鎭㈠锛?                  </CardDescription>
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
                    閲嶇疆閫氱敤鏁版嵁
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          
          {/* Prompt 妯℃澘鐩稿叧 */}
          {activeSettingsTab === "prompt" && (
            <div className="space-y-6">
              <div className="text-lg font-semibold mb-4 border-b pb-2">褰掓。涓庤矾寰勯厤缃?/div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">鍥剧墖褰掓。鍛藉悕妯℃澘</CardTitle>
                  <CardDescription className="space-y-1.5 mt-1.5">
                    <div>閰嶇疆褰掓。鍥剧墖搴擄紙寰呮暣鐞?宸插綊妗ｏ級鏃剁殑鏂囦欢鍚嶅懡鍚嶈鍒欍€?/div>
                    <div className="flex flex-col gap-1.5 mt-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-primary font-semibold">{"{vendor}"}</code>
                        <span>澶фā鍨嬪巶鍟嗘爣璇嗭紙渚嬪锛?span className="font-mono text-slate-500">openai</span>锛屽嵆鍘傚晢鐨勫皬鍐欒嫳鏂囨爣璇嗗悕锛岄潪涓枃鏄剧ず鍚嶇О锛?/span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-primary font-semibold">{"{model}"}</code>
                        <span>鐢熸垚妯″瀷鏍囪瘑锛堜緥濡傦細<span className="font-mono text-slate-500">gpt-4</span>锛屽嵆妯″瀷鐨勫皬鍐欒嫳鏂?鏁板瓧缂╁啓鏍囪瘑锛岄潪鏄剧ず鍚嶇О锛?/span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-primary font-semibold">{"{date}"}</code>
                        <span>褰掓。褰撳ぉ鏃ユ湡锛堟牸寮忎负锛?span className="font-mono text-slate-500">YYYY-MM-DD</span>锛屼緥濡?<span className="font-mono text-slate-500">2026-05-27</span>锛?/span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-primary font-semibold">{"{index}"}</code>
                        <span>褰撳ぉ鑷鎺掑簭鍙凤紙鏍煎紡涓猴細<span className="font-mono text-slate-500">001</span>, <span className="font-mono text-slate-500">002</span> ...锛?/span>
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
                        瀹炴椂棰勮锛堜互鍘傚晢 <span className="font-mono font-medium text-slate-800 dark:text-slate-200 bg-muted px-1.5 py-0.5 rounded">openai</span> 鍜屾ā鍨?<span className="font-mono font-medium text-slate-800 dark:text-slate-200 bg-muted px-1.5 py-0.5 rounded">gpt-4</span> 涓轰緥锛夛細<span className="font-mono font-semibold text-primary">{previewName}.png</span>
                      </p>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">鑷畾涔夊緟鏁寸悊璺緞</CardTitle>
                  <CardDescription>
                    瀵煎叆鍥剧墖鏃剁殑涓存椂瀛樺偍浣嶇疆銆傜暀绌哄垯浣跨敤榛樿浣嶇疆锛圓ppData锛?                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      value={localSettings.customInboxPath || ""}
                      onChange={(e) =>
                        handleLocalUpdate("customInboxPath", e.target.value)
                      }
                      placeholder="鐣欑┖浣跨敤榛樿浣嶇疆"
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
                      榛樿锛?APPDATA%\com.sanomni.app\inbox
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">鑷畾涔夊綊妗ｈ矾寰?/CardTitle>
                  <CardDescription>
                    鍥剧墖褰掓。鏃剁殑淇濆瓨鐩綍銆傜暀绌哄垯浣跨敤榛樿浣嶇疆锛圓ppData锛?                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      value={localSettings.customArchivedPath || ""}
                      onChange={(e) =>
                        handleLocalUpdate("customArchivedPath", e.target.value)
                      }
                      placeholder="鐣欑┖浣跨敤榛樿浣嶇疆"
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
                      榛樿锛?APPDATA%\com.sanomni.app\archived
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ScanLine className="w-4 h-4" />
                    鎵弿寰呮暣鐞嗙洰褰?                  </CardTitle>
                  <CardDescription>
                    鎵弿寰呮暣鐞嗙洰褰曞綋鍓嶅疄闄呭瓨鍦ㄧ殑鍥剧墖鏂囦欢锛屾竻鐞嗘暟鎹簱涓凡缁忚浣犳墜鍔ㄥ垹闄ょ殑寰呮暣鐞嗚褰曘€?                    閫傜敤浜庝綘鍦ㄦ枃浠跺す閲岀洿鎺ュ垹鎺夊浘鐗囧悗锛屽悓姝ュ緟鏁寸悊鍒楄〃銆?                  </CardDescription>
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
                          title: "鉁?鎵弿澶辫触",
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
                        鎵弿涓?..
                      </>
                    ) : (
                      <>
                        <ScanLine className="w-4 h-4 mr-2" />
                        寮€濮嬫壂鎻?                      </>
                    )}
                  </Button>

                  {inboxCleanupResult && (
                    <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-sm">
                      <p className="font-medium">鎵弿瀹屾垚</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                        <span>妫€鏌ヨ褰曟暟</span>
                        <span className="text-foreground font-medium">{inboxCleanupResult.scanned_count}</span>
                        <span>淇濈暀璁板綍</span>
                        <span>{inboxCleanupResult.kept_count}</span>
                        <span>娓呯悊璁板綍</span>
                        <span className="text-green-600 font-medium">{inboxCleanupResult.removed_count}</span>
                        <span>澶辫触</span>
                        <span className={inboxCleanupResult.failed_count > 0 ? "text-destructive font-medium" : ""}>
                          {inboxCleanupResult.failed_count}
                        </span>
                      </div>
                      {inboxCleanupResult.errors.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs font-medium text-destructive">閿欒璇︽儏锛?/p>
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
                    鎵弿褰掓。鐩綍
                  </CardTitle>
                  <CardDescription>
                    鎵弿褰掓。鐩綍涓嬬殑鍥剧墖鏂囦欢锛屽皢鏈叆搴撶殑鍥剧墖鎸夊懡鍚嶆ā鏉块噸鍛藉悕鍚庣洿鎺ュ啓鍏ュ綊妗ｆ暟鎹簱銆?                    閫傜敤浜庝粠澶栭儴澶嶅埗鍥剧墖鍒板綊妗ｇ洰褰曞悗鐨勬壒閲忓鍏ャ€?                  </CardDescription>
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
                        // 浣跨敤鑷畾涔夎矾寰勬垨榛樿璺緞
                        let libraryPath: string;
                        const customPath = localSettings.customArchivedPath;
                        
                        if (customPath) {
                          libraryPath = customPath;
                        } else {
                          // 浣跨敤榛樿璺緞
                          const { appDataDir } = await import("@tauri-apps/api/path");
                          libraryPath = await appDataDir();
                        }
                        
                        const result = await scannerApi.scanArchived(
                          libraryPath,
                          localSettings.namingTemplate
                        );
                        setScanResult(result);
                        // 鍒锋柊宸插綊妗ｅ浘鐗囧垪琛?                        if (result.imported_count > 0) {
                          const { imageApi } = await import("@/services/tauri");
                          const archived = await imageApi.getArchivedImages();
                          setArchivedImages(archived);
                        }
                      } catch (error) {
                        toast({
                          title: "鉁?鎵弿澶辫触",
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
                        鎵弿涓?..
                      </>
                    ) : (
                      <>
                        <ScanLine className="w-4 h-4 mr-2" />
                        寮€濮嬫壂鎻?                      </>
                    )}
                  </Button>

                  {scanResult && (
                    <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-sm">
                      <p className="font-medium">鎵弿瀹屾垚</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                        <span>鎵弿鏂囦欢鏁?/span>
                        <span className="text-foreground font-medium">{scanResult.scanned_count}</span>
                        <span>鏂板鍏ュ簱</span>
                        <span className="text-green-600 font-medium">{scanResult.imported_count}</span>
                        <span>宸查噸鍛藉悕</span>
                        <span className="text-blue-600 font-medium">{scanResult.renamed_count}</span>
                        <span>宸茶烦杩囷紙宸插叆搴擄級</span>
                        <span>{scanResult.skipped_count}</span>
                        <span>澶辫触</span>
                        <span className={scanResult.failed_count > 0 ? "text-destructive font-medium" : ""}>
                          {scanResult.failed_count}
                        </span>
                      </div>
                      {scanResult.errors.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs font-medium text-destructive">閿欒璇︽儏锛?/p>
                          {scanResult.errors.map((err, i) => (
                            <p key={i} className="text-xs text-destructive/80 break-all">{err}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              
{/* 鐩戞帶璁剧疆 */}
              <div className="text-lg font-semibold mt-8 mb-4 border-b pb-2">鏂囦欢澶圭洃鎺т笌鑷姩鍒嗙被</div>
              {/* 娲昏穬鐨勭洃鎺у櫒 */}
              {activeWatchers.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">娲昏穬鐨勭洃鎺у櫒</CardTitle>
                    <CardDescription>
                      褰撳墠姝ｅ湪杩愯鐨勬枃浠跺す鐩戞帶
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
                          <Badge variant="outline" className="text-xs">杩愯涓?/Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">鐩戞帶鏂囦欢澶?/CardTitle>
                  <CardDescription>
                    娣诲姞闇€瑕佽嚜鍔ㄧ洃鎺х殑鏂囦欢澶硅矾寰勶紝鏂板浘鐗囦細鑷姩瀵煎叆鍒板緟鏁寸悊
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(localSettings.watchFolders || []).length === 0 && (
                      <p className="text-sm text-muted-foreground py-2">
                        鏆傛湭娣诲姞鐩戞帶鏂囦欢澶?                      </p>
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
                        placeholder="杈撳叆鏂囦欢澶硅矾寰?.."
                        className="flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddWatchFolder();
                        }}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleSelectWatchFolder}
                        title="娴忚鏂囦欢澶?
                      >
                        <FolderOpen className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleAddWatchFolder}
                        title="娣诲姞"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">鏂囦欢鎵╁睍鍚嶈繃婊?/CardTitle>
                  <CardDescription>
                    鍙洃鎺ф寚瀹氭墿灞曞悕鐨勬枃浠讹紝澶氫釜鎵╁睍鍚嶇敤閫楀彿鍒嗛殧
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
                  <CardTitle className="text-base">闃叉姈鏃堕棿</CardTitle>
                  <CardDescription>
                    鏂囦欢鍙樻洿鍚庣瓑寰呭涔呭啀瑙﹀彂澶勭悊锛岄伩鍏嶉噸澶嶈Е鍙戯紙姣锛?                  </CardDescription>
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
                    閲嶇疆 Prompt 妯℃澘鏁版嵁
                  </CardTitle>
                  <CardDescription>
                    绠＄悊涓庢竻闄?Prompt 妯℃澘鏁版嵁搴撹褰曞強瀵瑰簲鏂囦欢銆傛鎿嶄綔涓嶅彲鎭㈠锛?                  </CardDescription>
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
                    閲嶇疆鏁版嵁搴撹褰?                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => {
                      setResetType('prompt_all');
                      setResetStep(1);
                    }}
                  >
                    閲嶇疆鏁版嵁骞跺垹闄ゆ枃浠?                  </Button>
                </CardContent>
              </Card>
                      
            </div>
          )}

          {/* IP 璧勪骇绠＄悊鐩稿叧 */}
          {activeSettingsTab === "ip" && (
            <div className="space-y-6">
              <div className="text-lg font-semibold mb-4 border-b pb-2">褰掓。涓庤矾寰勯厤缃?/div>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">IP 褰掓。鍛藉悕妯℃澘</CardTitle>
                  <CardDescription className="space-y-1.5 mt-1.5">
                    <div>閰嶇疆褰掓。 IP 璧勪骇鍥剧墖鏃剁殑鏂囦欢鍚嶅懡鍚嶈鍒欍€?/div>
                    <div className="flex flex-col gap-1.5 mt-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-primary font-semibold">{"{ip}"}</code>
                        <span>IP 璺緞鏍囪瘑锛堜緥濡傦細<span className="font-mono text-slate-500">sanker</span>锛屽嵆淇濆瓨鐨勫皬鍐欍€佹棤绌烘牸/鐗规畩绗﹀彿鐨勬爣璇嗙锛岄潪涓枃鏄剧ず鍚嶇О锛?/span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-primary font-semibold">{"{date}"}</code>
                        <span>褰掓。褰撳ぉ鏃ユ湡锛堟牸寮忎负锛?span className="font-mono text-slate-500">YYYY-MM-DD</span>锛屼緥濡?<span className="font-mono text-slate-500">2026-05-27</span>锛?/span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-primary font-semibold">{"{index}"}</code>
                        <span>褰撳ぉ鑷鎺掑簭鍙凤紙鏍煎紡涓猴細<span className="font-mono text-slate-500">001</span>, <span className="font-mono text-slate-500">002</span> ...锛?/span>
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
                        瀹炴椂棰勮锛堜互璺緞鏍囪瘑 <span className="font-mono font-medium text-slate-800 dark:text-slate-200 bg-muted px-1.5 py-0.5 rounded">sanker</span> 涓轰緥锛夛細<span className="font-mono font-semibold text-primary">{previewName}.png</span>
                      </p>
                    );
                  })()}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">鑷畾涔?IP 寰呮暣鐞嗚矾寰?/CardTitle>
                  <CardDescription>
                    瀵煎叆 IP 鍥剧墖鏃剁殑涓存椂瀛樺偍浣嶇疆銆傜暀绌哄垯浣跨敤榛樿浣嶇疆锛圓ppData/ip_inbox锛?                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      value={localSettings.ipCustomInboxPath || ""}
                      onChange={(e) =>
                        handleLocalUpdate("ipCustomInboxPath", e.target.value)
                      }
                      placeholder="鐣欑┖浣跨敤榛樿浣嶇疆"
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
                      榛樿锛?APPDATA%\com.sanomni.app\ip_inbox
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">鑷畾涔?IP 褰掓。璺緞</CardTitle>
                  <CardDescription>
                    IP 鍥剧墖褰掓。鐨勬牴鐩綍銆傜暀绌哄垯浣跨敤榛樿浣嶇疆锛圓ppData/ip_archived锛?                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      value={localSettings.ipCustomArchivedPath || ""}
                      onChange={(e) =>
                        handleLocalUpdate("ipCustomArchivedPath", e.target.value)
                      }
                      placeholder="鐣欑┖浣跨敤榛樿浣嶇疆"
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
                      榛樿锛?APPDATA%\com.sanomni.app\ip_archived
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="text-lg font-semibold mt-8 mb-4 border-b pb-2">鑷姩鍖栧鐞?/div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ScanLine className="w-4 h-4" />
                    鎵弿 IP 寰呮暣鐞嗙洰褰?                  </CardTitle>
                  <CardDescription>
                    鎵弿 IP 寰呮暣鐞嗙洰褰曞綋鍓嶅疄闄呭瓨鍦ㄧ殑鍥剧墖鏂囦欢锛屾竻鐞嗘暟鎹簱涓凡缁忚浣犳墜鍔ㄥ垹闄ょ殑寰呮暣鐞嗚褰曘€?                  </CardDescription>
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
                          title: "鉁?鎵弿澶辫触",
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
                        鎵弿涓?..
                      </>
                    ) : (
                      <>
                        <ScanLine className="w-4 h-4 mr-2" />
                        寮€濮嬫壂鎻?                      </>
                    )}
                  </Button>

                  {inboxCleanupResult && (
                    <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-sm">
                      <p className="font-medium">鎵弿瀹屾垚</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                        <span>妫€鏌ヨ褰曟暟</span>
                        <span className="text-foreground font-medium">{inboxCleanupResult.scanned_count}</span>
                        <span>淇濈暀璁板綍</span>
                        <span>{inboxCleanupResult.kept_count}</span>
                        <span>娓呯悊璁板綍</span>
                        <span className="text-green-600 font-medium">{inboxCleanupResult.removed_count}</span>
                        <span>澶辫触</span>
                        <span className={inboxCleanupResult.failed_count > 0 ? "text-destructive font-medium" : ""}>
                          {inboxCleanupResult.failed_count}
                        </span>
                      </div>
                      {inboxCleanupResult.errors.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs font-medium text-destructive">閿欒璇︽儏锛?/p>
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
                    鎵弿 IP 褰掓。鐩綍
                  </CardTitle>
                  <CardDescription>
                    鎵弿 IP 褰掓。鐩綍涓嬬殑鍥剧墖鏂囦欢锛屽皢鏈叆搴撶殑鍥剧墖鎸夊懡鍚嶆ā鏉块噸鍛藉悕鍚庣洿鎺ュ啓鍏ュ綊妗ｆ暟鎹簱銆?                  </CardDescription>
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
                          title: "鉁?鎵弿澶辫触",
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
                        鎵弿涓?..
                      </>
                    ) : (
                      <>
                        <ScanLine className="w-4 h-4 mr-2" />
                        寮€濮嬫壂鎻?                      </>
                    )}
                  </Button>

                  {scanResult && (
                    <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-sm">
                      <p className="font-medium">鎵弿瀹屾垚</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                        <span>鎵弿鏂囦欢鏁?/span>
                        <span className="text-foreground font-medium">{scanResult.scanned_count}</span>
                        <span>鏂板鍏ュ簱</span>
                        <span className="text-green-600 font-medium">{scanResult.imported_count}</span>
                        <span>宸查噸鍛藉悕</span>
                        <span className="text-blue-600 font-medium">{scanResult.renamed_count}</span>
                        <span>宸茶烦杩囷紙宸插叆搴擄級</span>
                        <span>{scanResult.skipped_count}</span>
                        <span>澶辫触</span>
                        <span className={scanResult.failed_count > 0 ? "text-destructive font-medium" : ""}>
                          {scanResult.failed_count}
                        </span>
                      </div>
                      {scanResult.errors.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs font-medium text-destructive">閿欒璇︽儏锛?/p>
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
                  <CardTitle className="text-base">IP 鏂囦欢澶圭洃鎺?/CardTitle>
                  <CardDescription>
                    娣诲姞闇€瑕佺洃鎺х殑鏂囦欢澶癸紝褰撴湁鏂板浘鐗囨椂鑷姩瀵煎叆鍒?IP 寰呮暣鐞嗗尯銆?                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="绮樿创鏂囦欢澶硅矾寰勶紝鎴栫偣鍑诲彸渚ч€夋嫨..."
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
                      娴忚
                    </Button>
                    <Button onClick={() => {
                        if (newWatchFolder.trim()) {
                          const folders = [...(localSettings.ipWatchFolders || []), newWatchFolder.trim()];
                          handleLocalUpdate("ipWatchFolders", folders);
                          setNewWatchFolder("");
                        }
                    }}>
                      <Plus className="w-4 h-4 mr-2" />
                      娣诲姞
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
                                鐩戞帶涓?                              </Badge>
                            ) : (
                              <Badge variant="outline" className="ml-2 shrink-0">
                                鏈縺娲?                              </Badge>
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
                        灏氭湭娣诲姞鐩戞帶鏂囦欢澶?                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-destructive/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-4 h-4" />
                    閲嶇疆 IP 璧勪骇鏁版嵁
                  </CardTitle>
                  <CardDescription>
                    绠＄悊涓庢竻闄?IP 璧勪骇鏁版嵁搴撹褰曪紙绯荤粺榛樿鏈煡褰㈣薄 'unknown' 灏嗕繚鐣欙級鍙婂搴旀枃浠躲€傛鎿嶄綔涓嶅彲鎭㈠锛?                  </CardDescription>
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
                    閲嶇疆鏁版嵁搴撹褰?                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => {
                      setResetType('ip_all');
                      setResetStep(1);
                    }}
                  >
                    閲嶇疆鏁版嵁骞跺垹闄ゆ枃浠?                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
{/* 蹇嵎閿?*/}
          {activeSettingsTab === "shortcuts" && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">蹇嵎閿垪琛?/CardTitle>
                  <CardDescription>褰撳墠搴旂敤鏀寔鐨勬墍鏈夊揩鎹烽敭</CardDescription>
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

          {/* 鍥炴敹绔?*/}
          {activeSettingsTab === "trash" && (
            <div className="space-y-6">
              <TrashView />
            </div>
          )}
        </div>

        {/* 搴曢儴 */}
        <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30">
          <p className="text-xs text-muted-foreground">
            璁剧疆鑷姩淇濆瓨鍒版湰鍦板瓨鍌?          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={closeSettings}>
              鍏抽棴
            </Button>
            {hasChanges && (
              <Button size="sm" onClick={handleSave}>
                淇濆瓨鏇存敼
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Unified Reset Confirmation - Step 1 */}
    <ConfirmDialog
      open={resetStep === 1 && resetContent !== null}
      title={resetContent?.step1Title || "纭閲嶇疆"}
      description={resetContent?.step1Desc || ""}
      confirmText="缁х画"
      cancelText="鍙栨秷"
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
      title={resetContent?.step2Title || "鏈€缁堢‘璁?}
      description={resetContent?.step2Desc || ""}
      confirmText={resetContent?.confirmText || "纭"}
      cancelText="鍙栨秷"
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
              title: "鉁?鎿嶄綔澶辫触",
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
