/**
 * NodeCanvas.tsx — 节点画布：支持拖拽平移、缩放、连线渲染
 */
import { useCallback, useRef, useEffect, useState } from 'react';
import { useAiImageEditorStore } from './useAiImageEditorStore';
import ImageNode from './ImageNode';
import type { EditorNode } from './types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const ZOOM_SPEED = 0.001;

/** 计算两个节点间连线的 SVG 路径 (贝塞尔曲线) */
function getEdgePath(src: EditorNode, tgt: EditorNode): string {
  const NODE_WIDTH = 240;
  const sx = src.x + NODE_WIDTH; // 右侧锚点
  const sy = src.y + 112;        // 固定锚点垂直位置
  const tx = tgt.x;              // 左侧锚点
  const ty = tgt.y + 112;
  const cx = Math.abs(tx - sx) * 0.5;
  return `M ${sx} ${sy} C ${sx + cx} ${sy}, ${tx - cx} ${ty}, ${tx} ${ty}`;
}

export default function NodeCanvas() {
  const {
    nodes, edges, selectedNodeId, viewport,
    setSelectedNode, setEditingNode, updateNodePosition, removeNode,
    setViewport,
  } = useAiImageEditorStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const draggingNode = useRef<{ id: string; startX: number; startY: number; nodeX: number; nodeY: number } | null>(null);

  const [deleteNodeId, setDeleteNodeId] = useState<string | null>(null);
  const [deleteFileAlso, setDeleteFileAlso] = useState(false);

  // ─── 画布平移 ────────────────────────────────────────────
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // 中键拖拽或空白区域左键拖拽
    if (e.button === 1 || (e.button === 0 && e.target === containerRef.current)) {
      isPanning.current = true;
      panStart.current = { x: e.clientX - viewport.x, y: e.clientY - viewport.y };
      setSelectedNode(null);
    }
  }, [viewport.x, viewport.y, setSelectedNode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning.current) {
      setViewport({
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y,
      });
      return;
    }
    if (draggingNode.current) {
      const { id, startX, startY, nodeX, nodeY } = draggingNode.current;
      const dx = (e.clientX - startX) / viewport.zoom;
      const dy = (e.clientY - startY) / viewport.zoom;
      updateNodePosition(id, nodeX + dx, nodeY + dy);
    }
  }, [viewport.zoom, setViewport, updateNodePosition]);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
    draggingNode.current = null;
  }, []);

  // ─── 缩放 ────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * ZOOM_SPEED;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoom + delta));

    // 以鼠标位置为中心缩放
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
      setViewport({ zoom: newZoom });
    }
  }, [viewport, setViewport]);

  // ─── 节点拖拽 ────────────────────────────────────────────
  const handleNodeDragStart = useCallback((id: string, startX: number, startY: number) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    draggingNode.current = { id, startX, startY, nodeX: node.x, nodeY: node.y };
  }, [nodes]);

  // ─── 打开文件所在目录 ──────────────────────────────────────
  const handleOpenFolder = useCallback(async (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node?.filePath) return;
    try {
      const { dirname } = await import('@tauri-apps/api/path');
      const dir = await dirname(node.filePath);
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(dir);
    } catch (e) {
      console.error('Open folder failed:', e);
      try {
        const { Command } = await import('@tauri-apps/plugin-shell');
        const cmd = Command.create('open', ['-R', node.filePath]);
        await cmd.execute();
      } catch (e2) {
        console.error('Reveal in Finder also failed:', e2);
      }
    }
  }, [nodes]);

  // ─── 阻止默认的 wheel 被动监听 ───────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full relative overflow-hidden cursor-grab active:cursor-grabbing"
      style={{ backgroundColor: 'hsl(var(--muted) / 0.35)' }}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* 点阵 + 网格纹理背景 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(circle, hsl(var(--foreground) / 0.15) 1px, transparent 1px),
            linear-gradient(hsl(var(--foreground) / 0.05) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--foreground) / 0.05) 1px, transparent 1px)
          `,
          backgroundSize: `
            ${20 * viewport.zoom}px ${20 * viewport.zoom}px,
            ${100 * viewport.zoom}px ${100 * viewport.zoom}px,
            ${100 * viewport.zoom}px ${100 * viewport.zoom}px
          `,
          backgroundPosition: `
            ${viewport.x}px ${viewport.y}px,
            ${viewport.x}px ${viewport.y}px,
            ${viewport.x}px ${viewport.y}px
          `,
        }}
      />

      {/* 可缩放 / 平移的容器 */}
      <div
        className="absolute"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {/* 连线 SVG 层 */}
        <svg className="absolute top-0 left-0 pointer-events-none" style={{ width: 9999, height: 9999, overflow: 'visible' }}>
          {edges.map((edge) => {
            const src = nodes.find((n) => n.id === edge.sourceId);
            const tgt = nodes.find((n) => n.id === edge.targetId);
            if (!src || !tgt) return null;
            return (
              <path
                key={edge.id}
                d={getEdgePath(src, tgt)}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                strokeDasharray="none"
                opacity={0.6}
              />
            );
          })}
        </svg>

        {/* 节点层 */}
        {nodes.map((node) => (
          <ImageNode
            key={node.id}
            node={node}
            isSelected={node.id === selectedNodeId}
            onSelect={setSelectedNode}
            onDoubleClick={setEditingNode}
            onDragStart={handleNodeDragStart}
            onDelete={setDeleteNodeId}
            onStartGenerate={setEditingNode}
            onOpenFolder={handleOpenFolder}
          />
        ))}
      </div>

      {/* 底部信息栏 */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2 text-[11px] text-muted-foreground bg-card/80 border border-border px-2.5 py-1 backdrop-blur">
        <span>{Math.round(viewport.zoom * 100)}%</span>
        <span className="text-border">|</span>
        <span>{nodes.length} 个节点</span>
        <span className="text-border">|</span>
        <span>滚轮缩放 · 拖拽平移 · 双击编辑</span>
      </div>

      {/* 空状态提示 */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-muted-foreground/50">
            <div className="text-5xl mb-3">🖼️</div>
            <p className="text-sm font-medium">点击上方「添加图片」导入图片开始 P 图</p>
            <p className="text-xs mt-1">支持拖拽平移 · 滚轮缩放 · 双击节点编辑遮罩</p>
          </div>
        </div>
      )}

      {/* 删除节点确认 */}
      <Dialog open={!!deleteNodeId} onOpenChange={(open) => !open && setDeleteNodeId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除节点</DialogTitle>
            <DialogDescription>
              删除该节点及其所有后续子节点，此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 flex items-center gap-3 border-t border-b border-border my-2">
            <Switch
              checked={deleteFileAlso}
              onCheckedChange={setDeleteFileAlso}
            />
            <div className="space-y-0.5">
              <label className="text-sm font-medium">同时删除本地图片文件</label>
              <p className="text-xs text-muted-foreground">如果勾选，硬盘上对应的物理文件也会被直接删除。</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteNodeId(null)}>取消</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteNodeId) {
                  removeNode(deleteNodeId, deleteFileAlso);
                  setDeleteNodeId(null);
                  setDeleteFileAlso(false);
                }
              }}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
