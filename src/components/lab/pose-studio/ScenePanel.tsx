import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { SceneObject, ObjectType, createDefaultObject } from './types';
import { User, Box, Circle, Square, Minus, Database, Plus, Trash2, Eye, EyeOff, Undo2, Redo2, Trash } from 'lucide-react';
import { toast } from '@/hooks/useToast';
import { POSE_MODEL_ASSETS, PoseModelAsset, resolvePoseModelAsset } from './modelAssets';
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

  const handleAddRemoteModel = async (asset: PoseModelAsset) => {
    try {
      toast({ title: 'Preparing model', description: asset.label });
      const modelPath = await resolvePoseModelAsset(asset);
      const obj = createDefaultObject('model', asset.name);
      obj.modelPath = modelPath;
      onAddObject(obj);
      onObjectSelect(obj.id);
    } catch (error) {
      toast({ title: 'Model download failed', description: String(error), variant: 'destructive' });
    }
  };

  const handleImportLocalModel = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.glb,.gltf';
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const obj = createDefaultObject('model', file.name);
      obj.modelPath = URL.createObjectURL(file);
      onAddObject(obj);
      onObjectSelect(obj.id);
    };
    input.click();
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
        <h3 className="font-medium text-sm">Scene Objects</h3>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onUndo} disabled={!canUndo} title="Undo">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onRedo} disabled={!canRedo} title="Redo">
            <Redo2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="w-7 h-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={onClearScene} title="Clear scene">
            <Trash className="w-4 h-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="w-7 h-7">
                <Plus className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleImportLocalModel}>
                <Box className="w-4 h-4 mr-2" /> Import local GLTF/GLB...
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddDefault('character', 'Basic character')}>
                <User className="w-4 h-4 mr-2" /> Character
              </DropdownMenuItem>
              {POSE_MODEL_ASSETS.map((asset) => (
                <DropdownMenuItem key={asset.fileName} onClick={() => handleAddRemoteModel(asset)}>
                  {asset.icon === 'user'
                    ? <User className="w-4 h-4 mr-2 text-primary" />
                    : <Box className="w-4 h-4 mr-2 text-primary" />}
                  {asset.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => handleAddDefault('box', 'Box')}>
                <Square className="w-4 h-4 mr-2" /> Box
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddDefault('sphere', 'Sphere')}>
                <Circle className="w-4 h-4 mr-2" /> Sphere
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddDefault('cylinder', 'Cylinder')}>
                <Database className="w-4 h-4 mr-2" /> Cylinder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAddDefault('plane', 'Plane')}>
                <Minus className="w-4 h-4 mr-2" /> Plane
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
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6"
                  onClick={(event) => {
                    event.stopPropagation();
                    onUpdateObject(obj.id, { visible: !obj.visible });
                  }}
                >
                  {obj.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 opacity-50" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6 text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveObject(obj.id);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}

          {objects.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-xs">
              No objects yet. Use the plus button to add one.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
