import { useState, useRef, useEffect } from 'react';
import type { CanvasNodeDef, CanvasEdgeDef, Viewport, WorkflowDef, ExecutionProgress } from './types';
import CanvasNode, { NODE_WIDTH } from './CanvasNode';
import CanvasToolbar from './CanvasToolbar';
import CanvasToolSidebar from './CanvasToolSidebar';
import CanvasStatusBar from './CanvasStatusBar';
import { loadWorkflows, saveWorkflow, exportResults } from './fs';
import { WorkflowEngine } from './engine';
import { useToast } from '@/hooks/useToast';
import { getAdapter } from './adapters';

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3.0;
const ZOOM_SPEED = 0.001;

function getEdgePath(src: CanvasNodeDef, tgt: CanvasNodeDef): string {
  const sx = src.x + NODE_WIDTH;
  const sy = src.y + 24;
  const tx = tgt.x;
  const ty = tgt.y + 24;
  const cx = Math.max(40, Math.abs(tx - sx) * 0.5);
  return `M ${sx} ${sy} C ${sx + cx} ${sy}, ${tx - cx} ${ty}, ${tx} ${ty}`;
}

export default function CustomWorkflow() {
  const { toast } = useToast();

  // Workflow State
  const [projectId, setProjectId] = useState<string>(`wf_${Date.now()}`);
  const [projectName, setProjectName] = useState<string>('未命名项目');
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [savedWorkflows, setSavedWorkflows] = useState<WorkflowDef[]>([]);

  // Graph State
  const [nodes, setNodes] = useState<CanvasNodeDef[]>([]);
  const [edges, setEdges] = useState<CanvasEdgeDef[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Viewport State
  const [viewport, setViewport] = useState<Viewport>({ x: 100, y: 100, zoom: 1 });

  // Execution State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [executionProgress, setExecutionProgress] = useState<ExecutionProgress | null>(null);
  const engineRef = useRef<WorkflowEngine | null>(null);

  // Canvas Interactions
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const draggingNode = useRef<{ id: string; startX: number; startY: number; nodeX: number; nodeY: number } | null>(null);

  // Active Connection Drawing
  const [connecting, setConnecting] = useState<{ sourceNodeId: string; mouseX: number; mouseY: number } | null>(null);

  // Load saved workflows on mount
  useEffect(() => {
    loadWorkflows().then(setSavedWorkflows).catch(console.error);
  }, []);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          handleDeleteNode(selectedNodeId);
        } else if (selectedEdgeId) {
          handleDeleteEdge(selectedEdgeId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, selectedEdgeId]);

  // Mark unsaved on modifications
  const markDirty = () => setIsSaved(false);

  // ─── Add Nodes ───────────────────────────────────────────────

  const addInputNode = () => {
    const newNode: CanvasNodeDef = {
      id: `node_input_${Date.now()}`,
      type: 'input',
      adapterId: 'input-image',
      x: 100 - viewport.x / viewport.zoom,
      y: 150 - viewport.y / viewport.zoom,
      config: {},
      inputPaths: [],
      status: 'idle',
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    markDirty();
  };

  const addAdapterNode = (adapterId: string) => {
    const adapter = getAdapter(adapterId);
    const defaultConfig: Record<string, any> = {};
    if (adapter) {
      for (const field of adapter.configSchema) {
        defaultConfig[field.key] = field.defaultValue;
      }
    }

    const newNode: CanvasNodeDef = {
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'tool',
      adapterId,
      x: (nodes.length * 40 + 200 - viewport.x) / viewport.zoom,
      y: (nodes.length * 40 + 150 - viewport.y) / viewport.zoom,
      config: defaultConfig,
      status: 'idle',
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    markDirty();
  };

  // ─── Delete & Clear ──────────────────────────────────────────

  const handleDeleteNode = (id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.sourceNodeId !== id && e.targetNodeId !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
    markDirty();
  };

  const handleDeleteEdge = (id: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== id));
    if (selectedEdgeId === id) setSelectedEdgeId(null);
    markDirty();
  };

  const handleClear = () => {
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    markDirty();
  };

  const handleAutoArrange = () => {
    if (nodes.length === 0) return;
    const startX = 100;
    const startY = 120;
    const spacingX = 320;
    const spacingY = 220;

    const arranged = nodes.map((node, i) => ({
      ...node,
      x: startX + (i % 3) * spacingX,
      y: startY + Math.floor(i / 3) * spacingY,
    }));
    setNodes(arranged);
    markDirty();
  };

  // ─── Config & File Setters ─────────────────────────────────

  const handleConfigChange = (nodeId: string, key: string, value: any) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, config: { ...n.config, [key]: value } } : n))
    );
    markDirty();
  };

  const handleSetInputPaths = (nodeId: string, paths: string[]) => {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, inputPaths: paths } : n)));
    markDirty();
  };

  // ─── Canvas Pan & Zoom ─────────────────────────────────────

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.target === containerRef.current)) {
      isPanning.current = true;
      panStart.current = { x: e.clientX - viewport.x, y: e.clientY - viewport.y };
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning.current) {
      setViewport((v) => ({
        ...v,
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y,
      }));
      return;
    }

    if (draggingNode.current) {
      const { id, startX, startY, nodeX, nodeY } = draggingNode.current;
      const dx = (e.clientX - startX) / viewport.zoom;
      const dy = (e.clientY - startY) / viewport.zoom;
      setNodes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, x: nodeX + dx, y: nodeY + dy } : n))
      );
      markDirty();
      return;
    }

    if (connecting && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const cx = (e.clientX - rect.left - viewport.x) / viewport.zoom;
      const cy = (e.clientY - rect.top - viewport.y) / viewport.zoom;
      setConnecting({ ...connecting, mouseX: cx, mouseY: cy });
    }
  };

  const handleMouseUp = () => {
    isPanning.current = false;
    draggingNode.current = null;
    if (connecting) setConnecting(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * ZOOM_SPEED;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoom + delta));

    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const scale = newZoom / viewport.zoom;
      setViewport({
        zoom: newZoom,
        x: mx - (mx - viewport.x) * scale,
        y: my - (my - viewport.y) * scale,
      });
    } else {
      setViewport((v) => ({ ...v, zoom: newZoom }));
    }
  };

  // ─── Node Drag Handle ──────────────────────────────────────

  const handleNodeDragStart = (id: string, e: React.MouseEvent) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    draggingNode.current = { id, startX: e.clientX, startY: e.clientY, nodeX: node.x, nodeY: node.y };
  };

  // ─── Connection Line Handlers ──────────────────────────────

  const handleStartConnection = (nodeId: string, _portType: 'output', e: React.MouseEvent) => {
    const srcNode = nodes.find((n) => n.id === nodeId);
    if (!srcNode || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = (e.clientX - rect.left - viewport.x) / viewport.zoom;
    const cy = (e.clientY - rect.top - viewport.y) / viewport.zoom;
    setConnecting({ sourceNodeId: nodeId, mouseX: cx, mouseY: cy });
  };

  const handleEndConnection = (targetNodeId: string, _portType: 'input') => {
    if (!connecting) return;
    if (connecting.sourceNodeId === targetNodeId) {
      setConnecting(null);
      return;
    }

    // Avoid duplicate edges
    const exists = edges.some(
      (e) => e.sourceNodeId === connecting.sourceNodeId && e.targetNodeId === targetNodeId
    );

    if (!exists) {
      const newEdge: CanvasEdgeDef = {
        id: `edge_${Date.now()}`,
        sourceNodeId: connecting.sourceNodeId,
        targetNodeId,
      };
      setEdges((prev) => [...prev, newEdge]);
      markDirty();
    }
    setConnecting(null);
  };

  // ─── Project Persistence ───────────────────────────────────

  const handleSave = async () => {
    const workflow: WorkflowDef = {
      id: projectId,
      name: projectName,
      description: `包含 ${nodes.length} 个节点的图算管道`,
      nodes,
      edges,
      viewport,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await saveWorkflow(workflow);
      setIsSaved(true);
      const updated = await loadWorkflows();
      setSavedWorkflows(updated);
      toast({ title: '保存成功', description: `项目 "${projectName}" 已保存` });
    } catch (e: any) {
      toast({ title: '保存失败', description: e.message, variant: 'destructive' });
    }
  };

  const handleLoadProject = (wf: WorkflowDef) => {
    setProjectId(wf.id);
    setProjectName(wf.name);
    setNodes(wf.nodes || []);
    setEdges(wf.edges || []);
    if (wf.viewport) setViewport(wf.viewport);
    setIsSaved(true);
    toast({ title: '已载入项目', description: wf.name });
  };

  // ─── Graph Execution ───────────────────────────────────────

  const handleRun = async () => {
    if (nodes.length === 0) {
      toast({ title: '画布为空', description: '请先添加节点并连接', variant: 'destructive' });
      return;
    }

    setIsRunning(true);
    engineRef.current = new WorkflowEngine();
    const execId = crypto.randomUUID();

    try {
      const result = await engineRef.current.execute(nodes, edges, execId, (progress) => {
        setExecutionProgress(progress);
        // Update nodes UI status live
        setNodes((prev) =>
          prev.map((n) => {
            const prog = progress.nodeProgress[n.id];
            if (prog) {
              return {
                ...n,
                status: prog.status,
                outputPreview: prog.outputPreview,
                outputPaths: prog.outputPaths,
                durationMs: prog.durationMs,
                error: prog.error,
              };
            }
            return n;
          })
        );
      });

      setIsRunning(false);
      if (result.success) {
        toast({
          title: '工作流运行成功！',
          description: `管道已执行完成，耗时 ${result.totalDurationMs}ms`,
        });
        if (result.finalOutputPaths.length > 0) {
          await exportResults(result.finalOutputPaths, projectName);
        }
      } else {
        toast({ title: '运行中断', description: result.error, variant: 'destructive' });
      }
    } catch (err: any) {
      setIsRunning(false);
      toast({ title: '运行失败', description: err.message, variant: 'destructive' });
    }
  };

  const handleRunSingleNode = async (nodeId: string) => {
    const targetNode = nodes.find((n) => n.id === nodeId);
    if (!targetNode) return;

    setIsRunning(true);
    engineRef.current = new WorkflowEngine();
    const execId = crypto.randomUUID();

    try {
      const result = await engineRef.current.executeSingleNode(
        nodeId,
        nodes,
        edges,
        execId,
        (progress) => {
          setExecutionProgress(progress);
          setNodes((prev) =>
            prev.map((n) => {
              const prog = progress.nodeProgress[n.id];
              if (prog) {
                return {
                  ...n,
                  status: prog.status,
                  outputPreview: prog.outputPreview,
                  outputPaths: prog.outputPaths,
                  durationMs: prog.durationMs,
                  error: prog.error,
                };
              }
              return n;
            })
          );
        }
      );

      setIsRunning(false);
      if (result.success) {
        toast({
          title: '节点单独运行成功',
          description: `耗时 ${result.totalDurationMs}ms`,
        });
      } else {
        toast({ title: '节点运行失败', description: result.error, variant: 'destructive' });
      }
    } catch (err: any) {
      setIsRunning(false);
      toast({ title: '运行异常', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Top Header Toolbar */}
      <CanvasToolbar
        projectName={projectName}
        isSaved={isSaved}
        isRunning={isRunning}
        savedWorkflows={savedWorkflows}
        onProjectNameChange={(name) => {
          setProjectName(name);
          markDirty();
        }}
        onClear={handleClear}
        onAutoArrange={handleAutoArrange}
        onAddInputNode={addInputNode}
        onSave={handleSave}
        onRun={handleRun}
        onLoadProject={handleLoadProject}
      />

      {/* Center Infinite Canvas & Sidebar */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Tool Palette Sidebar */}
        <CanvasToolSidebar onAddAdapterNode={addAdapterNode} />

        {/* Infinite Dot Grid Canvas Container */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden bg-[#faf8f3] dark:bg-[#121110] cursor-grab active:cursor-grabbing select-none"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(120, 113, 108, 0.25) 1px, transparent 1px)`,
            backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
            backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
        >
          {/* Scaled & Translated Canvas Content Layer */}
          <div
            className="absolute inset-0 origin-top-left pointer-events-none"
            style={{
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            }}
          >
            {/* SVG Curved Connections Layer */}
            <svg className="absolute inset-0 w-[10000px] h-[10000px] pointer-events-none overflow-visible">
              {edges.map((edge) => {
                const srcNode = nodes.find((n) => n.id === edge.sourceNodeId);
                const tgtNode = nodes.find((n) => n.id === edge.targetNodeId);
                if (!srcNode || !tgtNode) return null;

                const pathD = getEdgePath(srcNode, tgtNode);
                const isSelected = selectedEdgeId === edge.id;

                return (
                  <path
                    key={edge.id}
                    d={pathD}
                    fill="none"
                    stroke={isSelected ? '#0891b2' : 'rgba(120, 113, 108, 0.5)'}
                    strokeWidth={isSelected ? 3 : 2}
                    strokeDasharray={isSelected ? '6,3' : undefined}
                    className="pointer-events-stroke hover:stroke-cyan-500 cursor-pointer transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEdgeId(edge.id);
                    }}
                  />
                );
              })}

              {/* Active Connection Line while dragging */}
              {connecting && (
                (() => {
                  const srcNode = nodes.find((n) => n.id === connecting.sourceNodeId);
                  if (!srcNode) return null;
                  const sx = srcNode.x + NODE_WIDTH;
                  const sy = srcNode.y + 24;
                  const tx = connecting.mouseX;
                  const ty = connecting.mouseY;
                  const cx = Math.max(40, Math.abs(tx - sx) * 0.5);
                  const pathD = `M ${sx} ${sy} C ${sx + cx} ${sy}, ${tx - cx} ${ty}, ${tx} ${ty}`;
                  return (
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#0891b2"
                      strokeWidth={2.5}
                      strokeDasharray="4,4"
                      className="animate-pulse"
                    />
                  );
                })()
              )}
            </svg>

            {/* Nodes Layer */}
            <div className="pointer-events-auto">
              {nodes.map((node) => (
                <CanvasNode
                  key={node.id}
                  node={node}
                  isSelected={selectedNodeId === node.id}
                  progress={executionProgress?.nodeProgress[node.id]}
                  onSelect={(id) => {
                    setSelectedNodeId(id);
                    setSelectedEdgeId(null);
                  }}
                  onDragStart={handleNodeDragStart}
                  onDelete={handleDeleteNode}
                  onRunNode={handleRunSingleNode}
                  onConfigChange={handleConfigChange}
                  onSetInputPaths={handleSetInputPaths}
                  onStartConnection={handleStartConnection}
                  onEndConnection={handleEndConnection}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <CanvasStatusBar
        viewport={viewport}
        nodeCount={nodes.length}
        edgeCount={edges.length}
        onZoomIn={() => setViewport((v) => ({ ...v, zoom: Math.min(MAX_ZOOM, v.zoom + 0.15) }))}
        onZoomOut={() => setViewport((v) => ({ ...v, zoom: Math.max(MIN_ZOOM, v.zoom - 0.15) }))}
        onResetZoom={() => setViewport({ x: 100, y: 100, zoom: 1 })}
      />
    </div>
  );
}
