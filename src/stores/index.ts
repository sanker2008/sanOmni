import { create } from "zustand";

// Types
export interface Image {
  id: string;
  filename: string;
  original_filename: string;
  storage_vendor_id: string;
  storage_model_id: string;
  relative_path: string;
  absolute_path: string;
  primary_model_id: string;
  status: "inbox" | "tagged" | "archived";
  prompt?: string;
  negative_prompt?: string;
  file_size?: number;
  width?: number;
  height?: number;
  file_hash?: string;
  format?: string;
  has_watermark: boolean;
  watermark_platform?: string;
  watermark_detected: boolean;
  watermark_removed: boolean;
  created_at: string;
  imported_at: string;
  archived_at?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  is_primary: boolean;
}

export interface PromptGroup {
  id: string;
  prompt: string;
  negative_prompt?: string;
  name?: string;
  description?: string;
  template_schema?: string;
  image_count: number;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  name: string;
  name_en?: string;
  color?: string;
}

export interface ImageWithRelations extends Image {
  models: ModelInfo[];
  tags: Tag[];
  prompt_groups: PromptGroup[];
}

export interface Vendor {
  id: string;
  name: string;
  path: string;
  models: Model[];
}

export interface Model {
  id: string;
  vendor_id: string;
  name: string;
  path: string;
  description?: string;
}

interface ImageStore {
  // State
  inboxImages: ImageWithRelations[];
  archivedImages: ImageWithRelations[];
  selectedImages: string[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setInboxImages: (images: ImageWithRelations[]) => void;
  setArchivedImages: (images: ImageWithRelations[]) => void;
  selectImage: (imageId: string) => void;
  deselectImage: (imageId: string) => void;
  selectAll: (imageIds: string[]) => void;
  clearSelection: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  addImage: (image: ImageWithRelations) => void;
  updateImage: (imageId: string, updates: Partial<ImageWithRelations>) => void;
  removeImage: (imageId: string) => void;
}

export const useImageStore = create<ImageStore>((set) => ({
  // Initial state
  inboxImages: [],
  archivedImages: [],
  selectedImages: [],
  isLoading: false,
  error: null,

  // Actions
  setInboxImages: (images) => set({ inboxImages: images }),
  setArchivedImages: (images) => set({ archivedImages: images }),
  
  selectImage: (imageId) => set((state) => ({
    selectedImages: state.selectedImages.includes(imageId)
      ? state.selectedImages
      : [...state.selectedImages, imageId],
  })),
  
  deselectImage: (imageId) => set((state) => ({
    selectedImages: state.selectedImages.filter((id) => id !== imageId),
  })),
  
  selectAll: (imageIds) => set({
    selectedImages: imageIds,
  }),
  
  clearSelection: () => set({ selectedImages: [] }),
  
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  
  addImage: (image) => set((state) => ({
    inboxImages: [image, ...state.inboxImages],
  })),
  
  updateImage: (imageId, updates) => set((state) => ({
    inboxImages: state.inboxImages.map((img) =>
      img.id === imageId ? { ...img, ...updates } : img
    ),
    archivedImages: state.archivedImages.map((img) =>
      img.id === imageId ? { ...img, ...updates } : img
    ),
  })),
  
  removeImage: (imageId) => set((state) => ({
    inboxImages: state.inboxImages.filter((img) => img.id !== imageId),
    archivedImages: state.archivedImages.filter((img) => img.id !== imageId),
    selectedImages: state.selectedImages.filter((id) => id !== imageId),
  })),
}));

// Vendor Store
interface VendorStore {
  vendors: Vendor[];
  isLoading: boolean;
  setVendors: (vendors: Vendor[]) => void;
  setLoading: (loading: boolean) => void;
}

export const useVendorStore = create<VendorStore>((set) => ({
  vendors: [],
  isLoading: false,
  setVendors: (vendors) => set({ vendors }),
  setLoading: (loading) => set({ isLoading: loading }),
}));

// Tag Store
interface TagStore {
  tags: Tag[];
  popularTags: Tag[];
  setTags: (tags: Tag[]) => void;
  setPopularTags: (tags: Tag[]) => void;
}

export const useTagStore = create<TagStore>((set) => ({
  tags: [],
  popularTags: [],
  setTags: (tags) => set({ tags }),
  setPopularTags: (tags) => set({ popularTags: tags }),
}));

// UI Store
const SETTINGS_STORAGE_KEY = "ai-image-manager-settings";
const THEME_STORAGE_KEY = "ai-image-manager-theme";
const VIEW_MODE_STORAGE_KEY = "ai-image-manager-view-mode";
const DEFAULT_LIGHT_THEME_COLOR = "#2563eb";
const DEFAULT_DARK_THEME_COLOR = "#60a5fa";

export type Theme = "light" | "dark" | "system";
export type ViewMode = "grid" | "list";

// 从 localStorage 读取设置
function loadSettings(): Record<string, any> {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore parse errors
  }
  return {};
}

// 保存设置到 localStorage
function saveSettingsToStorage(settings: Record<string, any>): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

function normalizeThemeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : fallback;
}

