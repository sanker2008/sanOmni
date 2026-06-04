import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Guideline } from './types';
import { HelpCircle } from 'lucide-react';

interface SlicerCanvasProps {
  imageSrc: string;
  originalWidth: number;
  originalHeight: number;
  guidelines: Guideline[];
  onUpdateGuideline: (id: string, newPos: number) => void;
  onDeleteGuideline: (id: string) => void;
}

export default function SlicerCanvas({
  imageSrc,
  originalWidth,
  originalHeight,
  guidelines,
  onUpdateGuideline,
  onDeleteGuideline,
}: SlicerCanvasProps) {
  const [displayedSize, setDisplayedSize] = useState({ width: 0, height: 0 });
  const [hoveredGuideId, setHoveredGuideId] = useState<string | null>(null);
  const [draggedGuideId, setDraggedGuideId] = useState<string | null>(null);
  const [dragInfo, setDragInfo] = useState<{ startPosition: number; startMousePos: number } | null>(null);
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Recalculate rendered image dimensions to maintain exact mapping scale
  const updateDisplayedSize = useCallback(() => {
    if (imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect();
      setDisplayedSize({ width: rect.width, height: rect.height });
    }
  }, []);

  useEffect(() => {
    updateDisplayedSize();
    window.addEventListener('resize', updateDisplayedSize);
    return () => window.removeEventListener('resize', updateDisplayedSize);
  }, [updateDisplayedSize, imageSrc]);

  // Handle global keyboard delete event
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!selectedGuideId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeTag = document.activeElement?.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

        e.preventDefault();
        onDeleteGuideline(selectedGuideId);
        setSelectedGuideId(null);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [selectedGuideId, onDeleteGuideline]);

  // Automatically reset selectedGuideId if it is deleted from the external list
  useEffect(() => {
    if (selectedGuideId && !guidelines.some((g) => g.id === selectedGuideId)) {
      setSelectedGuideId(null);
    }
  }, [guidelines, selectedGuideId]);

  const handleImageLoad = () => {
    updateDisplayedSize();
    // Second trigger after a tiny delay to ensure clientRect stabilizes
    setTimeout(updateDisplayedSize, 50);
  };

  const scaleX = originalWidth > 0 ? displayedSize.width / originalWidth : 1;
  const scaleY = originalHeight > 0 ? displayedSize.height / originalHeight : 1;

  // Handle guideline drag events
  const handleMouseDown = (e: React.MouseEvent, guide: Guideline) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedGuideId(guide.id);
    setDraggedGuideId(guide.id);
    setDragInfo({
      startPosition: guide.position,
      startMousePos: guide.type === 'vertical' ? e.clientX : e.clientY,
    });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggedGuideId || !dragInfo) return;

      const guide = guidelines.find((g) => g.id === draggedGuideId);
      if (!guide) return;

      const delta =
        (guide.type === 'vertical' ? e.clientX : e.clientY) - dragInfo.startMousePos;
      const scale = guide.type === 'vertical' ? scaleX : scaleY;
      const originalLimit = guide.type === 'vertical' ? originalWidth : originalHeight;

      const rawNewPos = dragInfo.startPosition + delta / scale;
      // Allow dragging out of bounds slightly (-50px to limit + 50px) to trigger deletion
      const clampedNewPos = Math.max(-50, Math.min(originalLimit + 50, Math.round(rawNewPos)));

      onUpdateGuideline(draggedGuideId, clampedNewPos);
    },
    [draggedGuideId, dragInfo, guidelines, scaleX, scaleY, originalWidth, originalHeight, onUpdateGuideline]
  );

  const handleMouseUp = useCallback(() => {
    if (draggedGuideId) {
      const guide = guidelines.find((g) => g.id === draggedGuideId);
      if (guide) {
        const limit = guide.type === 'vertical' ? originalWidth : originalHeight;
        if (guide.position < 0 || guide.position > limit) {
          onDeleteGuideline(draggedGuideId);
          setSelectedGuideId(null);
        }
      }
    }
    setDraggedGuideId(null);
    setDragInfo(null);
  }, [draggedGuideId, guidelines, originalWidth, originalHeight, onDeleteGuideline]);

  useEffect(() => {
    if (draggedGuideId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedGuideId, handleMouseMove, handleMouseUp]);

  // Group double guidelines by pair to draw Gutter Overlays
  const gutterOverlays = React.useMemo(() => {
    const overlays: { id: string; type: 'vertical' | 'horizontal'; start: number; end: number }[] = [];
    const pairs = new Map<string, { start?: number; end?: number; type?: 'vertical' | 'horizontal' }>();

    guidelines.forEach((g) => {
      if (g.pairId && g.gutterSide) {
        if (!pairs.has(g.pairId)) {
          pairs.set(g.pairId, { type: g.type });
        }
        const data = pairs.get(g.pairId)!;
        if (g.gutterSide === 'start') data.start = g.position;
        if (g.gutterSide === 'end') data.end = g.position;
      }
    });

    pairs.forEach((val, key) => {
      if (val.start !== undefined && val.end !== undefined && val.type) {
        overlays.push({
          id: key,
          type: val.type,
          start: Math.min(val.start, val.end),
          end: Math.max(val.start, val.end),
        });
      }
    });

    return overlays;
  }, [guidelines]);

  return (
    <div
      className="flex-1 h-full bg-slate-900/40 dark:bg-black/35 flex items-center justify-center p-6 overflow-auto"
      onClick={() => setSelectedGuideId(null)}
    >
      {imageSrc ? (
        <div
          ref={containerRef}
          className="relative shadow-2xl border border-border/50 max-h-[85vh] max-w-[90%]"
        >
          {/* Main Slicer Image */}
          <img
            ref={imageRef}
            src={imageSrc}
            onLoad={handleImageLoad}
            className="block max-h-[85vh] max-w-full object-contain pointer-events-none select-none"
            alt="Slicing Source"
          />

          {/* Guidelines and Overlay Containers */}
          {displayedSize.width > 0 && displayedSize.height > 0 && (
            <div
              className="absolute inset-0 overflow-hidden pointer-events-none"
              style={{ width: displayedSize.width, height: displayedSize.height }}
            >
              {/* 1. Gutter Overlay Indicators (Discarded Spaces) */}
              {gutterOverlays.map((gutter) => {
                if (gutter.type === 'vertical') {
                  const left = gutter.start * scaleX;
                  const width = (gutter.end - gutter.start) * scaleX;
                  return (
                    <div
                      key={gutter.id}
                      className="absolute top-0 bottom-0 bg-rose-500/10 border-l border-r border-dashed border-rose-500/20"
                      style={{ left, width }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center text-[10px] text-rose-500/40 font-mono tracking-wider">
                        GAP
                      </div>
                    </div>
                  );
                } else {
                  const top = gutter.start * scaleY;
                  const height = (gutter.end - gutter.start) * scaleY;
                  return (
                    <div
                      key={gutter.id}
                      className="absolute left-0 right-0 bg-rose-500/10 border-t border-b border-dashed border-rose-500/20"
                      style={{ top, height }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center text-[10px] text-rose-500/40 font-mono tracking-wider">
                        GAP
                      </div>
                    </div>
                  );
                }
              })}

              {/* 2. Slicer Guidelines */}
              {guidelines.map((guide) => {
                const isVertical = guide.type === 'vertical';
                const pos = guide.position * (isVertical ? scaleX : scaleY);
                const isHovered = hoveredGuideId === guide.id;
                const isDragged = draggedGuideId === guide.id;
                const isSelected = selectedGuideId === guide.id;

                const limit = isVertical ? originalWidth : originalHeight;
                const isOutOfBounds = guide.position < 0 || guide.position > limit;

                // Position styles for vertical/horizontal guidelines
                const lineStyle: React.CSSProperties = isVertical
                  ? {
                      left: pos,
                      top: 0,
                      bottom: 0,
                      width: isSelected ? '2px' : '1px',
                    }
                  : {
                      top: pos,
                      left: 0,
                      right: 0,
                      height: isSelected ? '2px' : '1px',
                    };

                // Hotspot (larger invisible hover target for easy grab)
                const hotspotStyle: React.CSSProperties = isVertical
                  ? {
                      left: pos - 4,
                      top: 0,
                      bottom: 0,
                      width: '9px',
                      cursor: 'ew-resize',
                    }
                  : {
                      top: pos - 4,
                      left: 0,
                      right: 0,
                      height: '9px',
                      cursor: 'ns-resize',
                    };

                return (
                  <React.Fragment key={guide.id}>
                    {/* The Visual Guideline */}
                    <div
                      className={`absolute transition-colors pointer-events-none ${
                        isOutOfBounds
                          ? 'bg-rose-500 z-30 shadow-[0_0_8px_rgba(239,68,68,0.8)] border-rose-500'
                          : isDragged
                            ? 'bg-sky-500 z-30 shadow-[0_0_8px_rgba(14,165,233,0.8)]'
                            : isSelected
                              ? 'bg-sky-500 z-25 shadow-[0_0_10px_rgba(14,165,233,0.9)]'
                              : isHovered
                                ? 'bg-sky-400 z-20 shadow-[0_0_6px_rgba(56,189,248,0.6)]'
                                : guide.gutterSide
                                  ? 'bg-rose-500/60 border-rose-500/30'
                                  : 'bg-teal-500/80 border-teal-500/40'
                      } ${guide.isAuto && !guide.gutterSide && !isSelected && !isDragged ? 'border-dashed' : 'border-solid'}`}
                      style={lineStyle}
                    >
                      {/* Floating Coordinate Label on Drag, Hover or Select */}
                      {(isHovered || isDragged || isSelected) && (
                        <div
                          className={`absolute text-white border font-mono text-[9px] px-1.5 py-0.5 rounded shadow-md pointer-events-none z-30 flex items-center gap-1 shrink-0 whitespace-nowrap transition-colors ${
                            isOutOfBounds
                              ? 'bg-rose-950 text-rose-200 border-rose-500/40 shadow-[0_0_6px_rgba(239,68,68,0.4)]'
                              : 'bg-sky-950 text-sky-200 border-sky-500/30 shadow-[0_0_6px_rgba(14,165,233,0.3)]'
                          }`}
                          style={
                            isVertical
                              ? {
                                  left: 6,
                                  top: '8%',
                                  transform: 'translateX(0)',
                                }
                              : {
                                  left: '8%',
                                  top: 6,
                                  transform: 'translateY(0)',
                                }
                          }
                        >
                          {isOutOfBounds ? (
                            <span className="font-semibold flex items-center gap-1">🗑️ 松开以删除</span>
                          ) : (
                            <>
                              <span className="opacity-60">{isVertical ? 'X:' : 'Y:'}</span>
                              <span className="font-semibold">{guide.position}</span>
                              <span className="text-[7px] opacity-40">px</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Edge Quick Delete Button (shows on hover or select, but not while dragging) */}
                    {(isHovered || isSelected) && !isDragged && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteGuideline(guide.id);
                          setSelectedGuideId(null);
                        }}
                        onMouseEnter={() => setHoveredGuideId(guide.id)}
                        onMouseLeave={() => setHoveredGuideId(null)}
                        className="absolute z-45 w-4 h-4 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center justify-center shadow-md border border-white/20 transition-all pointer-events-auto select-none font-bold"
                        style={
                          isVertical
                            ? {
                                left: pos - 8,
                                top: 6,
                                cursor: 'pointer',
                                fontSize: '11px',
                                lineHeight: '14px',
                              }
                            : {
                                top: pos - 8,
                                left: 6,
                                cursor: 'pointer',
                                fontSize: '11px',
                                lineHeight: '14px',
                              }
                        }
                        title="删除此参考线"
                      >
                        ×
                      </button>
                    )}

                    {/* Interactive Hotspot Grab Handler */}
                    <div
                      className="absolute pointer-events-auto z-10"
                      style={hotspotStyle}
                      onMouseDown={(e) => handleMouseDown(e, guide)}
                      onMouseEnter={() => setHoveredGuideId(guide.id)}
                      onMouseLeave={() => setHoveredGuideId(null)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onDeleteGuideline(guide.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      title="双击或点击后按 Delete 键可删除"
                    />
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border/80 rounded-xl bg-card/40 max-w-md text-center">
          <HelpCircle className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <p className="text-sm font-medium">尚未加载图片</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            请在右侧边栏中上传或选择一张图片以添加参考线并进行切割。
          </p>
        </div>
      )}
    </div>
  );
}
