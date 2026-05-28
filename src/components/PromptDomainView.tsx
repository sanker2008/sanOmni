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
      <div className="border-b border-zinc-200/80 dark:border-zinc-800 px-4 py-2 flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-900 shadow-sm transition-all duration-300">
        <Button
          variant={promptTab === "inbox" ? "default" : "ghost"}
          size="sm"
          onClick={() => setPromptTab("inbox")}
          className={cn(
            "gap-2 h-8 transition-all duration-200 font-medium border border-transparent",
            promptTab === "inbox"
              ? "bg-white text-zinc-900 border-zinc-200/85 shadow-sm dark:bg-zinc-800 dark:text-zinc-50 dark:border-zinc-700/50 hover:bg-zinc-50 dark:hover:bg-zinc-700/80"
              : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60"
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
            "gap-2 h-8 transition-all duration-200 font-medium border border-transparent",
            promptTab === "archived"
              ? "bg-white text-zinc-900 border-zinc-200/85 shadow-sm dark:bg-zinc-800 dark:text-zinc-50 dark:border-zinc-700/50 hover:bg-zinc-50 dark:hover:bg-zinc-700/80"
              : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60"
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
            "gap-2 h-8 transition-all duration-200 font-medium border border-transparent",
            promptTab === "templates"
              ? "bg-white text-zinc-900 border-zinc-200/85 shadow-sm dark:bg-zinc-800 dark:text-zinc-50 dark:border-zinc-700/50 hover:bg-zinc-50 dark:hover:bg-zinc-700/80"
              : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60"
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
