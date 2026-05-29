/**
 * PropertyPanel — Layer property editor for the product image maker.
 * 
 * Shows editable properties for the currently selected layer.
 * Supports both text layers and image layers with different property sets.
 */

import { useState } from 'react';
import type { Layer, TextLayer, ImageLayer, ShapeLayer, CanvasSettings } from './types';
import { FONT_WEIGHT_OPTIONS, CANVAS_PRESETS } from './types';
import FontSelector from './FontSelector';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Minus,
  ChevronDown,
} from 'lucide-react';

// ─── Reusable Input Components ─────────────────────────────

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-muted-foreground w-14 shrink-0">{label}</label>
      <div className="flex-1 flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          className="w-full px-2 py-1 text-xs bg-muted/50 rounded outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        {suffix && <span className="text-[10px] text-muted-foreground shrink-0">{suffix}</span>}
      </div>
    </div>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-muted-foreground w-14 shrink-0">{label}</label>
      <div className="flex-1 flex items-center gap-2">
        <div className="relative w-6 h-6 shrink-0">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div
            className="w-6 h-6 rounded border border-border"
            style={{ backgroundColor: value }}
          />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-1 text-xs bg-muted/50 rounded outline-none focus:ring-1 focus:ring-primary font-mono uppercase"
          maxLength={7}
        />
      </div>
    </div>
  );
}

function SliderInput({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  displayValue,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  displayValue?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-muted-foreground w-14 shrink-0">{label}</label>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="flex-1 h-1.5 accent-primary cursor-pointer"
      />
      <span className="text-[10px] text-muted-foreground w-10 text-right">
        {displayValue ?? `${Math.round(value * 100)}%`}
      </span>
    </div>
  );
}

// ─── Canvas Settings Panel ─────────────────────────────────

