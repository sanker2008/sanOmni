import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sparkles, Minimize2, Eraser, PenTool, Scissors, Film, FileType, RefreshCw } from 'lucide-react';
import { getAllAdapters } from './adapters';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AdapterPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (adapterId: string) => void;
}

const iconMap: Record<string, React.FC<any>> = {
  Sparkles, Minimize2, Eraser, PenTool, Scissors, Film, FileType, RefreshCw
};

export default function AdapterPicker({ open, onClose, onSelect }: AdapterPickerProps) {
  const adapters = getAllAdapters();

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>添加节点</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
            {adapters.map((adapter) => {
              const Icon = iconMap[adapter.icon] || RefreshCw;
              return (
                <div 
                  key={adapter.id}
                  onClick={() => {
                    onSelect(adapter.id);
                    onClose();
                  }}
                  className="flex flex-col p-4 border rounded-lg hover:border-primary cursor-pointer hover:bg-muted/50 transition-colors gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center text-primary">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">{adapter.name}</h4>
                      <p className="text-xs text-muted-foreground line-clamp-1">{adapter.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-[10px]">输入: {adapter.inputType}</Badge>
                    <Badge variant="outline" className="text-[10px]">输出: {adapter.outputType}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
