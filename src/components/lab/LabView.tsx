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
import ImageCompressor from './image-compressor/ImageCompressor';
import WatermarkRemover from './watermark-remover/WatermarkRemover';
import {
  ImageIcon,
  Scissors,
  Minimize2,
  FlaskConical,
  Wand2,
  PenTool,
  Eraser,
  HelpCircle,
} from 'lucide-react';
import PngToSvg from './png-to-svg/PngToSvg';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// ─── Tool Registry ─────────────────────────────────────────

interface LabTool {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  component: React.ComponentType | null;
  available: boolean;
  instructions?: string[];
}

const LAB_TOOLS: LabTool[] = [
  {
    id: 'ai-image-editor',
    name: 'AI P图',
    description: 'AI 驱动的图片编辑与遮罩涂鸦工具',
    icon: <Wand2 className="w-4 h-4" />,
    component: AiImageEditor,
    available: true,
    instructions: [
      '1. 点击上传或拖拽图片到画板区域。',
      '2. 使用画笔工具，涂抹你想要修改或擦除的区域（即创建遮罩）。',
      '3. 在下方的提示词输入框中，输入你想把遮罩区域变成什么（例如：“变成一只戴墨镜的猫”）。',
      '4. 点击生成按钮，等待 AI 处理完成即可得到新的图片。'
    ]
  },
  {
    id: 'watermark-remover',
    name: '智能去水印',
    description: '上传图片，涂抹水印区域，AI 一键无痕去除',
    icon: <Eraser className="w-4 h-4" />,
    component: WatermarkRemover,
    available: true,
    instructions: [
      '1. 导入带有水印或瑕疵的图片。',
      '2. 在右侧面板调整画笔大小。',
      '3. 仔细涂抹覆盖所有的水印或不需要的元素。',
      '4. 点击“去除”按钮，AI 会根据周围的像素自动推断并填补背景。'
    ]
  },
  {
    id: 'png-to-svg',
    name: 'PNG 转 SVG',
    description: '将位图转换为可缩放的矢量图',
    icon: <PenTool className="w-4 h-4" />,
    component: PngToSvg,
    available: true,
    instructions: [
      '1. 上传一张普通的位图（PNG/JPG等，推荐透明背景的扁平化图标或插画）。',
      '2. 在左侧面板调整“边缘平滑度”和“色彩阈值”等参数。',
      '3. 右侧画板会实时预览转换后的矢量效果。',
      '4. 调整满意后，点击导出为 SVG 文件，实现无损无限放大。'
    ]
  },
  {
    id: 'product-image-maker',
    name: '产品图制作',
    description: '创建带文字叠加的产品推广图',
    icon: <ImageIcon className="w-4 h-4" />,
    component: ProductImageMaker,
    available: true,
    instructions: [
      '1. 点击右侧图层面板的 [+图片] 或 [+文字] 按钮添加新图层。',
      '2. 在画板中直接拖拽图层来调整位置，拖动边框控制点调整大小。',
      '3. 选中图层后，在右侧属性面板可调整透明度、混合模式、文字内容及字体。',
      '4. 实用快捷键：按 Delete 快速删除选中图层；按 Ctrl+C 复制图片或文字到剪切板。',
      '5. 完成设计后，你可以选择导出为图片，或者将当前配置“保存为模板项目”以便下次复用。'
    ]
  },
  {
    id: 'image-slicer',
    name: '图片切割',
    description: '将图片按网格或自定义区域切割',
    icon: <Scissors className="w-4 h-4" />,
    component: ImageSlicer,
    available: true,
    instructions: [
      '1. 导入需要切割的长图、大图或精灵图 (Sprite)。',
      '2. 选择“网格切割”（按行数列数均分）或手动添加“自定义参考线”。',
      '3. 画板会实时显示切割线和预览效果。',
      '4. 点击一键导出，所有切割后的碎片图片会自动保存到指定的文件夹中。'
    ]
  },
  {
    id: 'image-compressor',
    name: '图片压缩',
    description: '批量压缩图片尺寸和文件大小',
    icon: <Minimize2 className="w-4 h-4" />,
    component: ImageCompressor,
    available: true,
    instructions: [
      '1. 将一批需要压缩的图片拖入或添加到列表中。',
      '2. 统一设置目标格式（如转换为 WebP 以获得更小体积）和压缩质量（1-100）。',
      '3. 根据需要选择是否缩小图片的分辨率。',
      '4. 点击开始处理，系统会快速完成批量压缩，并显示压缩率对比。'
    ]
  },
];

// ─── Component ─────────────────────────────────────────────

export default function LabView() {
  // Local state — not in global store
  const [activeToolId, setActiveToolId] = useState(LAB_TOOLS[0].id);
  const [showInstructions, setShowInstructions] = useState(false);

  const activeTool = LAB_TOOLS.find((t) => t.id === activeToolId);
  const ActiveComponent = activeTool?.component;

  return (
    <div className="h-full flex">
      {/* Sidebar — tool list */}
      <div className="w-[200px] shrink-0 border-r border-border bg-card/30 flex flex-col">
        <div className="px-3 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-primary" />
            <span className="text-base font-semibold">sanLabs 工具箱</span>
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

        {/* Info button at the bottom of the sidebar */}
        <div className="p-3 border-t border-border mt-auto">
          <Button 
            variant="outline" 
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={() => setShowInstructions(true)}
            disabled={!activeTool?.instructions}
          >
            <HelpCircle className="w-4 h-4 mr-2" />
            查看操作说明
          </Button>
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

      {/* Instructions Dialog */}
      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-primary">{activeTool?.icon}</span>
              {activeTool?.name} - 操作说明
            </DialogTitle>
            <DialogDescription>
              {activeTool?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            {activeTool?.instructions?.map((step, idx) => (
              <p key={idx} className="text-sm leading-relaxed text-foreground">
                {step}
              </p>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
