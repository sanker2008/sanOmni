import { useUIStore } from "@/stores";
import IpInboxView from "@/components/IpInboxView";
import IpArchivedView from "@/components/IpArchivedView";
import { Button } from "@/components/ui/button";
import { Inbox, Archive } from "lucide-react";
import { cn } from "@/lib/utils";

export default function IpDomainView() {
  const { ipTab, setIpTab } = useUIStore();

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Sub-navigation for IP Domain */}
      <div className="border-b border-zinc-700/50 dark:border-zinc-200/80 px-4 py-2 flex items-center gap-1.5 bg-gradient-to-r from-zinc-900 to-primary dark:from-zinc-100 dark:to-primary shadow-sm transition-all duration-300">
        <Button
          variant={ipTab === "inbox" ? "default" : "ghost"}
          size="sm"
          onClick={() => setIpTab("inbox")}
          className={cn(
            "gap-2 h-8 transition-all duration-200 font-medium",
            ipTab === "inbox"
              ? "bg-white text-zinc-900 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800 shadow-sm"
              : "text-zinc-400 hover:text-white hover:bg-white/10 dark:text-zinc-500 dark:hover:text-zinc-900 dark:hover:bg-black/5"
          )}
        >
          <Inbox className="w-4 h-4" />
          待整理
        </Button>
        <Button
          variant={ipTab === "archived" ? "default" : "ghost"}
          size="sm"
          onClick={() => setIpTab("archived")}
          className={cn(
            "gap-2 h-8 transition-all duration-200 font-medium",
            ipTab === "archived"
              ? "bg-white text-zinc-900 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800 shadow-sm"
              : "text-zinc-400 hover:text-white hover:bg-white/10 dark:text-zinc-500 dark:hover:text-zinc-900 dark:hover:bg-black/5"
          )}
        >
          <Archive className="w-4 h-4" />
          已归档
        </Button>
      </div>

      {/* Main Area */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {ipTab === "inbox" && <IpInboxView />}
        {ipTab === "archived" && <IpArchivedView />}
      </div>
    </div>
  );
}

