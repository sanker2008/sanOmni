import React, { useState } from 'react';
import { Upload, Download, RefreshCw, FolderOpen, Image as ImageIcon, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/useToast';
import { saveSvg, openOutputFolder } from './fs';
// @ts-ignore
import ImageTracer from 'imagetracerjs';

export default function PngToSvg() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  
  // Settings
  const [colors, setColors] = useState([16]);
  const [blurRadius, setBlurRadius] = useState([1]);
  const [pathOmit, setPathOmit] = useState([8]);
  const [ltres, setLtres] = useState([1]);
  const [qtres, setQtres] = useState([1]);
  const [rightAngleEnhance, setRightAngleEnhance] = useState(true);
  const [minColorRatio, setMinColorRatio] = useState([0.02]);
  const [colorQuantCycles, setColorQuantCycles] = useState([3]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setImageUrl(url);
      setSvgContent(null);
    }
  };

  const processImage = () => {
    if (!imageUrl) return;
    setIsProcessing(true);
    setSvgContent(null);

    // imagetracerjs processing is synchronous but taking time, use timeout to allow UI update
    setTimeout(() => {
      try {
        const options = {
          numberofcolors: colors[0],
          mincolorratio: minColorRatio[0],
          colorquantcycles: colorQuantCycles[0],
          blurradius: blurRadius[0],
          pathomit: pathOmit[0],
          ltres: ltres[0],
          qtres: qtres[0],
          rightangleenhance: rightAngleEnhance,
          viewbox: true,
          scale: 1,
        };
        
        ImageTracer.imageToSVG(
          imageUrl,
          (svgstr: string) => {
            setSvgContent(svgstr);
            setIsProcessing(false);
          },
          options
        );
      } catch (err) {
        console.error(err);
        toast({
          title: '转换失败',
          description: String(err),
          variant: 'destructive',
        });
        setIsProcessing(false);
      }
    }, 100);
  };

  const handleSave = async () => {
    if (!svgContent || !selectedFile) return;
    try {
      const name = selectedFile.name.replace(/\.[^/.]+$/, "") + '.svg';
      const path = await saveSvg(svgContent, name);
      toast({
        title: '保存成功',
        description: `文件已保存至: ${path}`,
      });
    } catch (err) {
      toast({
        title: '保存失败',
        description: String(err),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h2 className="text-lg font-semibold">PNG 转 SVG</h2>
          <p className="text-sm text-muted-foreground">将位图转换为矢量图，支持参数调节。</p>
        </div>
        <div className="flex gap-2">
          {svgContent && (
            <Button onClick={handleSave} className="gap-2">
              <Download className="w-4 h-4" /> 导出 SVG
            </Button>
          )}
          <Button variant="outline" onClick={openOutputFolder} className="gap-2">
            <FolderOpen className="w-4 h-4" /> 输出目录
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar settings */}
        <div className="w-72 border-r p-4 overflow-y-auto space-y-6">
          <div className="space-y-4">
            <h3 className="font-medium">1. 选择图片</h3>
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <input
                type="file"
                accept="image/png, image/jpeg, image/webp"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                onChange={handleFileChange}
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium">2. 调整参数</h3>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm">颜色数量</label>
                  <Tooltip>
                    <TooltipTrigger type="button" tabIndex={-1} className="cursor-help">
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/70 hover:text-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-xs">
                      设置最终矢量图中包含的颜色总数。数值过低可能导致颜色合并错误或背景变灰，建议从 16 开始尝试。
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-sm text-muted-foreground">{colors[0]}</span>
              </div>
              <Slider value={colors} onValueChange={setColors} min={2} max={64} step={1} />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm">颜色合并过滤 (Min Color Ratio)</label>
                  <Tooltip>
                    <TooltipTrigger type="button" tabIndex={-1} className="cursor-help">
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/70 hover:text-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-xs">
                      丢弃占比小于该比例的颜色，将其合并到相近的主色中。对于消除抗锯齿灰边非常有效。数值越大合并越多。
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-sm text-muted-foreground">{minColorRatio[0]}</span>
              </div>
              <Slider value={minColorRatio} onValueChange={setMinColorRatio} min={0} max={0.1} step={0.01} />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm">色彩分析循环 (Quant Cycles)</label>
                  <Tooltip>
                    <TooltipTrigger type="button" tabIndex={-1} className="cursor-help">
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/70 hover:text-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-xs">
                      色彩量化的迭代次数。数值越高，找出的主色越精准。
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-sm text-muted-foreground">{colorQuantCycles[0]}</span>
              </div>
              <Slider value={colorQuantCycles} onValueChange={setColorQuantCycles} min={1} max={10} step={1} />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm">平滑度 (Blur Radius)</label>
                  <Tooltip>
                    <TooltipTrigger type="button" tabIndex={-1} className="cursor-help">
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/70 hover:text-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-xs">
                      追踪前对原图进行模糊预处理，以减少噪点。对于边缘需要锐利的 Logo 或文字，必须设为 0。
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-sm text-muted-foreground">{blurRadius[0]}</span>
              </div>
              <Slider value={blurRadius} onValueChange={setBlurRadius} min={0} max={5} step={1} />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm">杂点过滤 (Path Omit)</label>
                  <Tooltip>
                    <TooltipTrigger type="button" tabIndex={-1} className="cursor-help">
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/70 hover:text-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-xs">
                      过滤掉面积较小的色块或路径。如果图片中的细节（如小窗户、细线）丢失，请将此数值调低。
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-sm text-muted-foreground">{pathOmit[0]}</span>
              </div>
              <Slider value={pathOmit} onValueChange={setPathOmit} min={0} max={20} step={1} />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm">直线平滑 (L-threshold)</label>
                  <Tooltip>
                    <TooltipTrigger type="button" tabIndex={-1} className="cursor-help">
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/70 hover:text-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-xs">
                      直线拟合容忍度。数值越高，生成的长直线越直越平滑；数值越低，越会保留原本位图像素网格的坑洼感。
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-sm text-muted-foreground">{ltres[0]}</span>
              </div>
              <Slider value={ltres} onValueChange={setLtres} min={0.5} max={10} step={0.5} />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <div className="flex items-center gap-1.5">
                  <label className="text-sm">曲线平滑 (Q-threshold)</label>
                  <Tooltip>
                    <TooltipTrigger type="button" tabIndex={-1} className="cursor-help">
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/70 hover:text-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-xs">
                      曲线拟合容忍度。数值越高，生成的曲线越圆润平滑；过低则会让曲线带有明显的像素锯齿。
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-sm text-muted-foreground">{qtres[0]}</span>
              </div>
              <Slider value={qtres} onValueChange={setQtres} min={0.5} max={10} step={0.5} />
            </div>

            <div className="flex items-center justify-between mt-6">
              <div className="flex items-center gap-1.5">
                <label className="text-sm font-medium">直角优化 (增强几何图形)</label>
                <Tooltip>
                  <TooltipTrigger type="button" tabIndex={-1} className="cursor-help">
                    <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/70 hover:text-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[200px] text-xs">
                    尝试在转角处生成更尖锐的 90 度直角，适合硬边缘的工业风 Logo 或界面图标。
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch checked={rightAngleEnhance} onCheckedChange={setRightAngleEnhance} />
            </div>
          </div>

          <Button 
            className="w-full gap-2" 
            onClick={processImage} 
            disabled={!imageUrl || isProcessing}
          >
            {isProcessing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {isProcessing ? '处理中...' : '生成 SVG'}
          </Button>
        </div>

        {/* Main Content Preview */}
        <div className="flex-1 p-6 bg-muted/30 overflow-y-auto">
          {imageUrl ? (
            <div className="grid grid-cols-2 gap-6 h-full">
              <div className="flex flex-col gap-2">
                <h3 className="text-center font-medium">原图预览</h3>
                <div className="flex-1 border rounded-lg bg-background flex items-center justify-center p-4 relative overflow-hidden">
                  <img 
                    src={imageUrl} 
                    alt="Original" 
                    className="max-w-full max-h-[70vh] object-contain"
                  />
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <h3 className="text-center font-medium">矢量图 (SVG)</h3>
                <div className="flex-1 border rounded-lg bg-background flex items-center justify-center p-4 relative overflow-hidden">
                  {isProcessing ? (
                    <div className="flex flex-col items-center text-muted-foreground">
                      <RefreshCw className="w-8 h-8 animate-spin mb-2" />
                      <span>正在转换，请稍候...</span>
                    </div>
                  ) : svgContent ? (
                    <div 
                      className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-[70vh] [&>svg]:w-auto [&>svg]:h-auto"
                      dangerouslySetInnerHTML={{ __html: svgContent }} 
                    />
                  ) : (
                    <div className="flex flex-col items-center text-muted-foreground">
                      <ImageIcon className="w-12 h-12 mb-2 opacity-20" />
                      <span>点击生成以预览 SVG</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
              <Upload className="w-12 h-12 mb-4 opacity-20" />
              <p>请在左侧选择一张图片以开始</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
