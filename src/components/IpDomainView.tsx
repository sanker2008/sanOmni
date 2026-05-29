import { useUIStore, useWorksStore } from "@/stores";
import IpInboxView from "@/components/IpInboxView";
import IpArchivedView from "@/components/IpArchivedView";
import { WorksView } from "./WorksView";
import WorkDetailView from "./WorkDetailView";
import { Button } from "@/components/ui/button";
import { Inbox, Archive, Film } from "lucide-react";
import { cn } from "@/lib/utils";

export default function IpDomainView() {
  const { ipTab, setIpTab } = useUIStore();
  const { selectedWork } = useWorksStore();

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Sub-navigation for IP Domain */}
      <div className="border-b border-zinc-200/80 dark:border-zinc-800 px-4 py-2 flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-900 shadow-sm transition-all duration-300">
        <Button
          variant={ipTab === "inbox" ? "default" : "ghost"}
          size="sm"
          onClick={() => setIpTab("inbox")}
          className={cn(
            "gap-2 h-8 transition-all duration-200 font-medium border border-transparent",
            ipTab === "inbox"
              ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
              : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60"
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
            "gap-2 h-8 transition-all duration-200 font-medium border border-transparent",
            ipTab === "archived"
              ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
              : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60"
          )}
        >
          <Archive className="w-4 h-4" />
          已归档
        </Button>
        <Button
          variant={ipTab === "works" ? "default" : "ghost"}
          size="sm"
          onClick={() => setIpTab("works")}
          className={cn(
            "gap-2 h-8 transition-all duration-200 font-medium border border-transparent",
            ipTab === "works"
              ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
              : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60"
          )}
        >
          <Film className="w-4 h-4" />
          作品集
        </Button>
      </div>

      {/* Main Area */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {ipTab === "inbox" && <IpInboxView />}
        {ipTab === "archived" && <IpArchivedView />}
        {ipTab === "works" && (
          selectedWork ? (
            <WorkDetailView onIpSelect={(ipId) => {
              const { setSelectedIpId, setIpTab } = useUIStore.getState();
              setSelectedIpId(ipId);
              setIpTab("archived");
            }} />
          ) : (
            <WorksView />
          )
        )}
      </div>
    </div>
  );
}

