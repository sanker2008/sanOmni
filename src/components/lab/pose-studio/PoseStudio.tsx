import { useState, useRef } from 'react';
import ThreeScene, { ThreeSceneRef } from './ThreeScene';
import ScenePanel from './ScenePanel';
import PropertiesPanel from './PropertiesPanel';
import ExportPanel from './ExportPanel';
import {
  SceneObject, LightConfig, CameraConfig,
  DEFAULT_LIGHTS, DEFAULT_CAMERA, createDefaultObject
} from './types';
import { saveProject, listProjects, loadProject, saveExport, openExportFolder } from './fs';
import { toast } from '@/hooks/useToast';
import { v4 as uuidv4 } from 'uuid';

interface ProjectEntry { id: string; name: string; updatedAt: number; }

export default function PoseStudio() {
  const [objects, setObjects]             = useState<SceneObject[]>([createDefaultObject('character', '基础模型')]);
  const [lights, setLights]               = useState<LightConfig>(DEFAULT_LIGHTS);
  const [cameraConfig, setCameraConfig]   = useState<CameraConfig>(DEFAULT_CAMERA);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(objects[0]?.id || null);
  const [selectedJointName, setSelectedJointName] = useState<string | null>(null);
  const [isExporting, setIsExporting]     = useState(false);
  const [projectList, setProjectList]     = useState<ProjectEntry[]>([]);
  const sceneRef = useRef<ThreeSceneRef>(null);

  const selectedObject = objects.find(o => o.id === selectedObjectId) ?? null;

  // ── Object handlers ───────────────────────────────────────────────────────

  const handleAddObject = (obj: SceneObject) => setObjects(prev => [...prev, obj]);

  const handleRemoveObject = (id: string) => {
    setObjects(prev => prev.filter(o => o.id !== id));
    if (selectedObjectId === id) {
      setSelectedObjectId(null);
      setSelectedJointName(null);
    }
  };

  const handleObjectSelect = (id: string | null, jointName?: string | null) => {
    setSelectedObjectId(id);
    setSelectedJointName(jointName || null);
  };

  const handleUpdateObject = (id: string, updates: Partial<SceneObject>) =>
    setObjects(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExport = async (width: number, height: number, format: string, quality: number) => {
    if (!sceneRef.current) return;
    setIsExporting(true);
    try {
      // Brief delay so React can render the loading state before the sync render
      await new Promise(r => setTimeout(r, 80));

      const dataUrl = sceneRef.current.exportImage(width, height, format, quality);
      const response = await fetch(dataUrl);
      const bytes = new Uint8Array(await (await response.blob()).arrayBuffer());

      const ext = format === 'image/jpeg' ? 'jpg' : 'png';
      const filename = `pose_${Date.now()}.${ext}`;
      await saveExport(filename, bytes);

      toast({ title: '导出成功', description: `${width}×${height} · ${filename}` });
    } catch (error) {
      toast({ title: '导出失败', description: String(error), variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  // ── Project save/load ─────────────────────────────────────────────────────

  const handleSaveProject = async (name: string) => {
    try {
      const id = uuidv4();
      await saveProject(id, name, { objects, lights, camera: cameraConfig });
      toast({ title: '保存成功', description: `项目"${name}"已保存` });
    } catch (e) {
      toast({ title: '保存失败', description: String(e), variant: 'destructive' });
    }
  };

  /** Called when the user opens the load dialog — fetches the list */
  const handleFetchProjects = async () => {
    try {
      const list = await listProjects();
      setProjectList(list);
    } catch (e) {
      console.error('Failed to list projects:', e);
      setProjectList([]);
    }
  };

  /** Called when the user selects a project in the dialog */
  const handleLoadProject = async (id: string) => {
    try {
      const data = await loadProject(id);
      setObjects(data.objects ?? []);
      setLights(data.lights ?? DEFAULT_LIGHTS);
      setCameraConfig(data.camera ?? DEFAULT_CAMERA);
      setSelectedObjectId(null);
      toast({ title: '加载成功', description: `已恢复项目: ${data.name}` });
    } catch (e) {
      toast({ title: '加载失败', description: String(e), variant: 'destructive' });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">

      {/* Main workspace */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left — scene objects */}
        <ScenePanel
          objects={objects}
          selectedObjectId={selectedObjectId}
          onObjectSelect={handleObjectSelect}
          onAddObject={handleAddObject}
          onRemoveObject={handleRemoveObject}
          onUpdateObject={handleUpdateObject}
        />

        {/* Center — 3D canvas */}
        <div className="flex-1 relative overflow-hidden">
          <ThreeScene
            ref={sceneRef}
            objects={objects}
            lights={lights}
            cameraConfig={cameraConfig}
            selectedObjectId={selectedObjectId}
            selectedJointName={selectedJointName}
            onObjectSelect={handleObjectSelect}
            onUpdateObject={handleUpdateObject}
          />
        </div>

        {/* Right — properties */}
        <PropertiesPanel
          selectedObject={selectedObject}
          selectedJointName={selectedJointName}
          onSelectJoint={setSelectedJointName}
          lights={lights}
          cameraConfig={cameraConfig}
          onUpdateObject={handleUpdateObject}
          onUpdateLights={(updates: Partial<LightConfig>) => setLights(prev => ({ ...prev, ...updates }))}
          onUpdateCamera={(updates: Partial<CameraConfig>) => setCameraConfig(prev => ({ ...prev, ...updates }))}
        />

      </div>

      {/* Bottom toolbar */}
      <ExportPanel
        onExport={handleExport}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
        onOpenFolder={openExportFolder}
        projectList={projectList}
        onFetchProjects={handleFetchProjects}
        isExporting={isExporting}
      />

    </div>
  );
}
