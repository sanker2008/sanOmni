import { appDataDir } from "@tauri-apps/api/path";

export async function getAppRoot(): Promise<string> {
  try {
    const settingsStr = localStorage.getItem("san_settings");
    if (settingsStr) {
      const settings = JSON.parse(settingsStr);
      if (settings.unifiedRootPath && settings.unifiedRootPath.trim()) {
        return settings.unifiedRootPath.trim();
      }
    }
  } catch (e) {
    // Ignore JSON parse errors
  }

  return await appDataDir();
}
