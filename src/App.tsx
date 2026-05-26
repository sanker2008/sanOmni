import { useUIStore } from "@/stores";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useFolderWatcher } from "@/hooks/useFolderWatcher";
import PromptDomainView from "@/components/PromptDomainView";
import QuickEditModal from "@/components/QuickEditModal";
import ImageViewer from "@/components/ImageViewer";
import SettingsView from "@/components/SettingsView";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Settings, Sun, Moon, Monitor, LayoutTemplate, Users } from "lucide-react";
import IpDomainView from "@/components/IpDomainView";
import type { Theme } from "@/stores";

const THEME_CYCLE: Theme[] = ["light", "dark", "system"];
const THEME_LABELS: Record<Theme, string> = {
  light: "浅色模式",
  dark: "深色模式",
  system: "跟随系统",
};

function App() {
  const { activeTab, setActiveTab, openSettings, theme, setTheme } = useUIStore();

  // Register keyboard shortcuts
  useKeyboardShortcuts();

  // Start folder watchers
  useFolderWatcher();

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
  };

  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b px-4 py-3 flex items-center justify-between bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 shadow-sm">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-semibold">
              sanMediaBox
              <span className="ml-2 text-sm font-normal text-muted-foreground">AI Image Manager</span>
            </h1>

            <nav className="flex items-center gap-1">
              <Button
                variant={activeTab === "prompt" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("prompt")}
                className="gap-2"
              >
                <LayoutTemplate className="w-4 h-4" />
                Prompt 模板管理
              </Button>
              <Button
                variant={activeTab === "ip" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("ip")}
                className="gap-2"
              >
                <Users className="w-4 h-4" />
                IP 形象管理
              </Button>
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
            {activeTab === "prompt" ? (
              <PromptDomainView />
            ) : (
              <IpDomainView />
            )}
        </main>

        {/* Quick Edit Modal */}
        <QuickEditModal />

        {/* Image Viewer */}
        <ImageViewer />

        {/* Settings View */}
        <SettingsView />

        {/* Toast Notifications */}
        <Toaster />
      </div>
    </TooltipProvider>
  );
}

export default App;
