import { useUIStore } from "@/stores";
import InboxView from "@/components/InboxView";
import ArchivedView from "@/components/ArchivedView";
import { PromptGroupsView } from "@/components/PromptGroupsView";
import { Button } from "@/components/ui/button";
import { Inbox, Archive, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PromptDomainView() {
  const { promptTab, setPromptTab } = useUIStore();

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Sub-navigation for Prompt Domain */}
      <div className="border-b border-zinc-700/50 dark:border-zinc-200/80 px-4 py-2 flex items-center gap-1.5 bg-gradient-to-r from-zinc-900 to-primary dark:from-zinc-100 dark:to-primary shadow-sm transition-all duration-300">
        <Button
          variant={promptTab === "inbox" ? "default" : "ghost"}
          size="sm"
          onClick={() => setPromptTab("inbox")}
          className={cn(
            "gap-2 h-8 transition-all duration-200 font-medium",
            promptTab === "inbox"
              ? "bg-white text-zinc-900 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800 shadow-sm"
              : "text-zinc-400 hover:text-white hover:bg-white/10 dark:text-zinc-500 dark:hover:text-zinc-900 dark:hover:bg-black/5"
          )}
        >
          <Inbox className="w-4 h-4" />
          待整理
        </Button>
        <Button
          variant={promptTab === "archived" ? "default" : "ghost"}
          size="sm"
          onClick={() => setPromptTab("archived")}
          className={cn(
            "gap-2 h-8 transition-all duration-200 font-medium",
            promptTab === "archived"
              ? "bg-white text-zinc-900 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800 shadow-sm"
              : "text-zinc-400 hover:text-white hover:bg-white/10 dark:text-zinc-500 dark:hover:text-zinc-900 dark:hover:bg-black/5"
          )}
        >
          <Archive className="w-4 h-4" />
          已归档
        </Button>
        <Button
          variant={promptTab === "templates" ? "default" : "ghost"}
          size="sm"
          onClick={() => setPromptTab("templates")}
          className={cn(
            "gap-2 h-8 transition-all duration-200 font-medium",
            promptTab === "templates"
              ? "bg-white text-zinc-900 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800 shadow-sm"
              : "text-zinc-400 hover:text-white hover:bg-white/10 dark:text-zinc-500 dark:hover:text-zinc-900 dark:hover:bg-black/5"
          )}
        >
          <Sparkles className="w-4 h-4" />
          模板管理
        </Button>
      </div>

      {/* Main Area */}
      <div className="flex-1 overflow-hidden relative">
        {promptTab === "inbox" && <InboxView />}
        {promptTab === "archived" && <ArchivedView />}
        {promptTab === "templates" && <PromptGroupsView />}
      </div>
    </div>
  );
}