function CanvasSettingsPanel({
  canvas,
  onUpdate,
}: {
  canvas: CanvasSettings;
  onUpdate: (updates: Partial<CanvasSettings>) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full group"
      >
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          画布设置
        </span>
      </button>

      {!collapsed && (<>

      {/* Presets */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground w-14 shrink-0">预设尺寸</label>
        <select
          value={
            CANVAS_PRESETS.some(p => p.width === canvas.width && p.height === canvas.height)
              ? `${canvas.width}x${canvas.height}`
              : 'custom'
          }
          onChange={(e) => {
            if (e.target.value === 'custom') return;
            const [w, h] = e.target.value.split('x').map(Number);
            if (w && h) onUpdate({ width: w, height: h });
          }}
          className="flex-1 px-2 py-1.5 text-xs bg-muted/50 rounded outline-none focus:ring-1 focus:ring-primary cursor-pointer"
        >
          <option value="custom" disabled hidden>自定义尺寸...</option>
          {CANVAS_PRESETS.map((preset) => (
            <option key={preset.label} value={`${preset.width}x${preset.height}`}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>

      <NumberInput
        label="宽度"
        value={canvas.width}
        onChange={(v) => onUpdate({ width: v })}
        min={100}
        max={4000}
        suffix="px"
      />
      <NumberInput
        label="高度"
        value={canvas.height}
        onChange={(v) => onUpdate({ height: v })}
        min={100}
        max={4000}
        suffix="px"
      />
      <ColorInput
        label="背景色"
        value={canvas.backgroundColor}
        onChange={(v) => onUpdate({ backgroundColor: v })}
      />
      <NumberInput
        label="描边粗细"
        value={canvas.borderWidth || 0}
        onChange={(v) => onUpdate({ borderWidth: v })}
        min={0}
        max={100}
        suffix="px"
      />
      {(canvas.borderWidth || 0) > 0 && (
        <ColorInput
          label="描边颜色"
          value={canvas.borderColor || '#000000'}
          onChange={(v) => onUpdate({ borderColor: v })}
        />
      )}

      <div className="pt-2 border-t border-border mt-3 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            导出设置
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground w-14 shrink-0">格式</label>
          <select
            value={canvas.exportFormat || 'png'}
            onChange={(e) => onUpdate({ exportFormat: e.target.value as any })}
            className="flex-1 px-2 py-1 text-xs bg-muted/50 rounded outline-none focus:ring-1 focus:ring-primary cursor-pointer uppercase"
          >
            <option value="png">PNG (无损)</option>
            <option value="jpeg">JPEG (体积小)</option>
            <option value="webp">WEBP (推荐)</option>
          </select>
        </div>

        {(canvas.exportFormat === 'jpeg' || canvas.exportFormat === 'webp') && (
          <SliderInput
            label="图片质量"
            value={canvas.exportQuality ?? 0.9}
            onChange={(v) => onUpdate({ exportQuality: v })}
            min={0.1}
            max={1}
            step={0.01}
            displayValue={`${Math.round((canvas.exportQuality ?? 0.9) * 100)}%`}
          />
        )}
      </div>

      <div className="pt-2 border-t border-border mt-3 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            界面外观
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ColorInput
            label="工作区"
            value={canvas.workspaceColor || '#f5f5f5'}
            onChange={(v) => onUpdate({ workspaceColor: v })}
          />
          {canvas.workspaceColor && (
            <button
              type="button"
              onClick={() => onUpdate({ workspaceColor: '' })}
              className="text-[10px] text-primary hover:underline shrink-0"
            >
              重置
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ColorInput
            label="面板区"
            value={canvas.panelColor || '#f5f5f5'}
            onChange={(v) => onUpdate({ panelColor: v })}
          />
          {canvas.panelColor && (
            <button
              type="button"
              onClick={() => onUpdate({ panelColor: '' })}
              className="text-[10px] text-primary hover:underline shrink-0"
            >
              重置
            </button>
          )}
        </div>
      </div>
      </>)}
    </div>
  );
}

// ─── Text Layer Properties ─────────────────────────────────

function TextLayerProperties({
  layer,
  canvas,
  onUpdate,
}: {
  layer: TextLayer;
  canvas: CanvasSettings;
  onUpdate: (updates: Partial<TextLayer>) => void;
}) {
  // Filter available weights for the current font
  const availableWeights = FONT_WEIGHT_OPTIONS;

  const handleAlignHorizontal = () => {
    const cvs = document.createElement('canvas');
    const ctx = cvs.getContext('2d');
    let offsetX = 0;
    if (ctx) {
      let textContent = layer.content;
      if (layer.textTransform === 'uppercase') textContent = textContent.toUpperCase();
      if (layer.textTransform === 'lowercase') textContent = textContent.toLowerCase();

      ctx.font = `${layer.fontWeight} ${layer.fontSize}px "${layer.fontFamily}"`;
      const metrics = ctx.measureText(textContent);
      const textWidth = metrics.width + layer.letterSpacing * Math.max(0, textContent.length - 1);

      let visualCenterX: number;
      if (layer.textAlign === 'center') {
        visualCenterX = layer.x;
      } else if (layer.textAlign === 'right') {
        visualCenterX = layer.x - textWidth / 2;
      } else {
        visualCenterX = layer.x + textWidth / 2;
      }
      offsetX = layer.x - visualCenterX;
    }
    onUpdate({ x: Math.round(canvas.width / 2 + offsetX) });
  };

  const handleAlignVertical = () => {
    onUpdate({ y: Math.round(canvas.height / 2) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          文字属性
        </span>
      </div>

      {/* Content */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">内容</label>
        <input
          type="text"
          value={layer.content}
          onChange={(e) => onUpdate({ content: e.target.value })}
          className="w-full px-2 py-1.5 text-sm bg-muted/50 rounded outline-none focus:ring-1 focus:ring-primary"
          placeholder="输入文字..."
        />
      </div>

      {/* Font family */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">字体</label>
        <FontSelector
          value={layer.fontFamily}
          onChange={(fontFamily) => onUpdate({ fontFamily })}
        />
      </div>

      {/* Font size */}
      <NumberInput
        label="大小"
        value={layer.fontSize}
        onChange={(v) => onUpdate({ fontSize: v })}
        min={8}
        max={500}
        suffix="px"
      />

      {/* Font weight */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground w-14 shrink-0">粗细</label>
        <select
          value={layer.fontWeight}
          onChange={(e) => onUpdate({ fontWeight: Number(e.target.value) })}
          className="flex-1 px-2 py-1 text-xs bg-muted/50 rounded outline-none focus:ring-1 focus:ring-primary cursor-pointer"
        >
          {availableWeights.map(({ value, label }) => (
            <option key={value} value={value}>
              {value} - {label}
            </option>
          ))}
        </select>
      </div>

      {/* Color */}
      <ColorInput
        label="颜色"
        value={layer.color}
        onChange={(v) => onUpdate({ color: v })}
      />

      {/* Opacity */}
      <SliderInput
        label="透明度"
        value={layer.opacity}
        onChange={(v) => onUpdate({ opacity: v })}
      />

      {/* Text align */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground w-14 shrink-0">对齐</label>
        <div className="flex gap-1">
          {([
            { value: 'left' as const, Icon: AlignLeft },
            { value: 'center' as const, Icon: AlignCenter },
            { value: 'right' as const, Icon: AlignRight },
          ]).map(({ value, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => onUpdate({ textAlign: value })}
              className={`p-1.5 rounded transition-colors ${
                layer.textAlign === value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </div>

      {/* Text Transform */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground w-14 shrink-0">大小写</label>
        <div className="flex gap-1">
          {([
            { value: 'none' as const, label: 'Aa' },
            { value: 'uppercase' as const, label: 'AA' },
            { value: 'lowercase' as const, label: 'aa' },
          ]).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onUpdate({ textTransform: value })}
              className={`px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                (layer.textTransform || 'none') === value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Letter spacing */}
      <NumberInput
        label="字间距"
        value={layer.letterSpacing}
        onChange={(v) => onUpdate({ letterSpacing: v })}
        min={-10}
        max={100}
        suffix="px"
      />

      {/* Position */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label="X"
            value={layer.x}
            onChange={(v) => onUpdate({ x: v })}
          />
          <NumberInput
            label="Y"
            value={layer.y}
            onChange={(v) => onUpdate({ y: v })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 pl-16">
          <button
            type="button"
            onClick={handleAlignHorizontal}
            className="py-1.5 text-xs font-medium bg-muted/50 hover:bg-muted text-muted-foreground rounded transition-colors"
          >
            水平居中
          </button>
          <button
            type="button"
            onClick={handleAlignVertical}
            className="py-1.5 text-xs font-medium bg-muted/50 hover:bg-muted text-muted-foreground rounded transition-colors"
          >
            垂直居中
          </button>
        </div>
      </div>

      {/* Rotation */}
      <div className="flex items-center gap-2">
        <NumberInput
          label="旋转"
          value={layer.rotation ?? 0}
          onChange={(v) => onUpdate({ rotation: v })}
          min={-180}
          max={180}
          suffix="°"
        />
        {(layer.rotation ?? 0) !== 0 && (
          <button
            type="button"
            onClick={() => onUpdate({ rotation: 0 })}
            className="text-[10px] text-primary hover:underline shrink-0"
          >
            归零
          </button>
        )}
      </div>

      {/* Decoration line */}
      <div className="pt-2 border-t border-border space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground flex-1">装饰线</label>
          <button
            type="button"
            onClick={() => onUpdate({ decorationLine: !layer.decorationLine })}
            className={`relative w-8 h-4 rounded-full transition-colors ${
              layer.decorationLine ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                layer.decorationLine ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        {layer.decorationLine && (
          <>
            <ColorInput
              label="线颜色"
              value={layer.decorationLineColor}
              onChange={(v) => onUpdate({ decorationLineColor: v })}
            />
            <NumberInput
              label="线宽"
              value={layer.decorationLineWidth}
              onChange={(v) => onUpdate({ decorationLineWidth: v })}
              min={0.5}
              max={5}
              step={0.5}
              suffix="px"
            />
            <NumberInput
              label="线长度"
              value={layer.decorationLineLength ?? 60}
              onChange={(v) => onUpdate({ decorationLineLength: v })}
              min={10}
              max={500}
              suffix="px"
            />
            <NumberInput
              label="间距"
              value={layer.decorationLineGap ?? 20}
              onChange={(v) => onUpdate({ decorationLineGap: v })}
              min={0}
              max={200}
              suffix="px"
            />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Image Layer Properties ────────────────────────────────

function ImageLayerProperties({
  layer,
  canvas,
  onUpdate,
  onReplaceImage,
}: {
  layer: ImageLayer;
  canvas: CanvasSettings;
  onUpdate: (updates: Partial<ImageLayer>) => void;
  onReplaceImage: () => void;
}) {
  const aspectRatio = layer.naturalWidth / layer.naturalHeight;

  const handleWidthChange = (w: number) => {
    onUpdate({ width: w, height: Math.round(w / aspectRatio) });
  };

  const handleHeightChange = (h: number) => {
    onUpdate({ height: h, width: Math.round(h * aspectRatio) });
  };

  const handleAlignHorizontal = () => {
    onUpdate({ x: Math.round(canvas.width / 2) });
  };

  const handleAlignVertical = () => {
    onUpdate({ y: Math.round(canvas.height / 2) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          图片属性
        </span>
        <button
          type="button"
          onClick={onReplaceImage}
          className="text-xs text-primary hover:underline"
        >
          替换图片
        </button>
      </div>

      {/* Filename */}
      <div className="text-xs text-muted-foreground truncate">
        📎 {layer.filename}
      </div>

      {/* Dimensions (locked aspect ratio) */}
      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          label="宽度"
          value={layer.width}
          onChange={handleWidthChange}
          min={10}
          suffix="px"
        />
        <NumberInput
          label="高度"
          value={layer.height}
          onChange={handleHeightChange}
          min={10}
          suffix="px"
        />
      </div>

      {/* Original dimensions info */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          原始尺寸: {layer.naturalWidth} × {layer.naturalHeight}
        </span>
        <button
          type="button"
          onClick={() => {
            const ratio = layer.naturalWidth / layer.naturalHeight;
            onUpdate({ height: Math.round(layer.width / ratio) });
          }}
          className="text-[10px] text-primary hover:underline"
          title="恢复原始宽高比"
        >
          恢复比例
        </button>
      </div>

      {/* Opacity */}
      <SliderInput
        label="透明度"
        value={layer.opacity}
        onChange={(v) => onUpdate({ opacity: v })}
      />

      {/* Position */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label="X"
            value={layer.x}
            onChange={(v) => onUpdate({ x: v })}
          />
          <NumberInput
            label="Y"
            value={layer.y}
            onChange={(v) => onUpdate({ y: v })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 pl-16">
          <button
            type="button"
            onClick={handleAlignHorizontal}
            className="py-1.5 text-xs font-medium bg-muted/50 hover:bg-muted text-muted-foreground rounded transition-colors"
          >
            水平居中
          </button>
          <button
            type="button"
            onClick={handleAlignVertical}
            className="py-1.5 text-xs font-medium bg-muted/50 hover:bg-muted text-muted-foreground rounded transition-colors"
          >
            垂直居中
          </button>
        </div>
      </div>

      {/* Rotation */}
      <div className="flex items-center gap-2">
        <NumberInput
          label="旋转"
          value={layer.rotation ?? 0}
          onChange={(v) => onUpdate({ rotation: v })}
          min={-180}
          max={180}
          suffix="°"
        />
        {(layer.rotation ?? 0) !== 0 && (
          <button
            type="button"
            onClick={() => onUpdate({ rotation: 0 })}
            className="text-[10px] text-primary hover:underline shrink-0"
          >
            归零
          </button>
        )}
      </div>

      {/* Border */}
      <div className="pt-2 border-t border-border space-y-2">
        <NumberInput
          label="边框宽"
          value={layer.borderWidth}
          onChange={(v) => onUpdate({ borderWidth: v })}
          min={0}
          max={20}
          suffix="px"
        />
        {layer.borderWidth > 0 && (
          <ColorInput
            label="边框色"
            value={layer.borderColor}
            onChange={(v) => onUpdate({ borderColor: v })}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main PropertyPanel ────────────────────────────────────

interface PropertyPanelProps {
  canvas: CanvasSettings;
  selectedLayer: Layer | null;
  onUpdateCanvas: (updates: Partial<CanvasSettings>) => void;
  onUpdateLayer: (id: string, updates: Partial<Layer>) => void;
  onReplaceImage: (layerId: string) => void;
}

export default function PropertyPanel({
  canvas,
  selectedLayer,
  onUpdateCanvas,
  onUpdateLayer,
  onReplaceImage,
}: PropertyPanelProps) {
  return (
    <div className="space-y-4">
      {/* Canvas settings always visible */}
      <CanvasSettingsPanel canvas={canvas} onUpdate={onUpdateCanvas} />

      <hr className="border-border" />

      {/* Layer properties */}
      {selectedLayer ? (
        <div>
          {selectedLayer.locked && (
            <div className="mb-4 p-2 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded text-xs flex items-center justify-center gap-2">
              <span className="shrink-0">🔒</span>
              此图层已锁定，无法编辑
            </div>
          )}
          <div className={selectedLayer.locked ? "pointer-events-none opacity-50" : ""}>
            {selectedLayer.type === 'text' && (
              <TextLayerProperties
                layer={selectedLayer as TextLayer}
                canvas={canvas}
                onUpdate={(updates) => onUpdateLayer(selectedLayer.id, updates)}
              />
            )}
            {selectedLayer.type === 'image' && (
              <ImageLayerProperties
                layer={selectedLayer as ImageLayer}
                canvas={canvas}
                onUpdate={(updates) => onUpdateLayer(selectedLayer.id, updates)}
                onReplaceImage={() => onReplaceImage(selectedLayer.id)}
              />
            )}
            {selectedLayer.type === 'shape' && (
              <ShapeLayerProperties
                layer={selectedLayer as ShapeLayer}
                canvas={canvas}
                onUpdate={(updates) => onUpdateLayer(selectedLayer.id, updates)}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="text-center text-xs text-muted-foreground py-4">
          <Minus className="w-4 h-4 mx-auto mb-1 opacity-30" />
          选中一个图层以编辑属性
        </div>
      )}
    </div>
  );
}

// ─── Shape Layer Properties ────────────────────────────────

function ShapeLayerProperties({
  layer,
  canvas,
  onUpdate,
}: {
  layer: ShapeLayer;
  canvas: CanvasSettings;
  onUpdate: (updates: Partial<ShapeLayer>) => void;
}) {
  const handleAlignHorizontal = () => {
    onUpdate({ x: Math.round(canvas.width / 2) });
  };

  const handleAlignVertical = () => {
    onUpdate({ y: Math.round(canvas.height / 2) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          形状属性
        </span>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <label className="text-xs text-muted-foreground w-14 shrink-0">类型</label>
        <select
          value={layer.shapeType}
          onChange={(e) => onUpdate({ shapeType: e.target.value as any })}
          className="flex-1 px-2 py-1 text-xs bg-muted/50 rounded outline-none focus:ring-1 focus:ring-primary cursor-pointer"
        >
          <option value="rectangle">矩形</option>
          <option value="circle">圆形</option>
          <option value="triangle">三角形</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          label="宽度"
          value={layer.width}
          onChange={(v) => onUpdate({ width: v })}
          min={1}
          suffix="px"
        />
        <NumberInput
          label="高度"
          value={layer.height}
          onChange={(v) => onUpdate({ height: v })}
          min={1}
          suffix="px"
        />
      </div>
      {layer.width !== layer.height && (
        <button
          type="button"
          onClick={() => {
            const size = Math.max(layer.width, layer.height);
            onUpdate({ width: size, height: size });
          }}
          className="w-full text-[10px] text-primary hover:underline text-left"
          title="将宽高设为相等（正方形/正圆）"
        >
          恢复 1:1 比例
        </button>
      )}

      <ColorInput
        label="填充色"
        value={layer.fillColor}
        onChange={(v) => onUpdate({ fillColor: v })}
      />

      <NumberInput
        label="描边粗细"
        value={layer.strokeWidth}
        onChange={(v) => onUpdate({ strokeWidth: v })}
        min={0}
        suffix="px"
      />

      {layer.strokeWidth > 0 && (
        <ColorInput
          label="描边色"
          value={layer.strokeColor}
          onChange={(v) => onUpdate({ strokeColor: v })}
        />
      )}

      <SliderInput
        label="透明度"
        value={layer.opacity}
        onChange={(v) => onUpdate({ opacity: v })}
      />

      {/* Position */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label="X"
            value={layer.x}
            onChange={(v) => onUpdate({ x: v })}
          />
          <NumberInput
            label="Y"
            value={layer.y}
            onChange={(v) => onUpdate({ y: v })}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleAlignHorizontal}
            className="flex-1 py-1.5 text-xs bg-muted/30 hover:bg-muted rounded transition-colors"
          >
            居中水平
          </button>
          <button
            type="button"
            onClick={handleAlignVertical}
            className="flex-1 py-1.5 text-xs bg-muted/30 hover:bg-muted rounded transition-colors"
          >
            居中垂直
          </button>
        </div>
      </div>

      {/* Rotation */}
      <div className="flex items-center gap-2">
        <NumberInput
          label="旋转"
          value={layer.rotation ?? 0}
          onChange={(v) => onUpdate({ rotation: v })}
          min={-180}
          max={180}
          suffix="°"
        />
        {(layer.rotation ?? 0) !== 0 && (
          <button
            type="button"
            onClick={() => onUpdate({ rotation: 0 })}
            className="text-[10px] text-primary hover:underline shrink-0"
          >
            归零
          </button>
        )}
      </div>
    </div>
  );
}
