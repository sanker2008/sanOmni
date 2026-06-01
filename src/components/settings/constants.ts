export const DEFAULT_SETTINGS: Record<string, any> = {
  // 通用设置
  namingTemplate: "{vendor}-{model}-{date}-{index}",
  customInboxPath: "",  // 自定义待整理路径（留空使用默认）
  customArchivedPath: "",  // 自定义 archived 路径（留空使用默认）
  labsCustomRootPath: "", // sanLabs 实验室工具自定义根目录
  canvasUndoMaxCount: 50,  // 产品图画布最大撤回次数
  showFullImage: false,  // 列表中是否显示完整图片（不裁剪）
  lightThemeColor: "#2563eb",
  darkThemeColor: "#60a5fa",

  // AI P图 设置
  aiImageEditorProvider: "mock",          // 当前选择的供应商 id
  aiImageEditorProviderConfig: {},        // 供应商特定参数 (动态 key-value)
  aiImageEditorOutputPath: "",            // 自定义输出目录

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
  showIpWorksTab: true,
};

export type SettingsTab = "general" | "prompt" | "ip" | "labs" | "shortcuts" | "trash" | "about";

export const SETTINGS_TABS: { key: SettingsTab; label: string }[] = [
  { key: "general", label: "通用设置" },
  { key: "prompt", label: "sanPrompt" },
  { key: "ip", label: "sanIP" },
  { key: "labs", label: "sanLabs" },
  { key: "shortcuts", label: "快捷键" },
  { key: "trash", label: "回收站" },
  { key: "about", label: "关于" },
];
