import { useState, useEffect, useRef, useCallback } from 'react';
import { getDefaultExportPath, saveFile, openExportFolder } from './fs';
import { toast } from '@/hooks/useToast';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Upload,
  Settings,
  FolderOpen,
  Trash2,
  FileImage,
  XCircle,
  PlayCircle
} from 'lucide-react';

interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  dataUrl: string;
  status: 'pending' | 'compressing' | 'done' | 'error';
  compressedSize?: number;
}

export default function ImageCompressor() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Settings
  const [format, setFormat] = useState<'jpeg' | 'webp' | 'png'>('jpeg');
  const [quality, setQuality] = useState<number>(0.8);
  const [scale, setScale] = useState<number>(1);
  const [resizeMode, setResizeMode] = useState<'scale' | 'exact'>('scale');
  const [exactWidth, setExactWidth] = useState<number | ''>('');
  const [exactHeight, setExactHeight] = useState<number | ''>('');
  const [exportPath, setExportPath] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initPath = async () => {
      try {
        const path = await getDefaultExportPath();
        setExportPath(path);
      } catch (e) {
        console.error('Failed to resolve default export path:', e);
      }
    };
    initPath();
  }, []);

  const handleFiles = useCallback(async (selectedFiles: FileList | File[]) => {
    const newItems: FileItem[] = [];
    
    const readPromises = Array.from(selectedFiles).map((file) => {
      return new Promise<void>((resolve) => {
        if (!file.type.startsWith('image/')) {
          resolve();
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          newItems.push({
            id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            file,
            name: file.name,
            size: file.size,
            dataUrl: reader.result as string,
            status: 'pending'
          });
          resolve();
        };
        reader.onerror = () => resolve();
        reader.readAsDataURL(file);
      });
    });

    await Promise.all(readPromises);

    if (newItems.length > 0) {
      setFiles((prev) => [...prev, ...newItems]);
      toast({
        title: '图片已加载',
        description: `成功加载 ${newItems.length} 张图片`,
      });
    } else {
      toast({ title: '未找到有效图片', variant: 'destructive' });
    }
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearFiles = () => {
    setFiles([]);
  };

  const selectExportFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择导出文件夹',
      });
      if (selected && typeof selected === 'string') {
        setExportPath(selected);
      }
    } catch (e) {
      console.error('Failed to select folder:', e);
    }
  };

  const processImage = async (item: FileItem): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let targetWidth = img.width;
        let targetHeight = img.height;

        if (resizeMode === 'scale') {
          targetWidth = Math.max(1, Math.floor(img.width * scale));
          targetHeight = Math.max(1, Math.floor(img.height * scale));
        } else {
          const w = exactWidth ? Number(exactWidth) : 0;
          const h = exactHeight ? Number(exactHeight) : 0;
          
          if (w > 0 && h > 0) {
            targetWidth = w;
            targetHeight = h;
          } else if (w > 0 && h <= 0) {
            targetWidth = w;
            targetHeight = Math.max(1, Math.floor(img.height * (w / img.width)));
          } else if (w <= 0 && h > 0) {
            targetHeight = h;
            targetWidth = Math.max(1, Math.floor(img.width * (h / img.height)));
          }
        }
        
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        const mimeType = format === 'png' ? 'image/png' : `image/${format}`;
        const exportQuality = format === 'png' ? undefined : quality;

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Canvas to Blob failed'));
            return;
          }
          blob.arrayBuffer().then((ab) => resolve(new Uint8Array(ab))).catch(reject);
        }, mimeType, exportQuality);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = item.dataUrl;
    });
  };

  const startCompression = async () => {
    if (files.length === 0 || !exportPath) return;

    setIsExporting(true);
    setExportProgress(0);

    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: 'compressing' } : f)));

      try {
        const compressedData = await processImage(item);
        
        const ext = format === 'jpeg' ? 'jpg' : format;
        const baseName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
        const fileName = `${baseName}_min.${ext}`;

        await saveFile(exportPath, fileName, compressedData);
        
        setFiles((prev) => prev.map((f) => (f.id === item.id ? { 
          ...f, 
          status: 'done',
          compressedSize: compressedData.length
        } : f)));
        
        successCount++;
      } catch (e) {
        console.error('Compression failed for', item.name, e);
        setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: 'error' } : f)));
      }

      setExportProgress(Math.round(((i + 1) / files.length) * 100));
    }

    setIsExporting(false);
    toast({
      title: '压缩完成',
      description: `成功处理 ${successCount}/${files.length} 张图片`,
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      {files.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/40 shrink-0 select-none">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={clearFiles}
              className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors bg-muted/40 hover:bg-muted/80 px-2 py-1 rounded border"
            >
              <Trash2 className="w-3.5 h-3.5" />
              清空列表
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors bg-muted/40 hover:bg-muted/80 px-2 py-1 rounded border"
            >
              <Upload className="w-3.5 h-3.5" />
              添加图片
            </button>
            <div className="w-px h-4 bg-border" />
            <div className="text-xs font-medium text-foreground/90">
              共 {files.length} 张图片待处理
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {files.length > 0 ? (
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-900/5 dark:bg-black/10">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {files.map((file) => (
                <div key={file.id} className="bg-card border border-border/80 rounded-lg overflow-hidden group relative flex flex-col hover:shadow-md transition-shadow">
                  <div className="aspect-square relative overflow-hidden bg-muted/30">
                    <img src={file.dataUrl} alt={file.name} className="w-full h-full object-cover" />
                    {file.status !== 'done' && (
                      <button
                        onClick={() => removeFile(file.id)}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-all"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                    {file.status === 'compressing' && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                    {file.status === 'done' && (
                      <div className="absolute inset-0 bg-emerald-500/20 border-2 border-emerald-500/50 flex items-center justify-center">
                        <div className="bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow">完成</div>
                      </div>
                    )}
                  </div>
                  <div className="p-2.5 flex-1 flex flex-col justify-between">
                    <div className="text-xs font-medium truncate mb-1" title={file.name}>{file.name}</div>
                    <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                      <span>{formatSize(file.size)}</span>
                      {file.compressedSize && (
                        <span className="text-emerald-500 font-medium">→ {formatSize(file.compressedSize)}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-900/5 dark:bg-black/10 select-none" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
            <div
              className="w-full max-w-xl aspect-[16/10] bg-card border-2 border-dashed border-border/80 hover:border-primary/50 hover:shadow-lg rounded-xl flex flex-col items-center justify-center p-8 text-center transition-all duration-300 cursor-pointer group"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-16 h-16 rounded-full bg-primary/5 group-hover:bg-primary/10 text-primary/70 flex items-center justify-center transition-all mb-5 group-hover:scale-105">
                <Upload className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-foreground mb-1 bg-gradient-to-r from-primary to-sky-400 bg-clip-text text-transparent">
                上传需要压缩的图片
              </h3>
              <p className="text-xs text-muted-foreground max-w-[280px] leading-relaxed mb-6">
                支持批量上传，在右侧面板设置压缩参数，一键处理导出。
              </p>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 border border-border/60 bg-muted/20 px-3 py-1 rounded-full">
                <FileImage className="w-3.5 h-3.5" />
                支持 JPG、PNG、WEBP
              </div>
            </div>
          </div>
        )}

        <div className="w-[300px] shrink-0 border-l border-border bg-card flex flex-col h-full overflow-hidden select-none">
          <div className="px-4 py-3 border-b border-border bg-card/60 flex items-center gap-2 shrink-0">
            <Settings className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">压缩设置</h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
            <div className="space-y-2">
              <span className="text-xs font-semibold text-foreground/90">导出格式</span>
              <div className="grid grid-cols-3 gap-2">
                {['jpeg', 'webp', 'png'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f as any)}
                    className={`py-1.5 text-xs font-semibold rounded-md transition-all border ${
                      format === f
                        ? 'bg-primary/10 border-primary/50 text-primary'
                        : 'bg-muted/30 border-border/60 text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className={`space-y-2 transition-opacity ${format === 'png' ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
              <div className="flex justify-between items-center text-xs font-semibold text-foreground/90">
                <span>图片质量</span>
                <span className="text-primary font-mono">{Math.round(quality * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={quality}
                onChange={(e) => setQuality(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold text-foreground/90">
                <span>缩放模式</span>
              </div>
              <div className="flex bg-muted/30 p-0.5 rounded-md border border-border/60">
                <button
                  type="button"
                  onClick={() => setResizeMode('scale')}
                  className={`flex-1 py-1 text-[11px] font-medium rounded transition-all ${
                    resizeMode === 'scale' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  按比例缩放
                </button>
                <button
                  type="button"
                  onClick={() => setResizeMode('exact')}
                  className={`flex-1 py-1 text-[11px] font-medium rounded transition-all ${
                    resizeMode === 'exact' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  设定尺寸
                </button>
              </div>
            </div>

            {resizeMode === 'scale' ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold text-foreground/90">
                  <span>缩放比例</span>
                  <span className="text-primary font-mono">{Math.round(scale * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={scale}
                  onChange={(e) => setScale(parseFloat(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="text-[10px] text-muted-foreground mt-1 leading-tight">
                  按比例缩小图片分辨率可大幅减小文件体积。
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold text-foreground/90">
                  <span>指定宽高 (px)</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    placeholder="宽 (自动)"
                    value={exactWidth}
                    onChange={(e) => setExactWidth(e.target.value ? parseInt(e.target.value) : '')}
                    className="flex-1 w-full text-xs px-2.5 py-1.5 bg-muted/40 border border-border/80 rounded-md focus:outline-none focus:border-primary/50 text-foreground font-mono"
                  />
                  <span className="text-muted-foreground text-xs">×</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="高 (自动)"
                    value={exactHeight}
                    onChange={(e) => setExactHeight(e.target.value ? parseInt(e.target.value) : '')}
                    className="flex-1 w-full text-xs px-2.5 py-1.5 bg-muted/40 border border-border/80 rounded-md focus:outline-none focus:border-primary/50 text-foreground font-mono"
                  />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 leading-tight">
                  留空单侧则会按原图比例自动计算。若两者都填写则强制拉伸。
                </div>
              </div>
            )}

            <div className="space-y-2">
              <span className="text-xs font-semibold text-foreground/90 block">导出位置</span>
              <div className="flex flex-col gap-1.5">
                <div
                  className="px-2.5 py-1.5 bg-muted/40 border border-border/80 rounded-md text-[10px] text-muted-foreground font-mono break-all line-clamp-2 cursor-pointer hover:border-primary/50"
                  onClick={selectExportFolder}
                  title="点击修改导出路径"
                >
                  {exportPath || '请选择导出目录...'}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={selectExportFolder}
                    className="flex-1 py-1.5 bg-muted/60 hover:bg-muted text-foreground/80 text-xs rounded border border-border/60 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    更改目录
                  </button>
                  <button
                    onClick={() => exportPath && openExportFolder(exportPath)}
                    disabled={!exportPath}
                    className="flex-1 py-1.5 bg-muted/60 hover:bg-muted text-foreground/80 text-xs rounded border border-border/60 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    打开目录
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-border bg-card/80 shrink-0">
            {isExporting ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span>压缩中...</span>
                  <span>{exportProgress}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={startCompression}
                disabled={files.length === 0 || !exportPath}
                className="w-full py-2 bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-semibold rounded-md shadow flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:pointer-events-none"
              >
                <PlayCircle className="w-4 h-4" />
                开始批量压缩 ({files.length})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
