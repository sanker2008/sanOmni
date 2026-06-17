import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { SceneObject, ObjectType, createDefaultObject } from './types';
import { User, Box, Circle, Square, Minus, Database, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ScenePanelProps {
  objects: SceneObject[];
  selectedObjectId: string | null;
  onObjectSelect: (id: string | null) => void;
  onAddObject: (obj: SceneObject) => void;
  onRemoveObject: (id: string) => void;
  onUpdateObject: (id: string, updates: Partial<SceneObject>) => void;
}

export default function ScenePanel({
  objects,
  selectedObjectId,
  onObjectSelect,
  onAddObject,
  onRemoveObject,
  onUpdateObject
}: ScenePanelProps) {
  
  const handleAddDefault = (type: ObjectType, name: string) => {
    const obj = createDefaultObject(type, name);
    onAddObject(obj);
    onObjectSelect(obj.id);
  };

  const getIcon = (type: ObjectType) => {
    switch (type) {
      case 'character': return <User className="w-4 h-4" />;
      case 'box': return <Square className="w-4 h-4" />;
      case 'sphere': return <Circle className="w-4 h-4" />;
      case 'cylinder': return <Database className="w-4 h-4" />;
      case 'plane': return <Minus className="w-4 h-4" />;
      default: return <Box className="w-4 h-4" />;
    }
  };

  return (
    <div className="w-[220px] shrink-0 border-r border-border bg-card/30 flex flex-col h-full overflow-hidden">
      <div className="p-3 border-b border-border bg-muted/20 flex items-center justify-between">
        <h3 className="font-medium text-sm">场景对象</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="w-7 h-7">
              <Plus className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleAddDefault('character', '人物模型')}>
               <User className="w-4 h-4 mr-2" /> 人物 (白膜)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddDefault('box', '立方体')}>
               <Square className="w-4 h-4 mr-2" /> 立方体 (Box)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddDefault('sphere', '球体')}>
               <Circle className="w-4 h-4 mr-2" /> 球体 (Sphere)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddDefault('cylinder', '圆柱体')}>
               <Database className="w-4 h-4 mr-2" /> 圆柱 (Cylinder)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddDefault('plane', '地面')}>
               <Minus className="w-4 h-4 mr-2" /> 平面 (Plane)
            </DropdownMenuItem>
            {/* Model import can be added here if we implement GLTF file picking */}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-1">
          {objects.map((obj) => (
            <div 
              key={obj.id}
              className={`flex items-center gap-2 p-2 rounded-md cursor-pointer text-sm group ${
                selectedObjectId === obj.id 
                  ? 'bg-primary/10 text-primary font-medium' 
                  : 'hover:bg-muted text-foreground'
              }`}
              onClick={() => onObjectSelect(obj.id)}
            >
               <span className="opacity-70">{getIcon(obj.type)}</span>
               <span className="flex-1 truncate">{obj.name}</span>
               
               <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" size="icon" className="w-6 h-6"
                    onClick={(e) => { e.stopPropagation(); onUpdateObject(obj.id, { visible: !obj.visible }); }}
                  >
                     {obj.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 opacity-50" />}
                  </Button>
                  <Button 
                    variant="ghost" size="icon" className="w-6 h-6 text-destructive"
                    onClick={(e) => { e.stopPropagation(); onRemoveObject(obj.id); }}
                  >
                     <Trash2 className="w-3 h-3" />
                  </Button>
               </div>
            </div>
          ))}
          
          {objects.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-xs">
               暂无对象，点击右上角 + 添加
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
