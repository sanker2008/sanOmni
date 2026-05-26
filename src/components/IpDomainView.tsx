import { useUIStore } from "@/stores";
import IpInboxView from "@/components/IpInboxView";
import IpArchivedView from "@/components/IpArchivedView";
import IPManagementView from "@/components/IPManagementView";
import { Button } from "@/components/ui/button";
import { Inbox, Archive, Users } from "lucide-react";

export default function IpDomainView() {
  const { ipTab, setIpTab } = useUIStore();

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Sub-navigation for IP Domain */}
      <div className="border-b px-4 py-2 flex items-center gap-1 bg-muted/30">
        <Button
          variant={ipTab === "inbox" ? "default" : "ghost"}
          size="sm"
          onClick={() => setIpTab("inbox")}
          className="gap-2 h-8"
        >
          <Inbox className="w-4 h-4" />
          待整理
        </Button>
        <Button
          variant={ipTab === "archived" ? "default" : "ghost"}
          size="sm"
          onClick={() => setIpTab("archived")}
          className="gap-2 h-8"
        >
          <Archive className="w-4 h-4" />
          已归档
        </Button>
        <Button
          variant={ipTab === "assets" ? "default" : "ghost"}
          size="sm"
          onClick={() => setIpTab("assets")}
          className="gap-2 h-8"
        >
          <Users className="w-4 h-4" />
          IP资产管理
        </Button>
      </div>

      {/* Main Area */}
      <div className="flex-1 overflow-hidden relative">
        {ipTab === "inbox" && <IpInboxView />}
        {ipTab === "archived" && <IpArchivedView />}
        {ipTab === "assets" && <IPManagementView />}
      </div>
    </div>
  );
}
