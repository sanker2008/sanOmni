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
  category: string;
  tags: string;
  price: number;
  is_published: boolean;
  publish_status: string;
  remote_slug?: string;
  remote_url?: string;
  last_published_at?: string;
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

export interface IpAsset {
  id: string;
  name: string;
  path: string;
  avatar_path?: string;
  inspiration?: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface IpCharacterSheet {
  id: string;
  ip_id: string;
  image_path: string;
  sheet_type: string;
  sort_order: number;
  created_at: string;
}

export interface IpCreation {
  ip_id: string;
  image_path: string;
  creation_name?: string;
  created_at: string;
}

export interface IpStickerPack {
  id: string;
  ip_id: string;
  name: string;
  path: string;
  description?: string;
  cover_path?: string;
  banner_path?: string;
  icon_path?: string;
  reward_guide_path?: string;
  reward_thanks_path?: string;
  created_at: string;
  updated_at: string;
}

export interface IpEmoji {
  id: string;
  pack_id: string;
  image_path: string;
  trigger_word?: string;
  sort_order: number;
  created_at: string;
}

export interface IpStickerPackPlatform {
  id: string;
  pack_id: string;
  platform_name: string;
  pack_name_on_platform?: string;
  emoji_size_spec?: string;
  status: string;
  publish_url?: string;
  downloads_count: number;
  updated_at: string;
}

export interface IpRelation {
  ip_a_id: string;
  ip_b_id: string;
  relation_type: string;
  description?: string;
  created_at: string;
  ip_b_name?: string;
  ip_b_avatar_path?: string;
}

export interface IpImage {
  id: string;
  filename: string;
  original_filename: string;
  ip_id: string;
  relative_path: string;
  absolute_path: string;
  status: "inbox" | "tagged" | "archived";
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

export interface IpImageWithTags {
  ip_image: IpImage;
  tags: Tag[];
}

export interface IpAssetDetail {
  ip: IpAsset;
  character_sheets: IpCharacterSheet[];
  creations: IpCreation[];
  sticker_packs: IpStickerPack[];
  emojis: IpEmoji[];
  platforms: IpStickerPackPlatform[];
  relations: IpRelation[];
  ip_images: IpImageWithTags[];
}


export interface ImageWithRelations extends Image {
  models: ModelInfo[];
  tags: Tag[];
  prompt_groups: PromptGroup[];
}

export interface IpImageWithRelations {
  id: string;
  filename: string;
  original_filename: string;
  ip_id: string;
  relative_path: string;
  absolute_path: string;
  status: "inbox" | "tagged" | "archived";
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
  tags: Tag[];
  ip_name: string;
  ip_ids?: string[];
  primary_ip_id?: string;
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

interface IpImageStore {
  // State
  inboxImages: IpImageWithRelations[];
  archivedImages: IpImageWithRelations[];
  selectedImages: string[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setInboxImages: (images: IpImageWithRelations[]) => void;
  setArchivedImages: (images: IpImageWithRelations[]) => void;
  selectImage: (imageId: string) => void;
  deselectImage: (imageId: string) => void;
  selectAll: (imageIds: string[]) => void;
  clearSelection: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  addImage: (image: IpImageWithRelations) => void;
  updateImage: (imageId: string, updates: Partial<IpImageWithRelations>) => void;
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

export const useIpImageStore = create<IpImageStore>((set) => ({
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
  activeTab: "prompt" | "ip" | "labs";
  promptTab: "inbox" | "archived" | "templates";
  ipTab: "inbox" | "archived" | "works";
  searchQuery: string;
  selectedVendorFilter: string | null;
  selectedModelFilter: string | null;
  selectedTagFilter: string | null;
  isQuickEditOpen: boolean;
  editingImageId: string | null;
  isImageViewerOpen: boolean;
  viewingImageId: string | null;
  customViewerImages: (ImageWithRelations | IpImageWithRelations)[] | null;
  settingsOpen: boolean;
  settingsTab: string;
  settings: Record<string, any>;
  theme: Theme;
  viewMode: ViewMode;
  selectedIpId: string | null;

  setActiveTab: (tab: "prompt" | "ip" | "labs") => void;
  setPromptTab: (tab: "inbox" | "archived" | "templates") => void;
  setIpTab: (tab: "inbox" | "archived" | "works") => void;
  setSearchQuery: (query: string) => void;
  setVendorFilter: (vendorId: string | null) => void;
  setModelFilter: (modelId: string | null) => void;
  setTagFilter: (tagId: string | null) => void;
  openQuickEdit: (imageId: string) => void;
  closeQuickEdit: () => void;
  openImageViewer: (imageId: string, customImages?: (ImageWithRelations | IpImageWithRelations)[]) => void;
  closeImageViewer: () => void;
  setViewingImageId: (imageId: string) => void;
  openSettings: () => void;
  closeSettings: () => void;
  setSettingsTab: (tab: string) => void;
  updateSetting: (key: string, value: any) => void;
  setTheme: (theme: Theme) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedIpId: (id: string | null) => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  activeTab: "prompt",
  promptTab: "templates",
  ipTab: "archived",
  searchQuery: "",
  selectedVendorFilter: null,
  selectedModelFilter: null,
  selectedTagFilter: null,
  isQuickEditOpen: false,
  editingImageId: null,
  isImageViewerOpen: false,
  viewingImageId: null,
  customViewerImages: null,
  settingsOpen: false,
  settingsTab: "general",
  settings: loadSettings(),
  theme: loadTheme(),
  viewMode: loadViewMode(),
  selectedIpId: null,

  setActiveTab: (tab) => {
    // Only clear image selection if we're actually changing domains
    if (get().activeTab !== tab) {
      useImageStore.getState().clearSelection();
    }
    set({ activeTab: tab });
  },
  setPromptTab: (tab) => {
    useImageStore.getState().clearSelection();
    set({ promptTab: tab });
  },
  setIpTab: (tab) => {
    useIpImageStore.getState().clearSelection();
    set({ ipTab: tab });
  },
  setSearchQuery: (query) => set({ searchQuery: query }),
  setVendorFilter: (vendorId) => set({ selectedVendorFilter: vendorId }),
  setModelFilter: (modelId) => set({ selectedModelFilter: modelId }),
  setTagFilter: (tagId) => set({ selectedTagFilter: tagId }),
  openQuickEdit: (imageId) => set({ isQuickEditOpen: true, editingImageId: imageId }),
  closeQuickEdit: () => set({ isQuickEditOpen: false, editingImageId: null }),
  openImageViewer: (imageId, customImages) => set({ isImageViewerOpen: true, viewingImageId: imageId, customViewerImages: customImages || null }),
  closeImageViewer: () => set({ isImageViewerOpen: false, viewingImageId: null, customViewerImages: null }),
  setViewingImageId: (imageId) => set({ viewingImageId: imageId }),
  openSettings: () => set((state) => ({
    settingsOpen: true,
    settingsTab: state.activeTab === "prompt" ? "prompt" : "ip",
  })),
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
  setSelectedIpId: (id) => set({ selectedIpId: id }),
}));

// Works Collection Types
export type WorkType = 
  | 'tv_series' | 'movie' | 'novel' | 'drama' 
  | 'animation' | 'game' | 'comic' | 'other';

export type WorkStatus = 
  | 'planning' | 'in_production' | 'released' 
  | 'completed' | 'cancelled';

export type CharacterType = 
  | 'protagonist' | 'supporting' | 'antagonist' 
  | 'guest' | 'cameo' | 'other';

export interface Work {
  id: string;
  name: string;
  path?: string;
  work_type: WorkType;
  description?: string;
  release_date?: string;
  producer?: string;
  director_author?: string;
  status?: WorkStatus;
  cover_path?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface Character {
  id: string;
  work_id: string;
  name: string;
  character_type?: CharacterType;
  description?: string;
  appearance_info?: string;
  image_paths?: string;
  ip_id?: string;
  ip_relation_note?: string;
  display_order: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface CharacterWithRelations extends Character {
  work_name: string;
  work_type: WorkType;
  ip_name?: string;
  ip_avatar_path?: string;
}

export interface WorkWithRelations extends Work {
  tags: Tag[];
  characters: CharacterWithRelations[];
  character_count: number;
}

export interface WorkFilters {
  search?: string;
  work_type?: WorkType;
  status?: WorkStatus;
  tag_ids?: string[];
  sort_by?: 'created_at' | 'updated_at' | 'release_date' | 'name';
  sort_order?: 'asc' | 'desc';
}

// Works Store
interface WorksStore {
  works: WorkWithRelations[];
  selectedWork: WorkWithRelations | null;
  filters: WorkFilters;
  loading: boolean;
  
  fetchWorks: () => Promise<void>;
  createWork: (work: { name: string; path?: string | null; work_type: string; description?: string | null; release_date?: string | null; producer?: string | null; director_author?: string | null; status?: string | null }) => Promise<Work>;
  updateWork: (id: string, updates: { name?: string; path?: string | null; work_type?: string; description?: string | null; release_date?: string | null; producer?: string | null; director_author?: string | null; status?: string | null }) => Promise<Work>;
  deleteWork: (id: string) => Promise<void>;
  selectWork: (work: WorkWithRelations | null) => void;
  setFilters: (filters: Partial<WorkFilters>) => void;
  setLoading: (loading: boolean) => void;
  uploadCover: (workId: string, file: File) => Promise<string>;
  deleteCover: (workId: string) => Promise<void>;
  addTag: (workId: string, tagId: string) => Promise<void>;
  removeTag: (workId: string, tagId: string) => Promise<void>;
}

export const useWorksStore = create<WorksStore>((set, get) => ({
  works: [],
  selectedWork: null,
  filters: {},
  loading: false,
  
  fetchWorks: async () => {
    set({ loading: true });
    try {
      const { getWorks } = await import("@/services/tauri");
      const data = await getWorks(get().filters);
      set({ works: data });
    } catch (e) {
      console.error("Failed to fetch works:", e);
    } finally {
      set({ loading: false });
    }
  },
  
  createWork: async (params) => {
    const { createWork, getWorkById } = await import("@/services/tauri");
    const work = await createWork(params);
    const fullWork = await getWorkById(work.id);
    set((state) => ({ works: [fullWork, ...state.works] }));
    return work;
  },
  
  updateWork: async (id, updates) => {
    const { updateWork, getWorkById } = await import("@/services/tauri");
    const work = await updateWork({ id, ...updates });
    const fullWork = await getWorkById(id);
    set((state) => ({
      works: state.works.map((w) => w.id === id ? fullWork : w),
      selectedWork: state.selectedWork?.id === id ? fullWork : state.selectedWork,
    }));
    return work;
  },
  
  deleteWork: async (id) => {
    const { deleteWork } = await import("@/services/tauri");
    await deleteWork(id);
    set((state) => ({
      works: state.works.filter((w) => w.id !== id),
      selectedWork: state.selectedWork?.id === id ? null : state.selectedWork,
    }));
  },
  
  selectWork: (work) => set({ selectedWork: work }),
  
  setFilters: (newFilters) => {
    set((state) => ({ filters: { ...state.filters, ...newFilters } }));
    get().fetchWorks();
  },
  
  setLoading: (loading) => set({ loading }),
  
  uploadCover: async (workId, file) => {
    const { convertFileToWebp } = await import("@/lib/webpConverter");
    const webpFile = await convertFileToWebp(file);
    const { uploadWorkCover, getWorkById } = await import("@/services/tauri");
    const arrayBuffer = await webpFile.arrayBuffer();
    const data = Array.from(new Uint8Array(arrayBuffer));
    const ext = webpFile.name.split('.').pop() || 'webp';
    const coverPath = await uploadWorkCover(workId, data, ext);
    const fullWork = await getWorkById(workId);
    set((state) => ({
      works: state.works.map((w) => w.id === workId ? fullWork : w),
      selectedWork: state.selectedWork?.id === workId ? fullWork : state.selectedWork,
    }));
    return coverPath;
  },
  
  deleteCover: async (workId) => {
    const { deleteWorkCover, getWorkById } = await import("@/services/tauri");
    await deleteWorkCover(workId);
    const fullWork = await getWorkById(workId);
    set((state) => ({
      works: state.works.map((w) => w.id === workId ? fullWork : w),
      selectedWork: state.selectedWork?.id === workId ? fullWork : state.selectedWork,
    }));
  },
  
  addTag: async (workId, tagId) => {
    const { addWorkTag, getWorkById } = await import("@/services/tauri");
    await addWorkTag(workId, tagId);
    const fullWork = await getWorkById(workId);
    set((state) => ({
      works: state.works.map((w) => w.id === workId ? fullWork : w),
      selectedWork: state.selectedWork?.id === workId ? fullWork : state.selectedWork,
    }));
  },
  
  removeTag: async (workId, tagId) => {
    const { removeWorkTag, getWorkById } = await import("@/services/tauri");
    await removeWorkTag(workId, tagId);
    const fullWork = await getWorkById(workId);
    set((state) => ({
      works: state.works.map((w) => w.id === workId ? fullWork : w),
      selectedWork: state.selectedWork?.id === workId ? fullWork : state.selectedWork,
    }));
  },
}));

// Characters Store
interface CharactersStore {
  characters: CharacterWithRelations[];
  loading: boolean;
  
  fetchCharacters: (workId: string) => Promise<void>;
  createCharacter: (params: { work_id: string; name: string; character_type?: string | null; description?: string | null; appearance_info?: string | null; ip_id?: string | null; ip_relation_note?: string | null }) => Promise<Character>;
  updateCharacter: (id: string, updates: { name?: string; character_type?: string | null; description?: string | null; appearance_info?: string | null; ip_id?: string | null; ip_relation_note?: string | null }) => Promise<Character>;
  deleteCharacter: (id: string) => Promise<void>;
  updateOrder: (characterIds: string[]) => Promise<void>;
  uploadImages: (characterId: string, workId: string, files: File[]) => Promise<string[]>;
  setCharacters: (characters: CharacterWithRelations[]) => void;
  setLoading: (loading: boolean) => void;
}

export const useCharactersStore = create<CharactersStore>((set) => ({
  characters: [],
  loading: false,
  
  fetchCharacters: async (workId) => {
    set({ loading: true });
    try {
      const { getCharacters } = await import("@/services/tauri");
      const data = await getCharacters(workId);
      set({ characters: data });
    } catch (e) {
      console.error("Failed to fetch characters:", e);
    } finally {
      set({ loading: false });
    }
  },
  
  createCharacter: async (params) => {
    const { createCharacter, getCharacterById } = await import("@/services/tauri");
    const char = await createCharacter(params);
    const fullChar = await getCharacterById(char.id);
    set((state) => ({ 
      characters: [...state.characters, fullChar].sort((a, b) => a.display_order - b.display_order)
    }));
    return char;
  },
  
  updateCharacter: async (id, updates) => {
    const { updateCharacter, getCharacterById } = await import("@/services/tauri");
    await updateCharacter({ id, ...updates });
    const fullChar = await getCharacterById(id);
    set((state) => ({
      characters: state.characters.map((c) => c.id === id ? fullChar : c),
    }));
    return fullChar;
  },
  
  deleteCharacter: async (id) => {
    const { deleteCharacter } = await import("@/services/tauri");
    await deleteCharacter(id);
    set((state) => ({
      characters: state.characters.filter((c) => c.id !== id),
    }));
  },
  
  updateOrder: async (characterIds) => {
    const { updateCharacterOrder } = await import("@/services/tauri");
    await updateCharacterOrder(characterIds);
    set((state) => {
      const ordered = characterIds.map((id, index) => {
        const char = state.characters.find((c) => c.id === id);
        return char ? { ...char, display_order: index } : null;
      }).filter(Boolean) as CharacterWithRelations[];
      return { characters: ordered };
    });
  },
  
  uploadImages: async (characterId, workId, files) => {
    const { convertFileToWebp } = await import("@/lib/webpConverter");
    const { uploadCharacterImages, getCharacterById } = await import("@/services/tauri");
    const images: [number[], string][] = await Promise.all(
      files.map(async (file) => {
        const webpFile = await convertFileToWebp(file);
        const arrayBuffer = await webpFile.arrayBuffer();
        const data = Array.from(new Uint8Array(arrayBuffer));
        const ext = webpFile.name.split('.').pop() || 'webp';
        return [data, ext] as [number[], string];
      })
    );
    const paths = await uploadCharacterImages(characterId, workId, images);
    const fullChar = await getCharacterById(characterId);
    set((state) => ({
      characters: state.characters.map((c) => c.id === characterId ? fullChar : c),
    }));
    return paths;
  },
  
  setCharacters: (characters) => set({ characters }),
  setLoading: (loading) => set({ loading }),
}));

