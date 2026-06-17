import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { SceneObject, LightConfig, CameraConfig, JOINT_GROUPS, JointName } from './types';
import { Box, Camera, Sun } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

/** Format radians → degrees for display (1 decimal place) */
const toDeg = (rad: number) => +(rad * RAD2DEG).toFixed(1);
/** Convert degrees input → radians for storage */
const toRad = (deg: number) => deg * DEG2RAD;

// ─────────────────────────────────────────────────────────────────────────────

interface PropertiesPanelProps {
  selectedObject: SceneObject | null;
  selectedJointName: string | null;
  onSelectJoint: (jointName: string | null) => void;
  lights: LightConfig;
  cameraConfig: CameraConfig;
  onUpdateObject: (id: string, updates: Partial<SceneObject>) => void;
  onUpdateLights: (updates: Partial<LightConfig>) => void;
  onUpdateCamera: (updates: Partial<CameraConfig>) => void;
}

export default function PropertiesPanel({
  selectedObject,
  selectedJointName,
  onSelectJoint,
  lights,
  cameraConfig,
  onUpdateObject,
  onUpdateLights,
  onUpdateCamera
}: PropertiesPanelProps) {

  // ── No object selected → show environment controls ──────────────────────
  if (!selectedObject) {
    return (
      <div className="w-[260px] shrink-0 border-l border-border bg-card/30 flex flex-col h-full overflow-hidden">
        <div className="p-3 border-b border-border bg-muted/20">
          <h3 className="font-medium text-sm">环境设置</h3>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">

            {/* Camera */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-primary font-medium text-sm">
                <Camera className="w-4 h-4" />
                <span>相机配置</span>
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <Label className="text-xs">视野角度 (FOV)</Label>
                    <span className="text-muted-foreground">{cameraConfig.fov}°</span>
                  </div>
                  <Slider min={10} max={120} step={1}
                    value={[cameraConfig.fov]}
                    onValueChange={([v]) => onUpdateCamera({ fov: v })}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <Label className="text-xs">距离</Label>
                    <span className="text-muted-foreground">{cameraConfig.distance}</span>
                  </div>
                  <Slider min={1} max={50} step={0.5}
                    value={[cameraConfig.distance]}
                    onValueChange={([v]) => onUpdateCamera({ distance: v })}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Lights */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-primary font-medium text-sm">
                <Sun className="w-4 h-4" />
                <span>光源配置</span>
              </div>

              {/* Ambient */}
              <div className="space-y-3 p-3 bg-muted/10 rounded-md border border-border">
                <Label className="text-xs font-semibold">环境光 (Ambient)</Label>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <Label className="text-xs">强度</Label>
                    <span className="text-muted-foreground">{lights.ambientIntensity.toFixed(1)}</span>
                  </div>
                  <Slider min={0} max={2} step={0.1}
                    value={[lights.ambientIntensity]}
                    onValueChange={([v]) => onUpdateLights({ ambientIntensity: v })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">颜色</Label>
                  <Input type="color" value={lights.ambientColor}
                    onChange={(e) => onUpdateLights({ ambientColor: e.target.value })}
                    className="h-8 p-1 w-full"
                  />
                </div>
              </div>

              {/* Directional */}
              <div className="space-y-3 p-3 bg-muted/10 rounded-md border border-border">
                <Label className="text-xs font-semibold">主光源 (Directional)</Label>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <Label className="text-xs">强度</Label>
                    <span className="text-muted-foreground">{lights.directionalIntensity.toFixed(1)}</span>
                  </div>
                  <Slider min={0} max={5} step={0.1}
                    value={[lights.directionalIntensity]}
                    onValueChange={([v]) => onUpdateLights({ directionalIntensity: v })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">颜色</Label>
                  <Input type="color" value={lights.directionalColor}
                    onChange={(e) => onUpdateLights({ directionalColor: e.target.value })}
                    className="h-8 p-1 w-full"
                  />
                </div>
              </div>

              {/* Point Light */}
              <div className="flex items-center justify-between">
                <Label className="text-sm">启用辅助光</Label>
                <Switch
                  checked={lights.pointLightEnabled}
                  onCheckedChange={(c) => onUpdateLights({ pointLightEnabled: c })}
                />
              </div>
            </div>

          </div>
        </ScrollArea>
      </div>
    );
  }

  // ── Object selected → show transform + material ──────────────────────────

  /** Update a single axis of a Vector3 field */
  const updateVec3 = (
    field: 'position' | 'rotation' | 'scale',
    axis: 'x' | 'y' | 'z',
    value: number
  ) => {
    onUpdateObject(selectedObject.id, {
      [field]: { ...selectedObject[field], [axis]: value }
    });
  };

  return (
    <div className="w-[260px] shrink-0 border-l border-border bg-card/30 flex flex-col h-full overflow-hidden">
      <div className="p-3 border-b border-border bg-muted/20">
        <h3 className="font-medium text-sm truncate flex items-center gap-2">
          <Box className="w-4 h-4 text-primary" />
          {selectedObject.name} 属性
        </h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">

          {/* Transform */}
          <div className="space-y-4">
            <Label className="text-sm font-semibold text-primary">变换 (Transform)</Label>

            {/* Position */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">位置 (Position)</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['x', 'y', 'z'] as const).map(axis => (
                  <div key={`pos-${axis}`} className="flex items-center gap-1">
                    <span className="w-3 shrink-0 text-xs font-mono text-muted-foreground">{axis.toUpperCase()}</span>
                    <Input
                      type="number" step="0.1" className="h-7 text-xs px-1.5"
                      value={selectedObject.position[axis]}
                      onChange={(e) => updateVec3('position', axis, parseFloat(e.target.value) || 0)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Rotation — input/display in DEGREES, stored as radians internally */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">旋转 (Rotation)</Label>
                <span className="text-[10px] text-muted-foreground/70">单位：°</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['x', 'y', 'z'] as const).map(axis => (
                  <div key={`rot-${axis}`} className="flex items-center gap-1">
                    <span className="w-3 shrink-0 text-xs font-mono text-muted-foreground">{axis.toUpperCase()}</span>
                    <Input
                      type="number" step="1" className="h-7 text-xs px-1.5"
                      value={toDeg(selectedObject.rotation[axis])}
                      onChange={(e) => updateVec3('rotation', axis, toRad(parseFloat(e.target.value) || 0))}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Scale */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">缩放 (Scale)</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['x', 'y', 'z'] as const).map(axis => (
                  <div key={`scl-${axis}`} className="flex items-center gap-1">
                    <span className="w-3 shrink-0 text-xs font-mono text-muted-foreground">{axis.toUpperCase()}</span>
                    <Input
                      type="number" step="0.1" min="0.01" className="h-7 text-xs px-1.5"
                      value={selectedObject.scale[axis]}
                      onChange={(e) => updateVec3('scale', axis, Math.max(0.01, parseFloat(e.target.value) || 1))}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Joints (Character Only) */}
            {selectedObject.type === 'character' && (
              <>
                <Separator />
                <div className="space-y-4">
                  <Label className="text-sm font-semibold text-primary">骨骼关节 (Joints)</Label>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">选择关节</Label>
                    <select
                      className="w-full h-8 px-2 text-xs rounded-md border border-input bg-background"
                      value={selectedJointName || ''}
                      onChange={(e) => onSelectJoint(e.target.value || null)}
                    >
                      <option value="">(根节点 - 整体变换)</option>
                      {JOINT_GROUPS.map(group => (
                        <optgroup key={group.label} label={group.label}>
                          {group.joints.map(j => (
                            <option key={j.key} value={j.key}>{j.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {selectedJointName && (
                    <div className="space-y-2 p-3 bg-muted/20 rounded-md border border-border">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">
                          {JOINT_GROUPS.flatMap(g => g.joints).find(j => j.key === selectedJointName)?.label} 旋转
                        </Label>
                        <span className="text-[10px] text-muted-foreground/70">单位：°</span>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        {(['x', 'y', 'z'] as const).map(axis => {
                          const currentRot = selectedObject.joints?.[selectedJointName as JointName]?.[axis] || 0;
                          return (
                            <div key={`jrot-${axis}`} className="flex items-center gap-1">
                              <span className="w-3 shrink-0 text-xs font-mono text-muted-foreground">{axis.toUpperCase()}</span>
                              <Input
                                type="number" step="1" className="h-7 text-xs px-1.5"
                                value={toDeg(currentRot)}
                                onChange={(e) => {
                                  const newRot = toRad(parseFloat(e.target.value) || 0);
                                  const newJoints = {
                                    ...(selectedObject.joints || {}),
                                    [selectedJointName]: {
                                      ...(selectedObject.joints?.[selectedJointName as JointName] || { x: 0, y: 0, z: 0 }),
                                      [axis]: newRot
                                    }
                                  };
                                  onUpdateObject(selectedObject.id, { joints: newJoints });
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <Separator />

          {/* Material */}
          <div className="space-y-4">
            <Label className="text-sm font-semibold text-primary">材质 (Material)</Label>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">颜色 (Color)</Label>
                <Input type="color" value={selectedObject.color}
                  onChange={(e) => onUpdateObject(selectedObject.id, { color: e.target.value })}
                  className="h-8 p-1 w-full"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">线框模式 (Wireframe)</Label>
                <Switch
                  checked={selectedObject.wireframe}
                  onCheckedChange={(c) => onUpdateObject(selectedObject.id, { wireframe: c })}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <Label className="text-xs">不透明度 (Opacity)</Label>
                  <span className="text-muted-foreground">{(selectedObject.opacity * 100).toFixed(0)}%</span>
                </div>
                <Slider min={10} max={100} step={5}
                  value={[Math.round(selectedObject.opacity * 100)]}
                  onValueChange={([v]) => onUpdateObject(selectedObject.id, { opacity: v / 100 })}
                />
              </div>
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  );
}