function hexToHsl(hex: string): string {
  const sanitized = hex.replace("#", "");
  const r = Number.parseInt(sanitized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(sanitized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(sanitized.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return `0 0% ${(lightness * 100).toFixed(1)}%`;
  }

  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue = 0;
  switch (max) {
    case r:
      hue = (g - b) / delta + (g < b ? 6 : 0);
      break;
    case g:
      hue = (b - r) / delta + 2;
      break;
    default:
      hue = (r - g) / delta + 4;
      break;
  }

  hue /= 6;
  return `${(hue * 360).toFixed(1)} ${(saturation * 100).toFixed(1)}% ${(lightness * 100).toFixed(1)}%`;
}

function getThemeColors(settings: Record<string, any>) {
  return {
    light: normalizeThemeColor(settings.lightThemeColor, DEFAULT_LIGHT_THEME_COLOR),
    dark: normalizeThemeColor(settings.darkThemeColor, DEFAULT_DARK_THEME_COLOR),
  };
}

function getThemeForegroundHex(hex: string): string {
  const sanitized = hex.replace("#", "");
  const r = Number.parseInt(sanitized.slice(0, 2), 16);
  const g = Number.parseInt(sanitized.slice(2, 4), 16);
  const b = Number.parseInt(sanitized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#0f172a" : "#f8fafc";
}

function applyThemeColors(settings: Record<string, any>) {
  const root = document.documentElement;
  const themeColors = getThemeColors(settings);

  root.style.setProperty("--primary-light", hexToHsl(themeColors.light));
  root.style.setProperty("--primary-light-foreground", hexToHsl(getThemeForegroundHex(themeColors.light)));
  root.style.setProperty("--primary-dark", hexToHsl(themeColors.dark));
  root.style.setProperty("--primary-dark-foreground", hexToHsl(getThemeForegroundHex(themeColors.dark)));
}

// 读取保存的主题
function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {}
  return "system";
}

// 读取保存的视图模式
function loadViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored === "grid" || stored === "list") return stored;
  } catch {}
  return "grid"; // 默认为 grid
}

// 应用主题到 DOM
function applyTheme(theme: Theme) {
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}

// 初始化时立即应用主题
applyThemeColors(loadSettings());
applyTheme(loadTheme());

interface UIStore {
  activeTab: "inbox" | "archived" | "prompt-management";
  searchQuery: string;
  selectedVendorFilter: string | null;
  selectedModelFilter: string | null;
  selectedTagFilter: string | null;
  isQuickEditOpen: boolean;
  editingImageId: string | null;
  isImageViewerOpen: boolean;
  viewingImageId: string | null;
  settingsOpen: boolean;
  settingsTab: string;
  settings: Record<string, any>;
  theme: Theme;
  viewMode: ViewMode;

  setActiveTab: (tab: "inbox" | "archived" | "prompt-management") => void;
  setSearchQuery: (query: string) => void;
  setVendorFilter: (vendorId: string | null) => void;
  setModelFilter: (modelId: string | null) => void;
  setTagFilter: (tagId: string | null) => void;
  openQuickEdit: (imageId: string) => void;
  closeQuickEdit: () => void;
  openImageViewer: (imageId: string) => void;
  closeImageViewer: () => void;
  setViewingImageId: (imageId: string) => void;
  openSettings: () => void;
  closeSettings: () => void;
  setSettingsTab: (tab: string) => void;
  updateSetting: (key: string, value: any) => void;
  setTheme: (theme: Theme) => void;
  setViewMode: (mode: ViewMode) => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  activeTab: "inbox",
  searchQuery: "",
  selectedVendorFilter: null,
  selectedModelFilter: null,
  selectedTagFilter: null,
  isQuickEditOpen: false,
  editingImageId: null,
  isImageViewerOpen: false,
  viewingImageId: null,
  settingsOpen: false,
  settingsTab: "general",
  settings: loadSettings(),
  theme: loadTheme(),
  viewMode: loadViewMode(),

  setActiveTab: (tab) => {
    useImageStore.getState().clearSelection();
    set({ activeTab: tab });
  },
  setSearchQuery: (query) => set({ searchQuery: query }),
  setVendorFilter: (vendorId) => set({ selectedVendorFilter: vendorId }),
  setModelFilter: (modelId) => set({ selectedModelFilter: modelId }),
  setTagFilter: (tagId) => set({ selectedTagFilter: tagId }),
  openQuickEdit: (imageId) => set({ isQuickEditOpen: true, editingImageId: imageId }),
  closeQuickEdit: () => set({ isQuickEditOpen: false, editingImageId: null }),
  openImageViewer: (imageId) => set({ isImageViewerOpen: true, viewingImageId: imageId }),
  closeImageViewer: () => set({ isImageViewerOpen: false, viewingImageId: null }),
  setViewingImageId: (imageId) => set({ viewingImageId: imageId }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  updateSetting: (key, value) => {
    const newSettings = { ...get().settings, [key]: value };
    set({ settings: newSettings });
    saveSettingsToStorage(newSettings);
    if (key === "lightThemeColor" || key === "darkThemeColor") {
      applyThemeColors(newSettings);
    }
  },
  setTheme: (theme) => {
    set({ theme });
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
    applyTheme(theme);
    // system 模式下监听系统主题变化
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("system");
      mq.addEventListener("change", handler);
      // 清理旧的监听器（简单处理）
      return () => mq.removeEventListener("change", handler);
    }
  },
  setViewMode: (mode) => {
    set({ viewMode: mode });
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {}
  },
}));
