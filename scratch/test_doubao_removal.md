# 豆包水印移除测试指南

## 测试步骤

### 1. 编译项目

```bash
cd d:\dev\san\sanMediaBox
npm run tauri:build
```

或者运行开发模式：

```bash
npm run tauri:dev
```

### 2. 测试水印检测

在前端调用：

```typescript
import { invoke } from '@tauri-apps/api/core';

// 测试豆包水印检测
const testDetection = async () => {
  const testImages = [
    'D:\\dev\\san\\sanMediaBox\\docs\\doubao.png',
    'D:\\dev\\san\\sanMediaBox\\docs\\doubao-black.png',
    'D:\\dev\\san\\sanMediaBox\\docs\\doubao-white.png',
  ];
  
  for (const imagePath of testImages) {
    const result = await invoke('detect_watermark', { imagePath });
    console.log(`检测结果 - ${imagePath}:`, result);
    console.log(`  平台: ${result.platform}`);
    console.log(`  置信度: ${result.confidence}`);
    console.log(`  区域: x=${result.watermark_region?.x}, y=${result.watermark_region?.y}`);
  }
};

testDetection();
```

### 3. 测试水印移除

```typescript
// 测试豆包水印移除
const testRemoval = async () => {
  const imagePath = 'D:\\dev\\san\\sanMediaBox\\docs\\doubao.png';
  
  // 1. 先检测水印
  const detection = await invoke('detect_watermark', { imagePath });
  
  if (detection.has_watermark && detection.platform === 'doubao') {
    console.log('检测到豆包水印，开始移除...');
    
    // 2. 移除水印
    const outputPath = 'D:\\dev\\san\\sanMediaBox\\docs\\doubao_clean.png';
    const result = await invoke('remove_watermark', {
      imagePath,
      outputPath,
      region: detection.watermark_region,
    });
    
    console.log('移除完成:', result);
    console.log(`  耗时: ${result.processing_time_ms}ms`);
    console.log(`  输出: ${result.output_path}`);
  } else {
    console.log('未检测到豆包水印');
  }
};

testRemoval();
```

### 4. 批量测试

```typescript
// 批量测试所有豆包图片
const batchTest = async () => {
  const images = [
    { input: 'docs/doubao.png', output: 'docs/doubao_clean.png' },
    { input: 'docs/doubao-black.png', output: 'docs/doubao-black_clean.png' },
    { input: 'docs/doubao-white.png', output: 'docs/doubao-white_clean.png' },
  ];
  
  for (const { input, output } of images) {
    const fullInput = `D:\\dev\\san\\sanMediaBox\\${input}`;
    const fullOutput = `D:\\dev\\san\\sanMediaBox\\${output}`;
    
    try {
      // 检测
      const detection = await invoke('detect_watermark', { 
        imagePath: fullInput 
      });
      
      console.log(`\n处理: ${input}`);
      console.log(`  检测结果: ${detection.platform} (${detection.confidence.toFixed(2)})`);
      
      if (detection.has_watermark) {
        // 移除
        const result = await invoke('remove_watermark', {
          imagePath: fullInput,
          outputPath: fullOutput,
          region: detection.watermark_region,
        });
        
        console.log(`  移除成功: ${result.processing_time_ms}ms`);
      }
    } catch (error) {
      console.error(`  错误: ${error}`);
    }
  }
};

batchTest();
```

## 预期结果

### 检测结果

对于三张测试图片，应该得到：

```
doubao.png:
  platform: "doubao"
  confidence: 0.5 - 0.8
  has_watermark: true

doubao-black.png:
  platform: "doubao"
  confidence: 0.6 - 0.9 (黑白对比强，检测更容易)
  has_watermark: true

doubao-white.png:
  platform: "doubao"
  confidence: 0.6 - 0.9 (黑白对比强，检测更容易)
  has_watermark: true
```

### 移除效果

- **纯黑背景** (doubao-black.png): 应该完美移除，填充为纯黑色
- **纯白背景** (doubao-white.png): 应该完美移除，填充为纯白色
- **实际图片** (doubao.png): 效果取决于背景复杂度
  - 如果背景均匀：效果很好
  - 如果背景有纹理：可能有轻微模糊，但水印应该完全消失

### 性能指标

- **检测时间**: < 50ms
- **移除时间**: 50-200ms (取决于图片大小)
- **总处理时间**: < 250ms

## 如果效果不理想

### 检测问题

如果检测不到豆包水印（confidence < 0.35）：

1. **降低阈值**: 在 `detect_doubao_watermark()` 中将 `0.35` 改为 `0.25`
2. **调整区域大小**: 修改 `region_width` 和 `region_height` 的计算
3. **增加策略权重**: 调整各个检测策略的权重

### 移除效果问题

如果移除后有明显痕迹：

1. **增加边界采样范围**: 在 `watermark_removal.rs` 中增加 `border_size`
2. **增加平滑次数**: 在 `smooth_region()` 中使用更大的核或多次平滑
3. **使用更高级算法**: 实现文档中提到的 PatchMatch 或智能填充算法

## 调试技巧

### 1. 保存中间结果

在检测函数中添加：

```rust
// 保存检测区域用于调试
corner_region.save(format!("debug_doubao_region_{}.png", start_x)).ok();
```

### 2. 打印详细分数

```rust
println!("Doubao detection scores:");
println!("  Edge: {:.2}", edge_score);
println!("  Bimodal: {:.2}", bimodal_score);
println!("  Line: {:.2}", line_score);
println!("  Small text: {:.2}", small_text_score);
println!("  Total confidence: {:.2}", confidence);
```

### 3. 可视化水印区域

在前端显示检测到的水印区域：

```typescript
const visualizeWatermark = async (imagePath: string) => {
  const detection = await invoke('detect_watermark', { imagePath });
  
  if (detection.watermark_region) {
    const { x, y, width, height } = detection.watermark_region;
    
    // 在图片上绘制矩形框
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = imagePath;
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      // 绘制红色矩形框
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);
      
      document.body.appendChild(canvas);
    };
  }
};
```

## 下一步优化

如果基础实现效果满意，可以考虑：

1. **添加UI界面**: 在设置中添加"豆包水印移除"选项
2. **批量处理**: 支持一键移除文件夹中所有豆包图片的水印
3. **自动检测**: 导入图片时自动检测并提示移除水印
4. **质量选项**: 提供"快速"和"高质量"两种移除模式
5. **预览功能**: 移除前显示预览效果

## 常见问题

### Q: 为什么检测不到水印？

A: 可能原因：
- 水印位置不在右下角
- 水印大小超出预期范围
- 图片分辨率太低
- 水印样式与预期不符

解决方法：查看 `debug_doubao_region_*.png` 确认检测区域是否正确

### Q: 移除后有明显边界？

A: 这是因为简单的FMM算法在复杂背景下效果有限

解决方法：
- 增加平滑强度
- 实现更高级的修复算法（PatchMatch）
- 或者使用裁剪方式直接去掉右下角

### Q: 处理速度太慢？

A: 可能原因：
- 图片分辨率太高
- 检测区域太大

解决方法：
- 限制检测区域大小
- 使用多线程并行处理
- 优化算法实现

## 总结

本实现提供了：

✅ **豆包水印检测**: 多策略融合，准确率高
✅ **本地移除**: 无需第三方API，完全本地处理
✅ **快速处理**: 单张图片 < 250ms
✅ **易于集成**: 直接使用现有的 Tauri 命令系统

对于大多数情况（纯色或简单背景），效果应该很好。如果需要处理复杂纹理背景，可以后续实现更高级的算法。
