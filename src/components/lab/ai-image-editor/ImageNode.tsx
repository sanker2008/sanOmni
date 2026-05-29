/**
 * ImageNode.tsx — 节点画布中的单个图片节点
 */
import { memo, useCallback, useRef, useState } from 'react';
import type { EditorNode } from './types';
import { Sparkles, ImageIcon, Trash2, Paintbrush, Copy, MoreHorizontal, FolderOpen } from 'lucide-react';

interface ImageNodeProps {
  node: EditorNode;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDoubleClick: (id: string) => void;
  onDragStart: (id: string, startX: number, startY: number) => void;
  onDelete: (id: string) => void;
  onStartGenerate: (id: string) => void;
  onOpenFolder: (id: string) => void;
}

const NODE_WIDTH = 240;
const THUMB_HEIGHT = 160;

export default memo(function ImageNode({
  node,
  isSelected,
  onSelect,
  onDoubleClick,
  onDragStart,
  onDelete,
  onStartGenerate,
  onOpenFolder,
}: ImageNodeProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      onSelect(node.id);
      onDragStart(node.id, e.clientX, e.clientY);
    },
    [node.id, onSelect, onDragStart],
  );

  const handleDblClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDoubleClick(node.id);
    },
    [node.id, onDoubleClick],
  );

  const isSource = node.type === 'source';
  const hasPath = !!node.filePath;

  return (
    <div
      className={`absolute select-none group`}
      style={{
        left: node.x,
        top: node.y,
        width: NODE_WIDTH,
        zIndex: isSelected ? 10 : 1,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDblClick}
    >
      <div
        className={`rounded-none border-2 transition-colors bg-card shadow-lg overflow-hidden ${
          isSelected
            ? 'border-primary shadow-primary/20'
            : 'border-border hover:border-primary/50'
        }`}
      >
        {/* 头部标签 */}
        <div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/50 border-b border-border">
          <div className="flex items-center gap-1.5 min-w-0">
            {isSource ? (
              <ImageIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            )}
            <span className="text-xs font-medium truncate">{node.label}</span>
          </div>

          {/* 右侧操作菜单 */}
          <div className="relative">
            <button
              type="button"
              className="p-0.5 rounded hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            >
              <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {showMenu && (
              <div
                ref={menuRef}
                className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border shadow-lg py-1 min-w-[160px]"
                onMouseLeave={() => setShowMenu(false)}
              >
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                  onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDoubleClick(node.id); }}
                >
                  <Paintbrush className="w-3.5 h-3.5" />
                  编辑遮罩 & 生成
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                  onClick={(e) => { e.stopPropagation(); setShowMenu(false); onStartGenerate(node.id); }}
                >
                  <Copy className="w-3.5 h-3.5" />
                  以此为基础生成
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!hasPath}
                  onClick={(e) => { e.stopPropagation(); setShowMenu(false); onOpenFolder(node.id); }}
                  title={!hasPath ? "拖拽导入或未保存的节点无法获取物理路径" : undefined}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  打开所在目录
                </button>
                <div className="border-t border-border my-1" />
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDelete(node.id); }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  删除节点
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 图片缩略图 */}
        <div className="relative bg-muted/30" style={{ height: THUMB_HEIGHT }}>
          {node.isGenerating ? (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-muted-foreground">生成中...</span>
              </div>
            </div>
          ) : (
            <img
              src={node.thumbnailData || node.imageData}
              alt={node.label}
              className="w-full h-full object-contain"
              draggable={false}
            />
          )}
          {node.error && (
            <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-destructive/90 text-destructive-foreground text-[10px] truncate">
              {node.error}
            </div>
          )}
        </div>

        {/* Prompt 预览 */}
        {node.prompt && (
          <div className="px-2.5 py-1.5 border-t border-border">
            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-tight">{node.prompt}</p>
          </div>
        )}

        {/* 连接锚点 */}
        {/* 左侧输入锚点 (仅 generated 节点) */}
        {!isSource && (
          <div
            className="absolute left-0 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-card"
            style={{ top: 112, zIndex: 20 }}
          />
        )}
        {/* 右侧输出锚点 */}
        <div
          className="absolute right-0 translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-card"
          style={{ top: 112, zIndex: 20 }}
        />
      </div>
    </div>
  );
});

