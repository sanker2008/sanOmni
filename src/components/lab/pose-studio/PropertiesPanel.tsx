import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { SceneObject, LightConfig, CameraConfig, JOINT_GROUPS, JointName, JointRotations, PointLightConfig } from './types';
import { Box, Camera, ChevronDown, Plus, Sun, Trash2 } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

/** Format radians → degrees for display (1 decimal place) */
const toDeg = (rad: number) => +(rad * RAD2DEG).toFixed(1);
/** Convert degrees input → radians for storage */
const toRad = (deg: number) => deg * DEG2RAD;
const normalizeDeg = (deg: number) => ((deg % 360) + 360) % 360;
const getLightDistance = (position: LightConfig['directionalPosition']) =>
  Math.max(1, Math.hypot(position.x, position.y, position.z));
const getDirectionalAngles = (position: LightConfig['directionalPosition']) => {
  const horizontal = Math.hypot(position.x, position.z);
  return {
    azimuth: normalizeDeg(Math.atan2(position.x, position.z) * RAD2DEG),
    elevation: Math.atan2(position.y, horizontal) * RAD2DEG,
    distance: getLightDistance(position),
  };
};
const getDirectionalPosition = (azimuth: number, elevation: number, distance: number) => {
  const azimuthRad = toRad(azimuth);
  const elevationRad = toRad(elevation);
  const horizontal = distance * Math.cos(elevationRad);
  return {
    x: horizontal * Math.sin(azimuthRad),
    y: distance * Math.sin(elevationRad),
    z: horizontal * Math.cos(azimuthRad),
  };
};

