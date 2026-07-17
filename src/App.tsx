import { lazy, Suspense, useEffect } from "react";
import { settingsApi } from "@/services/tauri";
import { useUIStore } from "@/stores";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Settings, Sun, Moon, Monitor, LayoutTemplate, Users, FlaskConical } from "lucide-react";
import UpdateChecker from "@/components/UpdateChecker";
import type { Theme } from "@/stores";

const PromptDomainView = lazy(() => import("@/components/PromptDomainView"));
const IpDomainView = lazy(() => import("@/components/IpDomainView"));
const LabView = lazy(() => import("@/components/lab/LabView"));
const QuickEditModal = lazy(() => import("@/components/QuickEditModal"));
const ImageViewer = lazy(() => import("@/components/ImageViewer"));
const SettingsView = lazy(() => import("@/components/settings/SettingsView"));

const THEME_CYCLE: Theme[] = ["light", "dark", "system"];
const THEME_LABELS: Record<Theme, string> = {
  light: "浅色模式",
  dark: "深色模式",
  system: "跟随系统",
};

function App() {
  const { activeTab, setActiveTab, openSettings, theme, setTheme } = useUIStore();
  const appMode = import.meta.env.VITE_APP_MODE || "all";

  // Ensure DB is initialized on startup for custom paths
  useEffect(() => {
    settingsApi.getAll().catch(e => console.error("Failed to initialize db on startup:", e));
  }, []);

  // Register keyboard shortcuts
  useKeyboardShortcuts();

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
  };

  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        {/* Update Notification Banner */}
        <UpdateChecker />

        {/* Header */}
        <header className="border-b px-4 py-3 flex items-center justify-between bg-card/95 dark:bg-black backdrop-blur supports-[backdrop-filter]:bg-card/60 shadow-sm">
          <div className="flex items-center gap-6">
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <img
                src="/logo.png"
                alt=""
                className="h-7 w-7 shrink-0 object-contain"
                aria-hidden="true"
              />
              sanOmni

            </h1>

            <nav className="flex items-center gap-1">
              <Button
                variant={activeTab === "prompt" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("prompt")}
                className="gap-2"
              >
                <LayoutTemplate className="w-4 h-4" />
                sanPrompt
              </Button>
              {appMode !== "prompt_only" && (
                <>
                  <Button
                    variant={activeTab === "ip" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setActiveTab("ip")}
                    className="gap-2"
                  >
                    <Users className="w-4 h-4" />
                    sanIP
                  </Button>
                  <Button
                    variant={activeTab === "labs" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setActiveTab("labs")}
                    className="gap-2"
                  >
                    <FlaskConical className="w-4 h-4" />
                    sanLabs
                  </Button>
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={cycleTheme}>
                  <ThemeIcon className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{THEME_LABELS[theme]}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={openSettings}>
                  <Settings className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>设置 (Ctrl+,)</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden relative">
          <Suspense fallback={null}>
            {import.meta.env.VITE_APP_MODE === "prompt_only" ? (
              <PromptDomainView />
            ) : activeTab === "prompt" ? (
              <PromptDomainView />
            ) : activeTab === "ip" ? (
              <IpDomainView />
            ) : (
              <LabView />
            )}
          </Suspense>
        </main>

        {/* Quick Edit Modal */}
        <Suspense fallback={null}>
          <QuickEditModal />
        </Suspense>

        {/* Image Viewer */}
        <Suspense fallback={null}>
          <ImageViewer />
        </Suspense>

        {/* Settings View */}
        <Suspense fallback={null}>
          <SettingsView />
        </Suspense>

        {/* Toast Notifications */}
        <Toaster />
      </div>
    </TooltipProvider>
  );
}

export default App;
