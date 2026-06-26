import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { SceneObject, ObjectType, createDefaultObject } from './types';
import { User, Box, Circle, Square, Minus, Database, Plus, Trash2, Eye, EyeOff, Undo2, Redo2, Trash } from 'lucide-react';
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
  onUndo: () => void;
  onRedo: () => void;
  onClearScene: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export default function ScenePanel({
  objects,
  selectedObjectId,
  onObjectSelect,
  onAddObject,
  onRemoveObject,
  onUpdateObject,
  onUndo,
  onRedo,
  onClearScene,
  canUndo,
  canRedo
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
    <div className="w-[220px] shrink-0 border-r border-border bg-slate-50 dark:bg-zinc-900/50 flex flex-col h-full overflow-hidden">
      <div className="p-3 border-b border-border bg-muted/20 flex items-center justify-between">
        <h3 className="font-medium text-sm">场景对象</h3>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onUndo} disabled={!canUndo} title="撤销">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onRedo} disabled={!canRedo} title="重做">
            <Redo2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="w-7 h-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={onClearScene} title="清空场景">
            <Trash className="w-4 h-4" />
          </Button>
          <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="w-7 h-7">
              <Plus className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.glb,.gltf';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                  const url = URL.createObjectURL(file);
                  const obj = createDefaultObject('model', file.name);
                  obj.modelPath = url;
                  onAddObject(obj);
                  onObjectSelect(obj.id);
                }
              };
              input.click();
            }}>
               <Box className="w-4 h-4 mr-2" /> 导入本地 GLTF/GLB...
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddDefault('character', '人物模型')}>
               <User className="w-4 h-4 mr-2" /> 人物 (白膜)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              const obj = createDefaultObject('model', 'Xbot 模型');
              obj.modelPath = '/models/Xbot.glb';
              onAddObject(obj);
              onObjectSelect(obj.id);
            }}>
               <User className="w-4 h-4 mr-2 text-primary" /> Xbot (高精模型)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              const obj = createDefaultObject('model', 'Soldier 模型');
              obj.modelPath = '/models/Soldier.glb';
              onAddObject(obj);
              onObjectSelect(obj.id);
            }}>
               <User className="w-4 h-4 mr-2 text-primary" /> Soldier (高精模型)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              const obj = createDefaultObject('model', '火烈鸟 (Flamingo)');
              obj.modelPath = '/models/Flamingo.glb';
              onAddObject(obj);
              onObjectSelect(obj.id);
            }}>
               <Box className="w-4 h-4 mr-2 text-primary" /> 火烈鸟 (Flamingo)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              const obj = createDefaultObject('model', '鹦鹉 (Parrot)');
              obj.modelPath = '/models/Parrot.glb';
              onAddObject(obj);
              onObjectSelect(obj.id);
            }}>
               <Box className="w-4 h-4 mr-2 text-primary" /> 鹦鹉 (Parrot)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              const obj = createDefaultObject('model', '马 (Horse)');
              obj.modelPath = '/models/Horse.glb';
              onAddObject(obj);
              onObjectSelect(obj.id);
            }}>
               <Box className="w-4 h-4 mr-2 text-primary" /> 马 (Horse)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              const obj = createDefaultObject('model', '东京微缩街景 (Littlest Tokyo)');
              obj.modelPath = '/models/LittlestTokyo.glb';
              onAddObject(obj);
              onObjectSelect(obj.id);
            }}>
               <Box className="w-4 h-4 mr-2 text-primary" /> 微缩街景 (建筑)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              const obj = createDefaultObject('model', '椅子 (Sheen Chair)');
              obj.modelPath = '/models/SheenChair.glb';
              onAddObject(obj);
              onObjectSelect(obj.id);
            }}>
               <Box className="w-4 h-4 mr-2 text-primary" /> 椅子 (居家)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              const obj = createDefaultObject('model', '水瓶 (Water Bottle)');
              obj.modelPath = '/models/WaterBottle.glb';
              onAddObject(obj);
              onObjectSelect(obj.id);
            }}>
               <Box className="w-4 h-4 mr-2 text-primary" /> 水瓶 (居家)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              const obj = createDefaultObject('model', '复古相机 (Antique Camera)');
              obj.modelPath = '/models/AntiqueCamera.glb';
              onAddObject(obj);
              onObjectSelect(obj.id);
            }}>
               <Box className="w-4 h-4 mr-2 text-primary" /> 复古相机 (居家)
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
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
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
