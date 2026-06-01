/**
 * LayerPanel — Layer list management for the product image maker.
 * 
 * Shows all layers, supports selection, visibility toggle, reorder, and delete.
 * Uses mouse-event-based drag (not HTML5 Drag API) for Tauri WebView2 compatibility.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { Layer } from './types';
import {
  Type,
  ImageIcon,
  Eye,
  EyeOff,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Plus,
  ImagePlus,
  Lock,
  Unlock,
  Square,
  Circle,
  Triangle,
  GripVertical,
} from 'lucide-react';

interface LayerPanelProps {
  layers: Layer[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onRemoveLayer: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onReorderLayers: (fromIndex: number, toIndex: number) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onAddTextLayer: () => void;
  onAddImageLayer: () => void;
  onAddShapeLayer: () => void;
}

export default function LayerPanel({
  layers,
  selectedLayerId,
  onSelectLayer,
  onToggleVisibility,
  onToggleLock,
  onRemoveLayer,
  onDuplicateLayer,
  onReorderLayers,
  onMoveUp,
  onMoveDown,
  onAddTextLayer,
  onAddImageLayer,
  onAddShapeLayer,
}: LayerPanelProps) {
  // --- Mouse-based drag state ---
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const draggedRealIndexRef = useRef<number | null>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const listRef = useRef<HTMLDivElement>(null);

  const getLayerPreview = (layer: Layer): string => {
    if (layer.type === 'text') {
      const text = layer.content || '空文本';
      return text.length > 16 ? text.slice(0, 16) + '…' : text;
    }
    if (layer.type === 'shape') {
      if (layer.shapeType === 'circle') return '圆形';
      if (layer.shapeType === 'triangle') return '三角形';
      return '矩形';
    }
    const name = layer.filename || '图片';
    return name.length > 16 ? name.slice(0, 16) + '…' : name;
  };

  // Calculate which reversed index the mouse is currently over
  const getDropTarget = useCallback((clientY: number): number | null => {
    if (!listRef.current) return null;
    const children = listRef.current.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      const rect = child.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        // This is reversed index i, convert to realIndex
        return layers.length - 1 - i;
      }
    }
    return null;
  }, [layers.length]);

  const handleGripMouseDown = useCallback((e: React.MouseEvent, realIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    dragStartYRef.current = e.clientY;
    draggedRealIndexRef.current = realIndex;
    setDraggedIndex(realIndex);
    setDropTargetIndex(null);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || draggedRealIndexRef.current === null) return;
      
      const target = getDropTarget(e.clientY);
      if (target !== null && target !== draggedRealIndexRef.current) {
        setDropTargetIndex(target);
      } else if (target === draggedRealIndexRef.current) {
        setDropTargetIndex(null);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      
      const fromIndex = draggedRealIndexRef.current;
      const target = getDropTarget(e.clientY);
      
      if (fromIndex !== null && target !== null && fromIndex !== target) {
        onReorderLayers(fromIndex, target);
      }
      
      draggedRealIndexRef.current = null;
      setDraggedIndex(null);
      setDropTargetIndex(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [getDropTarget, onReorderLayers]);

  return (
    <div className="flex flex-col h-full">
      {/* Header with add buttons */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          图层
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onAddTextLayer()}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-primary/10 text-primary hover:bg-primary/20 rounded transition-colors"
            title="添加文字层"
          >
            <Plus className="w-3 h-3" />
            <Type className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onAddImageLayer}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-primary/10 text-primary hover:bg-primary/20 rounded transition-colors"
            title="添加图片层"
          >
            <Plus className="w-3 h-3" />
            <ImagePlus className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => onAddShapeLayer()}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-primary/10 text-primary hover:bg-primary/20 rounded transition-colors"
            title="添加形状层"
          >
            <Plus className="w-3 h-3" />
            <Square className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Layer list (reverse order — top layer first) */}
      <div 
        ref={listRef}
        className="space-y-0.5 overflow-y-auto pb-4 flex-1 custom-scrollbar"
      >
        {layers.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            暂无图层，点击上方按钮添加
          </div>
        ) : (
          [...layers].reverse().map((layer, reversedIndex) => {
            const realIndex = layers.length - 1 - reversedIndex;
            const isSelected = layer.id === selectedLayerId;
            const isDragged = draggedIndex === realIndex;
            const isDropTarget = dropTargetIndex === realIndex;

            return (
              <div
                key={layer.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(realIndex, el);
                  else itemRefs.current.delete(realIndex);
                }}
                className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors select-none ${
                  isSelected
                    ? 'bg-primary/10 ring-1 ring-primary/30'
                    : 'hover:bg-muted/50'
                } ${
                  isDropTarget
                    ? draggedIndex !== null && draggedIndex < realIndex
                      ? 'border-t-2 border-t-primary'
                      : 'border-b-2 border-b-primary'
                    : 'border-t-2 border-b-2 border-transparent'
                } ${isDragged ? 'opacity-40 bg-muted/30' : ''}`}
                onClick={() => {
                  if (!isDraggingRef.current) onSelectLayer(layer.id);
                }}
              >
                {/* Drag handle */}
                <span 
                  className="text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing flex items-center"
                  onMouseDown={(e) => handleGripMouseDown(e, realIndex)}
                >
                  <GripVertical className="w-3.5 h-3.5 mr-1 opacity-20 group-hover:opacity-100 transition-opacity" />
                  {layer.type === 'text' ? (
                    <Type className="w-3.5 h-3.5" />
                  ) : layer.type === 'shape' ? (
                    layer.shapeType === 'circle' ? <Circle className="w-3.5 h-3.5" /> : 
                    layer.shapeType === 'triangle' ? <Triangle className="w-3.5 h-3.5" /> : 
                    <Square className="w-3.5 h-3.5" />
                  ) : (
                    <ImageIcon className="w-3.5 h-3.5" />
                  )}
                </span>

                <span
                  className={`flex-1 text-xs truncate flex items-center gap-1 ${
                    !layer.visible ? 'text-muted-foreground line-through' : ''
                  }`}
                >
                  {getLayerPreview(layer)}
                  {layer.locked && <Lock className="w-3 h-3 text-muted-foreground ml-1" />}
                </span>

                {/* Actions (visible on hover or when selected) */}
                <div className={`flex items-center gap-0.5 ${isSelected ? 'visible' : 'invisible group-hover:visible'}`}>
                  {/* Lock */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id); }}
                    className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                    title={layer.locked ? '解锁' : '锁定'}
                  >
                    {layer.locked ? (
                      <Lock className="w-3 h-3 text-amber-500" />
                    ) : (
                      <Unlock className="w-3 h-3" />
                    )}
                  </button>
                  {/* Move up/down */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onMoveUp(layer.id); }}
                    className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                    title="上移"
                    disabled={realIndex === layers.length - 1}
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onMoveDown(layer.id); }}
                    className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                    title="下移"
                    disabled={realIndex === 0}
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>

                  {/* Visibility */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id); }}
                    className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                    title={layer.visible ? '隐藏' : '显示'}
                  >
                    {layer.visible ? (
                      <Eye className="w-3 h-3" />
                    ) : (
                      <EyeOff className="w-3 h-3" />
                    )}
                  </button>

                  {/* Duplicate */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDuplicateLayer(layer.id); }}
                    className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
                    title="复制图层"
                  >
                    <Copy className="w-3 h-3" />
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemoveLayer(layer.id); }}
                    className="p-0.5 text-muted-foreground hover:text-destructive rounded transition-colors"
                    title="删除图层"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
