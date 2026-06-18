// ── Primitive types ───────────────────────────────────────────────────────────

export type ObjectType = 'character' | 'box' | 'sphere' | 'cylinder' | 'plane' | 'model';

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

// ── Joint system ─────────────────────────────────────────────────────────────

export type JointName =
  | 'spine' | 'neck'
  | 'leftShoulder' | 'leftElbow' | 'leftWrist'
  | 'rightShoulder' | 'rightElbow' | 'rightWrist'
  | 'leftHip' | 'leftKnee' | 'leftAnkle'
  | 'rightHip' | 'rightKnee' | 'rightAnkle';

/** Partial joint rotation map — each entry is rotation in RADIANS (Three.js native) */
export type JointRotations = Partial<Record<JointName, Vector3>>;

export const JOINT_GROUPS: { label: string; joints: { key: JointName; label: string }[] }[] = [
  {
    label: '躯干',
    joints: [
      { key: 'spine', label: '脊椎' },
      { key: 'neck',  label: '颈部' },
    ],
  },
  {
    label: '左臂',
    joints: [
      { key: 'leftShoulder', label: '肩' },
      { key: 'leftElbow',    label: '肘' },
      { key: 'leftWrist',    label: '腕' },
    ],
  },
  {
    label: '右臂',
    joints: [
      { key: 'rightShoulder', label: '肩' },
      { key: 'rightElbow',    label: '肘' },
      { key: 'rightWrist',    label: '腕' },
    ],
  },
  {
    label: '左腿',
    joints: [
      { key: 'leftHip',   label: '髋' },
      { key: 'leftKnee',  label: '膝' },
      { key: 'leftAnkle', label: '踝' },
    ],
  },
  {
    label: '右腿',
    joints: [
      { key: 'rightHip',   label: '髋' },
      { key: 'rightKnee',  label: '膝' },
      { key: 'rightAnkle', label: '踝' },
    ],
  },
];

// ── Scene object ──────────────────────────────────────────────────────────────

export interface SceneObject {
  id: string;
  type: ObjectType;
  name: string;
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
  visible: boolean;
  color: string;
  wireframe: boolean;
  opacity: number;
  /** Joint rotations (only for 'character' type). Keys are JointName, values in radians. */
  joints?: JointRotations;
  /** For 'model' type only */
  modelPath?: string;
  modelData?: string;
}

// ── Scene configuration ───────────────────────────────────────────────────────

export interface LightConfig {
  ambientIntensity: number;
  ambientColor: string;
  directionalIntensity: number;
  directionalColor: string;
  directionalPosition: Vector3;
  pointLightEnabled: boolean;
  pointLightIntensity: number;
  pointLightColor: string;
  pointLightPosition: Vector3;
  extraPointLights?: PointLightConfig[];
}

export interface PointLightConfig {
  id: string;
  name: string;
  enabled: boolean;
  intensity: number;
  color: string;
  position: Vector3;
}

export interface CameraConfig {
  fov: number;
  distance: number;
  polarAngle: number;
  azimuthalAngle: number;
  target: Vector3;
}

export interface PoseProject {
  id: string;
  name: string;
  updatedAt: number;
  objects: SceneObject[];
  lights: LightConfig;
  camera: CameraConfig;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_LIGHTS: LightConfig = {
  ambientIntensity: 0.5,
  ambientColor: '#ffffff',
  directionalIntensity: 1.0,
  directionalColor: '#ffffff',
  directionalPosition: { x: 5, y: 10, z: 5 },
  pointLightEnabled: false,
  pointLightIntensity: 0.8,
  pointLightColor: '#ffddaa',
  pointLightPosition: { x: -5, y: 2, z: -5 },
  extraPointLights: [],
};

export const DEFAULT_CAMERA: CameraConfig = {
  fov: 45,
  distance: 10,
  polarAngle: Math.PI / 3,
  azimuthalAngle: Math.PI / 4,
  target: { x: 0, y: 1, z: 0 },
};

export function createDefaultObject(type: ObjectType, name: string): SceneObject {
  return {
    id: `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    name,
    // Character: feet at y=0 naturally. Other primitives: center above ground.
    position: { x: 0, y: type === 'plane' ? 0 : type === 'character' ? 0 : 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale:    { x: 1, y: 1, z: 1 },
    visible:  true,
    color:    type === 'character' ? '#e8e8e8' : '#d1d5db',
    wireframe: false,
    opacity:  1,
    joints:   type === 'character' ? {} : undefined,
  };
}
