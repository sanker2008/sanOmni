/**
 * LabView — Main container for the Labs tools section.
 * 
 * Provides a sidebar listing all available tools and renders the active tool.
 * This component is the only bridge between Labs and the main app shell.
 */

import { lazy, Suspense, useState, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import {
  ImageIcon,
  Scissors,
  Minimize2,
  FlaskConical,
  Wand2,
  PenTool,
  Eraser,
  HelpCircle,
  Sparkles,
  User,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const ProductImageMaker = lazy(() => import('./product-image-maker/ProductImageMaker'));
const ImageSlicer = lazy(() => import('./image-slicer/ImageSlicer'));
const AiImageEditor = lazy(() => import('./ai-image-editor/AiImageEditor'));
const ImageCompressor = lazy(() => import('./image-compressor/ImageCompressor'));
const WatermarkRemover = lazy(() => import('./watermark-remover/WatermarkRemover'));
const PngToSvg = lazy(() => import('./png-to-svg/PngToSvg'));
const PoseStudio = lazy(() => import('./pose-studio/PoseStudio'));
const GeminiWatermarkLab = lazy(() => import('./gemini-watermark-lab/GeminiWatermarkLab'));
const ProBackgroundRemoval = lazy(() => import('./pro-background-removal/ProBackgroundRemoval'));

// ─── Tool Registry ─────────────────────────────────────────

type LabToolComponent = ComponentType | LazyExoticComponent<ComponentType>;

interface LabTool {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  component: LabToolComponent | null;
  available: boolean;
  instructions?: string[];
}

const LAB_TOOLS: LabTool[] = [
  {
    id: 'pose-studio',
    name: '3D姿态参考',
    description: '摆放 3D 白膜人物，调整相机光线导出参考图',
    icon: <User className="w-4 h-4" />,
    component: PoseStudio,
    available: true,
    instructions: [
      '1. 默认包含一个基础白膜人物。你可以点击右上角 + 号添加形状或更多人物。',
      '2. 在左侧面板选中对象后，右侧属性面板可调整其位置、旋转、缩放和颜色。',
      '3. 在 3D 视图中：按住左键旋转视角，按住右键平移，滚动鼠标滚轮缩放。',
      '4. 在右侧属性面板的“环境设置”中可以调整相机 FOV，以及环境光和主光源方向颜色。',
      '5. 调整好满意的构图后，在底部设置所需图片尺寸，点击【导出参考图】即可。'
    ]
  },
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
    id: 'gemini-watermark-lab',
    name: 'Gemini 水印高级修复',
    description: '自动 profile、手动框选、alpha 微调用于一键失败兜底',
    icon: <Sparkles className="w-4 h-4" />,
    component: GeminiWatermarkLab,
    available: true,
    instructions: [
      '1. 先选择 Gemini 生成图，点击【自动处理】。自动模式会优先尝试已知 profile：1024 图的 48px / margin 96 / legacy_scale_0.60，以及大图的 96px / margin 192 / 20260520。',
      '2. 如果最近一次命中信息显示 profile=false，或 x/y 明显命中右下白底、边缘、文字等错误位置，回到原图点击【框选水印】，只框住可见 Gemini 水印区域。',
      '3. 手动模式下优先用 Auto；1024x1024 且水印在脸角、手臂等强纹理位置时可选【48px 新位置】；大图黑底残留或变深时可选【96px 新版】；旧图再尝试 Legacy。',
      '4. 白色水印没有消干净时可把 Alpha 强度略微调高；处理后发黑、变深或亮边明显时调低。每次建议只调整 5%-10%。',
      '5. 结果可靠时会显示 success && watermark_detected。只成功写出文件但 watermark_detected=false 时，不应替换正式原图，应继续手动框选或切换 profile。'
    ]
  },
  {
    id: 'pro-background-removal',
    name: '高级抠图 (Pro)',
    description: '支持表情包文本保护与精细人像发丝的高级抠图工具',
    icon: <Eraser className="w-4 h-4" />,
    component: ProBackgroundRemoval,
    available: true,
    instructions: [
      '1. 点击画布区域上传需要抠背景的图片。',
      '2. 在顶部选择抠图策略：「表情包/纯色文字」适用于纯色背景的截图、网格图；「复杂人像/发丝」适用于真实人物、动物等需要精细处理边缘的照片。',
      '3. 右侧面板提供「预设方案」，可一键应用针对不同场景（白底商品图、绿幕抠像、深色背景、发丝毛发等）优化过的参数组合。',
      '4. 可手动拖动滑块微调参数。策略 A 支持调整透明度阈值和背景颜色（支持去除任意颜色背景）；策略 B 支持调整背景亮度阈值、羽化范围、边缘平滑半径等，点击「高级参数」可展开更多选项。',
      '5. 所有参数修改会自动保存，下次打开时自动恢复上次的设置。点击「恢复默认参数」可一键还原。',
      '6. 点击「开始抠图」等待处理完成。处理完成后可用鼠标滚轮缩放、拖拽平移来检查抠图细节。',
      '7. 右侧面板底部的「画布底色」区域可切换预览背景颜色（白/黑/红/绿/蓝等或自定义颜色），方便检验抠图边缘质量。',
      '8. 点击「保存结果」导出 PNG，点击「打开目录」可直接在文件管理器中定位到保存的文件。'
    ]
  },
  {
    id: 'png-to-svg',
    name: 'PNG 转 SVG',
    description: '将位图转换为矢量图，支持参数调节。',
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
          <Suspense
            fallback={
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Loading tool...
              </div>
            }
          >
            <ActiveComponent />
          </Suspense>
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
