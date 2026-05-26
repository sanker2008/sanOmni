import { useState, useEffect } from "react";
import { type IpAsset } from "@/stores";
import { ipApi } from "@/services/tauri";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Search, Users, ChevronRight, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface IpSidebarProps {
  onIpSelect: (ipId: string | null) => void;
  selectedIpId: string | null;
}

export default function IpSidebar({ onIpSelect, selectedIpId }: IpSidebarProps) {
  const [ips, setIps] = useState<IpAsset[]>([]);
  const [search, setSearch] = useState("");
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    loadIps();
  }, []);

  const loadIps = async () => {
    try {
      const data = await ipApi.getAll();
      setIps(data);
    } catch (error) {
      console.error("Failed to load IPs:", error);
    }
  };

  const filteredIps = ips.filter(ip => 
    ip.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-64 border-r bg-muted/10 flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索 IP 形象..."
            className="pl-9 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2">
          <Button
            variant={selectedIpId === null ? "secondary" : "ghost"}
            className="w-full justify-start font-medium mb-2"
            onClick={() => onIpSelect(null)}
          >
            <Users className="mr-2 h-4 w-4" />
            全部图片
          </Button>
          
          <div className="space-y-1">
            <Button
              variant="ghost"
              className="w-full justify-start px-2 py-1 h-8 text-muted-foreground font-semibold"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 mr-1" />
              ) : (
                <ChevronRight className="h-4 w-4 mr-1" />
              )}
              IP 形象 ({filteredIps.length})
            </Button>
            
            {isExpanded && (
              <div className="pl-4 space-y-1 mt-1">
                {filteredIps.map((ip) => (
                  <Button
                    key={ip.id}
                    variant={selectedIpId === ip.id ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start h-8 px-2 text-sm",
                      selectedIpId === ip.id && "bg-secondary"
                    )}
                    onClick={() => onIpSelect(ip.id)}
                  >
                    <span className="truncate">{ip.name}</span>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