const POSE_PRESETS: {
  label: string;
  bodyY?: number;
  joints: JointRotations;
}[] = [
  {
    label: '站立',
    bodyY: 0,
    joints: {},
  },
  {
    label: '蹲着',
    bodyY: 0,
    joints: {
      spine: { x: toRad(-12), y: 0, z: 0 },
      leftShoulder: { x: toRad(25), y: 0, z: toRad(-18) },
      rightShoulder: { x: toRad(25), y: 0, z: toRad(18) },
      leftElbow: { x: toRad(-45), y: 0, z: 0 },
      rightElbow: { x: toRad(-45), y: 0, z: 0 },
      leftHip: { x: toRad(75), y: 0, z: toRad(8) },
      rightHip: { x: toRad(75), y: 0, z: toRad(-8) },
      leftKnee: { x: toRad(-115), y: 0, z: 0 },
      rightKnee: { x: toRad(-115), y: 0, z: 0 },
      leftAnkle: { x: toRad(25), y: 0, z: 0 },
      rightAnkle: { x: toRad(25), y: 0, z: 0 },
    },
  },
  {
    label: '跑步',
    bodyY: 0,
    joints: {
      spine: { x: toRad(-10), y: toRad(5), z: 0 },
      leftShoulder: { x: toRad(-55), y: 0, z: toRad(-12) },
      rightShoulder: { x: toRad(55), y: 0, z: toRad(12) },
      leftElbow: { x: toRad(-70), y: 0, z: 0 },
      rightElbow: { x: toRad(-70), y: 0, z: 0 },
      leftHip: { x: toRad(55), y: 0, z: toRad(8) },
      rightHip: { x: toRad(-45), y: 0, z: toRad(-8) },
      leftKnee: { x: toRad(-85), y: 0, z: 0 },
      rightKnee: { x: toRad(55), y: 0, z: 0 },
      leftAnkle: { x: toRad(18), y: 0, z: 0 },
      rightAnkle: { x: toRad(-20), y: 0, z: 0 },
    },
  },
  {
    label: '跳起',
    bodyY: 0.45,
    joints: {
      spine: { x: toRad(-5), y: 0, z: 0 },
      leftShoulder: { x: 0, y: 0, z: toRad(-145) },
      rightShoulder: { x: 0, y: 0, z: toRad(145) },
      leftElbow: { x: toRad(-20), y: 0, z: 0 },
      rightElbow: { x: toRad(-20), y: 0, z: 0 },
      leftHip: { x: toRad(-22), y: 0, z: toRad(10) },
      rightHip: { x: toRad(-22), y: 0, z: toRad(-10) },
      leftKnee: { x: toRad(35), y: 0, z: 0 },
      rightKnee: { x: toRad(35), y: 0, z: 0 },
      leftAnkle: { x: toRad(-15), y: 0, z: 0 },
      rightAnkle: { x: toRad(-15), y: 0, z: 0 },
    },
  },
  {
    label: '坐着',
    bodyY: 0,
    joints: {
      spine: { x: toRad(-4), y: 0, z: 0 },
      leftShoulder: { x: toRad(8), y: 0, z: toRad(-10) },
      rightShoulder: { x: toRad(8), y: 0, z: toRad(10) },
      leftElbow: { x: toRad(-20), y: 0, z: 0 },
      rightElbow: { x: toRad(-20), y: 0, z: 0 },
      leftHip: { x: toRad(88), y: 0, z: toRad(6) },
      rightHip: { x: toRad(88), y: 0, z: toRad(-6) },
      leftKnee: { x: toRad(-90), y: 0, z: 0 },
      rightKnee: { x: toRad(-90), y: 0, z: 0 },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────

interface PropertiesPanelProps {
  selectedObject: SceneObject | null;
  selectedJointName: string | null;
  onSelectJoint: (jointName: string | null) => void;
  characterColor: string;
  lights: LightConfig;
  cameraConfig: CameraConfig;
  onUpdateObject: (id: string, updates: Partial<SceneObject>) => void;
  onUpdateCharacterColor: (color: string) => void;
  onUpdateLights: (updates: Partial<LightConfig>) => void;
  onUpdateCamera: (updates: Partial<CameraConfig>) => void;
}

export default function PropertiesPanel({
  selectedObject,
  selectedJointName,
  onSelectJoint,
  characterColor,
  lights,
  cameraConfig,
  onUpdateObject,
  onUpdateCharacterColor,
  onUpdateLights,
  onUpdateCamera
}: PropertiesPanelProps) {
  const [isEnvironmentOpen, setIsEnvironmentOpen] = useState(false);
  const mainLightAngles = getDirectionalAngles(lights.directionalPosition);
  const updateDirectionalAngle = (updates: Partial<{ azimuth: number; elevation: number }>) => {
    onUpdateLights({
      directionalPosition: getDirectionalPosition(
        updates.azimuth ?? mainLightAngles.azimuth,
        updates.elevation ?? mainLightAngles.elevation,
        mainLightAngles.distance,
      ),
    });
  };
  const extraPointLights = lights.extraPointLights ?? [];
  const addExtraPointLight = () => {
    const nextIndex = extraPointLights.length + 1;
    const newLight: PointLightConfig = {
      id: `light_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: `光源 ${nextIndex}`,
      enabled: true,
      intensity: 0.8,
      color: '#ffffff',
      position: { x: -3 + nextIndex, y: 3, z: 3 },
    };
    onUpdateLights({ extraPointLights: [...extraPointLights, newLight] });
  };
  const updateExtraPointLight = (id: string, updates: Partial<PointLightConfig>) => {
    onUpdateLights({
      extraPointLights: extraPointLights.map(light =>
        light.id === id ? { ...light, ...updates } : light
      ),
    });
  };
  const updateExtraPointLightPosition = (
    id: string,
    axis: 'x' | 'y' | 'z',
    value: number
  ) => {
    onUpdateLights({
      extraPointLights: extraPointLights.map(light =>
        light.id === id
          ? { ...light, position: { ...light.position, [axis]: value } }
          : light
      ),
    });
  };
  const removeExtraPointLight = (id: string) => {
    onUpdateLights({
      extraPointLights: extraPointLights.filter(light => light.id !== id),
    });
  };
  const renderExtraPointLights = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">额外光源</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 gap-1 text-xs"
          onClick={addExtraPointLight}
        >
          <Plus className="w-3.5 h-3.5" />
          添加
        </Button>
      </div>

      {extraPointLights.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          暂无额外光源
        </div>
      ) : (
        <div className="space-y-3">
          {extraPointLights.map((light, index) => (
            <div key={light.id} className="space-y-3 rounded-md border border-border bg-muted/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Switch
                    checked={light.enabled}
                    onCheckedChange={(enabled) => updateExtraPointLight(light.id, { enabled })}
                  />
                  <span className="truncate text-xs font-semibold">{light.name || `光源 ${index + 1}`}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-destructive"
                  aria-label={`删除${light.name || `光源 ${index + 1}`}`}
                  onClick={() => removeExtraPointLight(light.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <Label className="text-xs">强度</Label>
                  <span className="text-muted-foreground">{light.intensity.toFixed(1)}</span>
                </div>
                <Slider min={0} max={5} step={0.1}
                  value={[light.intensity]}
                  onValueChange={([v]) => updateExtraPointLight(light.id, { intensity: v })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">颜色</Label>
                <Input type="color" value={light.color}
                  onChange={(e) => updateExtraPointLight(light.id, { color: e.target.value })}
                  className="h-8 p-1 w-full"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">位置</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['x', 'y', 'z'] as const).map(axis => (
                    <div key={`${light.id}-${axis}`} className="flex items-center gap-1">
                      <span className="w-3 shrink-0 text-xs font-mono text-muted-foreground">{axis.toUpperCase()}</span>
                      <Input
                        type="number"
                        step="0.5"
                        className="h-7 text-xs px-1.5"
                        value={light.position[axis]}
                        onChange={(e) => updateExtraPointLightPosition(light.id, axis, parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── No object selected → show environment controls ──────────────────────
  if (!selectedObject) {
    return (
      <div className="w-[260px] shrink-0 border-l border-border bg-card/30 flex flex-col h-full overflow-hidden">
        <div className="p-3 border-b border-border bg-muted/20">
          <h3 className="font-medium text-sm">环境设置</h3>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">

            {/* Character material */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary font-medium text-sm">
                <Box className="w-4 h-4" />
                <span>白膜配置</span>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">白膜颜色</Label>
                <Input type="color" value={characterColor}
                  onChange={(e) => onUpdateCharacterColor(e.target.value)}
                  className="h-8 p-1 w-full"
                />
              </div>
            </div>

            <Separator />

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
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <Label className="text-xs">水平角</Label>
                    <span className="text-muted-foreground">{Math.round(mainLightAngles.azimuth)}°</span>
                  </div>
                  <Slider min={0} max={360} step={1}
                    value={[mainLightAngles.azimuth]}
                    onValueChange={([v]) => updateDirectionalAngle({ azimuth: v })}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <Label className="text-xs">俯仰角</Label>
                    <span className="text-muted-foreground">{Math.round(mainLightAngles.elevation)}°</span>
                  </div>
                  <Slider min={-80} max={80} step={1}
                    value={[mainLightAngles.elevation]}
                    onValueChange={([v]) => updateDirectionalAngle({ elevation: v })}
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
              {renderExtraPointLights()}
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

  const applyPosePreset = (preset: (typeof POSE_PRESETS)[number]) => {
    onUpdateObject(selectedObject.id, {
      joints: preset.joints,
      ...(typeof preset.bodyY === 'number'
        ? { position: { ...selectedObject.position, y: preset.bodyY } }
        : {}),
    });
    onSelectJoint(null);
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

          {/* Environment */}
          <div className="space-y-4">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-sm font-semibold text-primary"
              onClick={() => setIsEnvironmentOpen(open => !open)}
              aria-expanded={isEnvironmentOpen}
            >
              <span>环境设置</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${isEnvironmentOpen ? '' : '-rotate-90'}`} />
            </button>

            {isEnvironmentOpen && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-primary font-medium text-sm">
                    <Box className="w-4 h-4" />
                    <span>白膜配置</span>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">白膜颜色</Label>
                    <Input type="color" value={characterColor}
                      onChange={(e) => onUpdateCharacterColor(e.target.value)}
                      className="h-8 p-1 w-full"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-primary font-medium text-sm">
                    <Camera className="w-4 h-4" />
                    <span>相机配置</span>
                  </div>
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

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-primary font-medium text-sm">
                    <Sun className="w-4 h-4" />
                    <span>光源配置</span>
                  </div>
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
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <Label className="text-xs">水平角</Label>
                        <span className="text-muted-foreground">{Math.round(mainLightAngles.azimuth)}°</span>
                      </div>
                      <Slider min={0} max={360} step={1}
                        value={[mainLightAngles.azimuth]}
                        onValueChange={([v]) => updateDirectionalAngle({ azimuth: v })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <Label className="text-xs">俯仰角</Label>
                        <span className="text-muted-foreground">{Math.round(mainLightAngles.elevation)}°</span>
                      </div>
                      <Slider min={-80} max={80} step={1}
                        value={[mainLightAngles.elevation]}
                        onValueChange={([v]) => updateDirectionalAngle({ elevation: v })}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-sm">启用辅助光</Label>
                    <Switch
                      checked={lights.pointLightEnabled}
                      onCheckedChange={(c) => onUpdateLights({ pointLightEnabled: c })}
                    />
                  </div>
                  {renderExtraPointLights()}
                </div>
              </>
            )}
          </div>

          <Separator />

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
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">预设动作</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {POSE_PRESETS.map(preset => (
                        <Button
                          key={preset.label}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => applyPosePreset(preset)}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>
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
