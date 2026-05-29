/**
 * LabView — Main container for the Labs tools section.
 * 
 * Provides a sidebar listing all available tools and renders the active tool.
 * This component is the only bridge between Labs and the main app shell.
 */

import { useState } from 'react';
import ProductImageMaker from './product-image-maker/ProductImageMaker';
import ImageSlicer from './image-slicer/ImageSlicer';
import AiImageEditor from './ai-image-editor/AiImageEditor';
import {
  ImageIcon,
  Scissors,
  Minimize2,
  FlaskConical,
  Wand2,
} from 'lucide-react';

// ─── Tool Registry ─────────────────────────────────────────

interface LabTool {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  component: React.ComponentType | null;
  available: boolean;
}

const LAB_TOOLS: LabTool[] = [
  {
    id: 'ai-image-editor',
    name: 'AI P图',
    description: 'AI 驱动的图片编辑与遮罩涂鸦工具',
    icon: <Wand2 className="w-4 h-4" />,
    component: AiImageEditor,
    available: true,
  },
  {
    id: 'product-image-maker',
    name: '产品图制作',
    description: '创建带文字叠加的产品推广图',
    icon: <ImageIcon className="w-4 h-4" />,
    component: ProductImageMaker,
    available: true,
  },
  {
    id: 'image-slicer',
    name: '图片切割',
    description: '将图片按网格或自定义区域切割',
    icon: <Scissors className="w-4 h-4" />,
    component: ImageSlicer,
    available: true,
  },
  {
    id: 'image-compressor',
    name: '图片压缩',
    description: '批量压缩图片尺寸和文件大小',
    icon: <Minimize2 className="w-4 h-4" />,
    component: null,
    available: false,
  },
];

// ─── Component ─────────────────────────────────────────────

export default function LabView() {
  // Local state — not in global store
  const [activeToolId, setActiveToolId] = useState(LAB_TOOLS[0].id);

  const activeTool = LAB_TOOLS.find((t) => t.id === activeToolId);
  const ActiveComponent = activeTool?.component;

  return (
    <div className="h-full flex">
      {/* Sidebar — tool list */}
      <div className="w-[200px] shrink-0 border-r border-border bg-card/30 flex flex-col">
        <div className="px-3 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-primary" />
            <span className="text-base font-semibold">Labs 工具箱</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {LAB_TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => tool.available && setActiveToolId(tool.id)}
              disabled={!tool.available}
              className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors ${
                tool.id === activeToolId
                  ? 'bg-primary/10 text-primary'
                  : tool.available
                    ? 'hover:bg-muted/50 text-foreground'
                    : 'text-muted-foreground/40 cursor-not-allowed'
              }`}
            >
              <span className={`mt-0.5 shrink-0 ${
                tool.id === activeToolId ? 'text-primary' : tool.available ? 'text-muted-foreground' : 'text-muted-foreground/40'
              }`}>
                {tool.icon}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  {tool.name}
                  {!tool.available && (
                    <span className="text-[10px] bg-muted/50 text-muted-foreground px-1 py-0.5 rounded">
                      Soon
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-tight">
                  {tool.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main content — active tool */}
      <div className="flex-1 overflow-hidden">
        {ActiveComponent ? (
          <ActiveComponent />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">该工具即将推出</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
