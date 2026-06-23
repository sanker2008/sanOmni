import { useState, useCallback } from 'react';
import { Upload, Download, RefreshCw, FolderOpen, Image as ImageIcon, HelpCircle, Settings, PlayCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/useToast';
import { saveSvg, openOutputFolder } from './fs';
import { pickSingleFile } from '@/lib/tauriFilePicker';
// @ts-ignore
import ImageTracer from 'imagetracerjs';

export default function PngToSvg() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  
  // Settings
  const [colors, setColors] = useState<number>(16);
  const [blurRadius, setBlurRadius] = useState<number>(1);
  const [pathOmit, setPathOmit] = useState<number>(8);
  const [ltres, setLtres] = useState<number>(1);
  const [qtres, setQtres] = useState<number>(1);
  const [rightAngleEnhance, setRightAngleEnhance] = useState<boolean>(true);
  const [minColorRatio, setMinColorRatio] = useState<number>(0.02);
  const [colorQuantCycles, setColorQuantCycles] = useState<number>(3);


  const handlePickImage = useCallback(async () => {
    try {
      const picked = await pickSingleFile({
        extensions: ['png', 'jpg', 'jpeg', 'webp'],
        filterName: '图片文件',
      });
      if (picked) {
        setSelectedFile(picked.file);
        setImageUrl(picked.dataUrl);
        setSvgContent(null);
      }
    } catch (error) {
      console.error('Failed to pick image:', error);
    }
  }, []);

  const processImage = () => {
    if (!imageUrl) return;
    setIsProcessing(true);
    setSvgContent(null);

    // imagetracerjs processing is synchronous but taking time, use timeout to allow UI update
    setTimeout(() => {
      try {
        const options = {
          numberofcolors: colors,
          mincolorratio: minColorRatio,
          colorquantcycles: colorQuantCycles,
          blurradius: blurRadius,
          pathomit: pathOmit,
          ltres: ltres,
          qtres: qtres,
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
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/40 shrink-0 select-none">
        <div>
          <h2 className="text-sm font-semibold text-foreground/90">PNG 转 SVG</h2>
          <p className="text-xs text-muted-foreground">将位图转换为矢量图，支持参数调节。</p>
        </div>
        <div className="flex gap-2">
          {svgContent && (
            <button 
              onClick={handleSave} 
              className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors bg-muted/40 hover:bg-muted/80 px-2 py-1 rounded border"
            >
              <Download className="w-3.5 h-3.5" /> 导出 SVG
            </button>
          )}
          <button 
            onClick={openOutputFolder} 
            className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors bg-muted/40 hover:bg-muted/80 px-2 py-1 rounded border"
          >
            <FolderOpen className="w-3.5 h-3.5" /> 输出目录
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Content Preview */}
        <div className="flex-1 flex flex-col bg-slate-900/5 dark:bg-black/10 overflow-hidden">
          {imageUrl ? (
            <div className="flex-1 p-4 grid grid-cols-2 gap-4 h-full min-h-0">
              <div className="flex flex-col gap-2 min-h-0">
                <h3 className="text-center font-medium text-sm text-foreground/80 shrink-0">原图预览</h3>
                <div className="flex-1 border border-border/80 rounded-lg bg-card flex items-center justify-center p-4 relative overflow-hidden shadow-sm">
                  <img 
                    src={imageUrl} 
                    alt="Original" 
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              </div>
              
              <div className="flex flex-col gap-2 min-h-0">
                <h3 className="text-center font-medium text-sm text-foreground/80 shrink-0">矢量图 (SVG)</h3>
                <div className="flex-1 border border-border/80 rounded-lg bg-card flex items-center justify-center p-4 relative overflow-hidden shadow-sm">
                  {isProcessing ? (
                    <div className="flex flex-col items-center text-muted-foreground">
                      <RefreshCw className="w-8 h-8 animate-spin mb-2 text-primary/60" />
                      <span className="text-sm">正在转换，请稍候...</span>
                    </div>
                  ) : svgContent ? (
                    <div 
                      className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto"
                      dangerouslySetInnerHTML={{ __html: svgContent }} 
                    />
                  ) : (
                    <div className="flex flex-col items-center text-muted-foreground">
                      <ImageIcon className="w-12 h-12 mb-2 opacity-20" />
                      <span className="text-sm">点击生成以预览 SVG</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 select-none">
              <div
                className="w-full max-w-xl aspect-[16/10] bg-card border-2 border-dashed border-border/80 hover:border-primary/50 hover:shadow-lg rounded-xl flex flex-col items-center justify-center p-8 text-center transition-all duration-300 cursor-pointer group"
                onClick={handlePickImage}
              >
                <div className="w-16 h-16 rounded-full bg-primary/5 group-hover:bg-primary/10 text-primary/70 flex items-center justify-center transition-all mb-5 group-hover:scale-105">
                  <Upload className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-foreground mb-1 bg-gradient-to-r from-primary to-sky-400 bg-clip-text text-transparent">
                  上传需要转换的图片
                </h3>
                <p className="text-xs text-muted-foreground max-w-[280px] leading-relaxed mb-6">
                  在右侧面板设置转换参数，一键处理生成矢量图。
                </p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 border border-border/60 bg-muted/20 px-3 py-1 rounded-full">
                  <ImageIcon className="w-3.5 h-3.5" />
                  支持 JPG、PNG、WEBP
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar settings */}
        <div className="w-[300px] shrink-0 border-l border-border bg-card flex flex-col h-full overflow-hidden select-none">
          <div className="px-4 py-3 border-b border-border bg-card/60 flex items-center gap-2 shrink-0">
            <Settings className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">转换设置</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
            {imageUrl && (
              <div className="space-y-2 mb-4">
                <span className="text-xs font-semibold text-foreground/90 block">更改图片</span>
                <label
                  className="flex items-center justify-center gap-2 w-full py-1.5 bg-muted/60 hover:bg-muted text-foreground/80 text-xs rounded border border-border/60 transition-colors cursor-pointer"
                  onClick={handlePickImage}
                >
                  <Upload className="w-3.5 h-3.5" />
                  重新选择图片
                </label>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold text-foreground/90">
                <div className="flex items-center gap-1.5">
                  <span>颜色数量</span>
                  <Tooltip>
                    <TooltipTrigger type="button" tabIndex={-1} className="cursor-help">
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/70 hover:text-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-xs">
                      设置最终矢量图中包含的颜色总数。数值过低可能导致颜色合并错误或背景变灰，建议从 16 开始尝试。
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-primary font-mono">{colors}</span>
              </div>
              <input 
                type="range" 
                min="2" max="64" step="1" 
                value={colors} 
                onChange={(e) => setColors(parseInt(e.target.value))} 
                className="w-full accent-primary" 
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold text-foreground/90">
                <div className="flex items-center gap-1.5">
                  <span>颜色合并过滤</span>
                  <Tooltip>
                    <TooltipTrigger type="button" tabIndex={-1} className="cursor-help">
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/70 hover:text-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-xs">
                      丢弃占比小于该比例的颜色，将其合并到相近的主色中。对于消除抗锯齿灰边非常有效。数值越大合并越多。
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-primary font-mono">{minColorRatio}</span>
              </div>
              <input 
                type="range" 
                min="0" max="0.1" step="0.01" 
                value={minColorRatio} 
                onChange={(e) => setMinColorRatio(parseFloat(e.target.value))} 
                className="w-full accent-primary" 
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold text-foreground/90">
                <div className="flex items-center gap-1.5">
                  <span>色彩分析循环</span>
                  <Tooltip>
                    <TooltipTrigger type="button" tabIndex={-1} className="cursor-help">
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/70 hover:text-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-xs">
                      色彩量化的迭代次数。数值越高，找出的主色越精准。
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-primary font-mono">{colorQuantCycles}</span>
              </div>
              <input 
                type="range" 
                min="1" max="10" step="1" 
                value={colorQuantCycles} 
                onChange={(e) => setColorQuantCycles(parseInt(e.target.value))} 
                className="w-full accent-primary" 
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold text-foreground/90">
                <div className="flex items-center gap-1.5">
                  <span>平滑度 (Blur)</span>
                  <Tooltip>
                    <TooltipTrigger type="button" tabIndex={-1} className="cursor-help">
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/70 hover:text-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-xs">
                      追踪前对原图进行模糊预处理，以减少噪点。对于边缘需要锐利的 Logo 或文字，必须设为 0。
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-primary font-mono">{blurRadius}</span>
              </div>
              <input 
                type="range" 
                min="0" max="5" step="1" 
                value={blurRadius} 
                onChange={(e) => setBlurRadius(parseInt(e.target.value))} 
                className="w-full accent-primary" 
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold text-foreground/90">
                <div className="flex items-center gap-1.5">
                  <span>杂点过滤 (Omit)</span>
                  <Tooltip>
                    <TooltipTrigger type="button" tabIndex={-1} className="cursor-help">
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/70 hover:text-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-xs">
                      过滤掉面积较小的色块或路径。如果图片中的细节（如小窗户、细线）丢失，请将此数值调低。
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-primary font-mono">{pathOmit}</span>
              </div>
              <input 
                type="range" 
                min="0" max="20" step="1" 
                value={pathOmit} 
                onChange={(e) => setPathOmit(parseInt(e.target.value))} 
                className="w-full accent-primary" 
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold text-foreground/90">
                <div className="flex items-center gap-1.5">
                  <span>直线平滑 (L-thres)</span>
                  <Tooltip>
                    <TooltipTrigger type="button" tabIndex={-1} className="cursor-help">
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/70 hover:text-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-xs">
                      直线拟合容忍度。数值越高，生成的长直线越直越平滑；数值越低，越会保留原本位图像素网格的坑洼感。
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-primary font-mono">{ltres}</span>
              </div>
              <input 
                type="range" 
                min="0.5" max="10" step="0.5" 
                value={ltres} 
                onChange={(e) => setLtres(parseFloat(e.target.value))} 
                className="w-full accent-primary" 
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold text-foreground/90">
                <div className="flex items-center gap-1.5">
                  <span>曲线平滑 (Q-thres)</span>
                  <Tooltip>
                    <TooltipTrigger type="button" tabIndex={-1} className="cursor-help">
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/70 hover:text-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] text-xs">
                      曲线拟合容忍度。数值越高，生成的曲线越圆润平滑；过低则会让曲线带有明显的像素锯齿。
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-primary font-mono">{qtres}</span>
              </div>
              <input 
                type="range" 
                min="0.5" max="10" step="0.5" 
                value={qtres} 
                onChange={(e) => setQtres(parseFloat(e.target.value))} 
                className="w-full accent-primary" 
              />
            </div>

            <div className="flex items-center justify-between mt-6 bg-muted/30 p-2 rounded-md border border-border/60">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-semibold text-foreground/90">直角优化 (增强几何)</label>
                <Tooltip>
                  <TooltipTrigger type="button" tabIndex={-1} className="cursor-help">
                    <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/70 hover:text-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[200px] text-xs">
                    尝试在转角处生成更尖锐的 90 度直角，适合硬边缘的工业风 Logo 或界面图标。
                  </TooltipContent>
                </Tooltip>
              </div>
              <Switch checked={rightAngleEnhance} onCheckedChange={setRightAngleEnhance} className="scale-75 origin-right" />
            </div>
          </div>

          <div className="p-4 border-t border-border bg-card/80 shrink-0">
            <button
              type="button"
              onClick={processImage}
              disabled={!imageUrl || isProcessing}
              className="w-full py-2 bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-semibold rounded-md shadow flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:pointer-events-none"
            >
              {isProcessing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <PlayCircle className="w-4 h-4" />
              )}
              {isProcessing ? '处理中...' : '生成 SVG'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
