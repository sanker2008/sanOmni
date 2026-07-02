import { convertFileSrc, invoke } from '@tauri-apps/api/core';

const POSE_MODEL_RELEASE_TAG = 'v1.3.0';
const POSE_MODEL_BASE_URL = `https://github.com/sanker2008/sanOmni/releases/download/${POSE_MODEL_RELEASE_TAG}`;

export interface PoseModelAsset {
  name: string;
  label: string;
  fileName: string;
  icon: 'user' | 'box';
}

export const POSE_MODEL_ASSETS: PoseModelAsset[] = [
  { name: 'Xbot model', label: 'Xbot', fileName: 'Xbot.glb', icon: 'user' },
  { name: 'Soldier model', label: 'Soldier', fileName: 'Soldier.glb', icon: 'user' },
  { name: 'Flamingo', label: 'Flamingo', fileName: 'Flamingo.glb', icon: 'box' },
  { name: 'Parrot', label: 'Parrot', fileName: 'Parrot.glb', icon: 'box' },
  { name: 'Horse', label: 'Horse', fileName: 'Horse.glb', icon: 'box' },
  { name: 'Littlest Tokyo', label: 'Littlest Tokyo', fileName: 'LittlestTokyo.glb', icon: 'box' },
  { name: 'Sheen Chair', label: 'Sheen Chair', fileName: 'SheenChair.glb', icon: 'box' },
  { name: 'Water Bottle', label: 'Water Bottle', fileName: 'WaterBottle.glb', icon: 'box' },
  { name: 'Antique Camera', label: 'Antique Camera', fileName: 'AntiqueCamera.glb', icon: 'box' },
];

export async function resolvePoseModelAsset(asset: PoseModelAsset): Promise<string> {
  const absolutePath = await invoke<string>('ensure_pose_model', {
    fileName: asset.fileName,
    url: `${POSE_MODEL_BASE_URL}/${asset.fileName}`,
  });

  return convertFileSrc(absolutePath);
}
