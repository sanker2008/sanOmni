import { useUIStore } from "@/stores";
import InboxView from "@/components/InboxView";
import ArchivedView from "@/components/ArchivedView";
import { PromptGroupsView } from "@/components/PromptGroupsView";
import VendorsView from "@/components/VendorsView";
import { Button } from "@/components/ui/button";
import { Inbox, Archive, Sparkles, Server } from "lucide-react";

export default function PromptDomainView() {
  const { promptTab, setPromptTab } = useUIStore();

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Sub-navigation for Prompt Domain */}
      <div className="border-b px-4 py-2 flex items-center gap-1 bg-muted/30">
        <Button
          variant={promptTab === "inbox" ? "default" : "ghost"}
          size="sm"
          onClick={() => setPromptTab("inbox")}
          className="gap-2 h-8"
        >
          <Inbox className="w-4 h-4" />
          待整理
        </Button>
        <Button
          variant={promptTab === "archived" ? "default" : "ghost"}
          size="sm"
          onClick={() => setPromptTab("archived")}
          className="gap-2 h-8"
        >
          <Archive className="w-4 h-4" />
          已归档
        </Button>
        <Button
          variant={promptTab === "templates" ? "default" : "ghost"}
          size="sm"
          onClick={() => setPromptTab("templates")}
          className="gap-2 h-8"
        >
          <Sparkles className="w-4 h-4" />
          模板管理
        </Button>
        <Button
          variant={promptTab === "vendors" ? "default" : "ghost"}
          size="sm"
          onClick={() => setPromptTab("vendors")}
          className="gap-2 h-8"
        >
          <Server className="w-4 h-4" />
          厂商管理
        </Button>
      </div>

      {/* Main Area */}
      <div className="flex-1 overflow-hidden relative">
        {promptTab === "inbox" && <InboxView />}
        {promptTab === "archived" && <ArchivedView />}
        {promptTab === "templates" && <PromptGroupsView />}
        {promptTab === "vendors" && <VendorsView />}
      </div>
    </div>
  );
}
