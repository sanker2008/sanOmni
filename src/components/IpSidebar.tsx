import { useState, useEffect } from "react";
import { type IpAsset } from "@/stores";
import { ipApi } from "@/services/tauri";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Search, Users, ChevronRight, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface IpSidebarProps {
  onIpSelect: (ipId: string | null) => void;
  selectedIpId: string | null;
  imageCounts?: Record<string, number>;
  totalCount?: number;
}

export default function IpSidebar({ onIpSelect, selectedIpId, imageCounts, totalCount }: IpSidebarProps) {
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
    <div className="w-64 border-r bg-muted/40 flex flex-col h-full">
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
            className="w-full justify-between font-medium mb-2"
            onClick={() => onIpSelect(null)}
          >
            <div className="flex items-center">
              <Users className="mr-2 h-4 w-4 text-muted-foreground" />
              全部图片
            </div>
            {typeof totalCount === "number" && (
              <Badge variant="secondary" className="font-normal text-xs px-1.5 py-0.2 min-w-[20px] h-5 justify-center">
                {totalCount}
              </Badge>
            )}
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
                {filteredIps.map((ip) => {
                  const count = imageCounts?.[ip.id] || 0;
                  return (
                    <Button
                      key={ip.id}
                      variant={selectedIpId === ip.id ? "secondary" : "ghost"}
                      className={cn(
                        "w-full justify-between h-8 px-2 text-sm",
                        selectedIpId === ip.id && "bg-secondary"
                      )}
                      onClick={() => onIpSelect(ip.id)}
                    >
                      <span className="truncate mr-2 text-left">{ip.name}</span>
                      {imageCounts && (
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "font-normal text-xs px-1.5 py-0.2 min-w-[20px] h-5 justify-center border-none",
                            selectedIpId === ip.id ? "bg-background/50 text-foreground" : "bg-muted/50 text-muted-foreground"
                          )}
                        >
                          {count}
                        </Badge>
                      )}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
