import { useUIStore } from "@/stores";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useFolderWatcher } from "@/hooks/useFolderWatcher";
import InboxView from "@/components/InboxView";
import ArchivedView from "@/components/ArchivedView";
import QuickEditModal from "@/components/QuickEditModal";
import ImageViewer from "@/components/ImageViewer";
import SettingsView from "@/components/SettingsView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Inbox, Archive, Settings, Search, Sun, Moon, Monitor } from "lucide-react";
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
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <header className="border-b px-4 py-3 flex items-center justify-between bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-semibold">
              sanMediaBox
              <span className="ml-2 text-sm font-normal text-muted-foreground">AI Image Manager</span>
            </h1>

            <nav className="flex items-center gap-1">
              <Button
                variant={activeTab === "inbox" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("inbox")}
                className="gap-2"
              >
                <Inbox className="w-4 h-4" />
                收件箱
              </Button>
              <Button
                variant={activeTab === "archived" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("archived")}
                className="gap-2"
              >
                <Archive className="w-4 h-4" />
                已归档
              </Button>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="全局搜索..."
                className="pl-9 w-72"
              />
            </div>
            <Separator orientation="vertical" className="h-6" />
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
        <main className="flex-1 overflow-hidden">
          {activeTab === "inbox" ? (
            <InboxView />
          ) : (
            <ArchivedView />
          )}
        </main>

        {/* Quick Edit Modal */}
        <QuickEditModal />

        {/* Image Viewer */}
        <ImageViewer />

        {/* Settings View */}
        <SettingsView />
      </div>
    </TooltipProvider>
  );
}

export default App;
