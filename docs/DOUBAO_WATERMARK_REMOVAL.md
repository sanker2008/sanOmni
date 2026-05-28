# 豆包水印本地移除方案

## 问题描述

豆包（Doubao）AI生成的图片在右下角有水印标识，需要在不依赖第三方API的情况下本地移除。

## 水印特征分析

基于提供的样本图片（`doubao.png`, `doubao-black.png`, `doubao-white.png`），豆包水印具有以下特征：

### 位置特征
- **位置**: 图片右下角
- **大小**: 通常占图片宽度的 10-15%，高度的 3-5%
- **典型尺寸**: 约 100-200px 宽，20-50px 高

### 视觉特征
- **内容**: 文字标识（可能包含"豆包"、"Doubao"、logo等）
- **颜色**: 
  - 在深色背景上使用浅色/白色文字
  - 在浅色背景上使用深色/黑色文字
  - 可能有半透明效果或阴影
- **字体**: 小号字体，清晰可辨

## 本地移除方案

### 方案1: 内容感知填充（Content-Aware Fill）⭐ 推荐

**原理**: 使用周围像素的信息智能填充水印区域

**实现方法**:

#### 1.1 快速行进法（Fast Marching Method）

```rust
// 已在 watermark_removal.rs 中实现
pub async fn remove_watermark(
    image_path: String,
    output_path: String,
    region: Option<WatermarkRegion>,
) -> Result<WatermarkRemovalResult, String>
```

**优点**:
- ✅ 已实现，可直接使用
- ✅ 速度快（通常 < 100ms）
- ✅ 无需外部依赖
- ✅ 效果较好，适合简单背景

**缺点**:
- ❌ 复杂纹理效果一般
- ❌ 可能有轻微模糊

**适用场景**: 背景相对均匀的图片

#### 1.2 改进的修复算法（Telea/Navier-Stokes）

```rust
// 需要实现
fn inpaint_telea(img: &DynamicImage, mask: &GrayImage) -> DynamicImage {
    // Telea算法: 基于快速行进法的改进版本
    // 1. 从边界向内逐步填充
    // 2. 使用加权平均考虑距离和梯度
    // 3. 保持纹理连续性
}
```

**优点**:
- ✅ 效果比简单FMM更好
- ✅ 保持纹理连续性
- ✅ 仍然是纯本地算法

**缺点**:
- ❌ 需要额外实现
- ❌ 计算稍慢（200-500ms）

**实现难度**: 中等

### 方案2: 基于PatchMatch的修复 ⭐⭐ 最佳效果

**原理**: 在图片其他区域寻找相似的纹理块来填充水印区域

```rust
// 需要实现
fn inpaint_patchmatch(img: &DynamicImage, mask: &GrayImage, patch_size: u32) -> DynamicImage {
    // 1. 将水印区域分成小块（如7x7像素）
    // 2. 在非水印区域搜索最相似的块
    // 3. 复制相似块填充
    // 4. 边界混合避免接缝
}
```

**优点**:
- ✅ 效果最好，接近Photoshop的内容感知填充
- ✅ 适合复杂纹理和背景
- ✅ 纯本地算法，无需外部依赖

**缺点**:
- ❌ 实现复杂度高
- ❌ 计算较慢（1-3秒）
- ❌ 需要较多代码

**实现难度**: 高

**参考实现**:
```rust
// 简化的PatchMatch伪代码
fn find_best_match(source: &Image, target_patch: &Patch, mask: &Mask) -> (u32, u32) {
    let mut best_pos = (0, 0);
    let mut best_score = f32::MAX;
    
    // 随机初始化
    let mut current_pos = random_position();
    
    // 迭代优化
    for iteration in 0..5 {
        // 1. 传播：检查邻居的匹配
        for neighbor in get_neighbors(current_pos) {
            let score = compute_ssd(source, target_patch, neighbor);
            if score < best_score {
                best_score = score;
                best_pos = neighbor;
            }
        }
        
        // 2. 随机搜索：在逐渐缩小的范围内随机搜索
        let mut search_radius = source.width().max(source.height()) / 2;
        while search_radius > 1 {
            let random_pos = current_pos + random_offset(search_radius);
            let score = compute_ssd(source, target_patch, random_pos);
            if score < best_score {
                best_score = score;
                best_pos = random_pos;
            }
            search_radius /= 2;
        }
        
        current_pos = best_pos;
    }
    
    best_pos
}
```

### 方案3: 简单裁剪 ⭐ 最简单

**原理**: 直接裁掉右下角包含水印的区域

```rust
fn remove_watermark_by_crop(img: &DynamicImage, margin_percent: f32) -> DynamicImage {
    let width = img.width();
    let height = img.height();
    
    // 裁掉右下角5%的区域
    let new_width = (width as f32 * (1.0 - margin_percent)) as u32;
    let new_height = (height as f32 * (1.0 - margin_percent)) as u32;
    
    img.crop_imm(0, 0, new_width, new_height)
}
```

**优点**:
- ✅ 实现极简单
- ✅ 速度极快
- ✅ 100%移除水印

**缺点**:
- ❌ 损失图片内容
- ❌ 改变图片尺寸
- ❌ 如果主体内容在边缘会被裁掉

**适用场景**: 水印区域没有重要内容的图片

### 方案4: 基于边界的智能填充 ⭐⭐ 平衡方案

**原理**: 分析水印边界的颜色和纹理，使用多种策略混合填充

```rust
fn inpaint_smart(img: &DynamicImage, region: &WatermarkRegion) -> DynamicImage {
    let mut result = img.clone();
    
    // 1. 采集边界样本
    let border_samples = collect_border_samples(&img, region, 10);
    
    // 2. 分析背景类型
    let bg_type = analyze_background_type(&border_samples);
    
    // 3. 根据背景类型选择策略
    match bg_type {
        BackgroundType::Solid => {
            // 纯色背景：使用平均颜色填充
            fill_with_average_color(&mut result, region, &border_samples);
        }
        BackgroundType::Gradient => {
            // 渐变背景：使用双线性插值
            fill_with_gradient(&mut result, region, &border_samples);
        }
        BackgroundType::Textured => {
            // 纹理背景：使用纹理合成
            fill_with_texture(&mut result, region, &border_samples);
        }
    }
    
    // 4. 边界羽化
    feather_edges(&mut result, region, 5);
    
    result
}

enum BackgroundType {
    Solid,      // 纯色或接近纯色
    Gradient,   // 渐变
    Textured,   // 有纹理
}

fn analyze_background_type(samples: &[Rgba<u8>]) -> BackgroundType {
    // 计算颜色方差
    let variance = calculate_color_variance(samples);
    
    if variance < 100.0 {
        BackgroundType::Solid
    } else if is_gradient(samples) {
        BackgroundType::Gradient
    } else {
        BackgroundType::Textured
    }
}
```

**优点**:
- ✅ 自适应不同背景类型
- ✅ 效果好于简单FMM
- ✅ 实现难度适中
- ✅ 速度较快（100-300ms）

**缺点**:
- ❌ 需要实现多种填充策略
- ❌ 复杂纹理仍不如PatchMatch

**实现难度**: 中等

## 豆包水印检测实现

在移除之前，需要先检测水印位置：

```rust
/// 检测豆包水印
fn detect_doubao_watermark(img: &DynamicImage) -> WatermarkDetectionResult {
    let width = img.width();
    let height = img.height();
    
    // 豆包水印在右下角，通常是文字
    let region_width = (width as f32 * 0.15).max(100.0).min(250.0) as u32;
    let region_height = (height as f32 * 0.05).max(20.0).min(60.0) as u32;
    
    let start_x = width.saturating_sub(region_width);
    let start_y = height.saturating_sub(region_height);
    
    let corner_region = img.crop_imm(start_x, start_y, region_width, region_height);
    
    let mut scores = Vec::new();
    
    // 策略1: 文字边缘检测（豆包使用清晰文字）
    let edge_score = detect_text_edges(&corner_region.to_luma8());
    scores.push(edge_score * 0.3);
    
    // 策略2: 双色模式检测（文字+背景）
    let bimodal_score = detect_bimodal_distribution(&corner_region);
    scores.push(bimodal_score * 0.25);
    
    // 策略3: 水平文字行检测
    let line_score = detect_horizontal_text_lines(&corner_region.to_luma8());
    scores.push(line_score * 0.25);
    
    // 策略4: 小文字特征（豆包使用较小字体）
    let small_text_score = detect_small_text_features(&corner_region);
    scores.push(small_text_score * 0.2);
    
    let confidence = scores.iter().sum::<f32>().min(0.95);
    
    WatermarkDetectionResult {
        has_watermark: confidence > 0.35,
        platform: if confidence > 0.35 { Some("doubao".to_string()) } else { None },
        confidence,
        watermark_region: Some(WatermarkRegion {
            x: start_x,
            y: start_y,
            width: region_width,
            height: region_height,
        }),
        detection_method: "doubao_multi_strategy".to_string(),
    }
}

/// 检测双色分布（文字水印的典型特征）
fn detect_bimodal_distribution(img: &DynamicImage) -> f32 {
    let mut histogram = vec![0u32; 256];
    
    for pixel in img.pixels() {
        let brightness = (pixel.2[0] as u32 + pixel.2[1] as u32 + pixel.2[2] as u32) / 3;
        histogram[brightness as usize] += 1;
    }
    
    // 寻找两个峰值（背景和文字）
    let peaks = find_peaks(&histogram, 2);
    
    if peaks.len() >= 2 {
        // 检查两个峰值是否足够分离
        let separation = (peaks[1] as i32 - peaks[0] as i32).abs();
        if separation > 80 {
            return 0.9;
        } else if separation > 50 {
            return 0.6;
        }
    }
    
    0.0
}

/// 检测小文字特征
fn detect_small_text_features(img: &DynamicImage) -> f32 {
    let width = img.width();
    let height = img.height();
    
    // 豆包文字通常高度在15-40像素
    if height < 15 || height > 60 {
        return 0.0;
    }
    
    // 检测文字的纵横比
    let aspect_ratio = width as f32 / height as f32;
    
    // 文字水印通常是横向的，宽度是高度的3-8倍
    if aspect_ratio > 3.0 && aspect_ratio < 10.0 {
        0.8
    } else if aspect_ratio > 2.0 && aspect_ratio < 12.0 {
        0.5
    } else {
        0.0
    }
}

fn find_peaks(histogram: &[u32], num_peaks: usize) -> Vec<usize> {
    let mut peaks = Vec::new();
    let threshold = histogram.iter().sum::<u32>() / (histogram.len() as u32 * 10);
    
    for i in 1..histogram.len()-1 {
        if histogram[i] > threshold 
            && histogram[i] > histogram[i-1] 
            && histogram[i] > histogram[i+1] {
            peaks.push(i);
        }
    }
    
    // 返回最高的几个峰值
    peaks.sort_by(|a, b| histogram[*b].cmp(&histogram[*a]));
    peaks.truncate(num_peaks);
    peaks.sort();
    peaks
}
```

## 推荐实现方案

### 短期方案（1-2小时实现）

1. **扩展现有的 `watermark.rs`**，添加豆包检测：
   ```rust
   // 在 watermark.rs 中添加
   fn detect_doubao_watermark(img: &DynamicImage) -> WatermarkDetectionResult
   ```

2. **使用现有的 `watermark_removal.rs`** 进行移除：
   - 已实现的FMM算法对大多数情况足够好
   - 可以直接调用 `remove_watermark()` 函数

3. **测试和调优**：
   - 使用提供的三张样本图片测试
   - 调整检测区域大小和阈值
   - 验证移除效果

### 中期方案（1-2天实现）

实现**方案4: 基于边界的智能填充**：

1. 分析背景类型（纯色/渐变/纹理）
2. 针对不同背景使用不同策略
3. 添加边界羽化和平滑
4. 提供多个质量级别选项

### 长期方案（1周实现）

实现**方案2: PatchMatch修复**：

1. 实现PatchMatch算法核心
2. 优化性能（使用并行计算）
3. 添加进度回调
4. 提供高质量修复选项

## 代码集成位置

```
src-tauri/src/commands/
├── watermark.rs              # 添加 detect_doubao_watermark()
├── watermark_removal.rs      # 已有实现可直接使用
└── doubao_watermark.rs       # 新建：豆包专用的高级移除算法（可选）
```

## 使用示例

```rust
// 1. 检测豆包水印
let detection = detect_watermark("doubao.png").await?;

if detection.platform == Some("doubao".to_string()) {
    // 2. 移除水印
    let result = remove_watermark(
        "doubao.png".to_string(),
        "doubao_clean.png".to_string(),
        detection.watermark_region,
    ).await?;
    
    println!("水印已移除，耗时: {}ms", result.processing_time_ms);
}
```

## 测试计划

### 测试用例

1. **doubao-black.png**: 黑色背景 + 白色文字
2. **doubao-white.png**: 白色背景 + 黑色文字  
3. **doubao.png**: 实际图片背景

### 评估指标

1. **检测准确率**: 是否正确识别水印位置
2. **移除质量**: 视觉评估移除后的效果
3. **处理速度**: 单张图片处理时间
4. **边界自然度**: 填充区域与周围的融合程度

### 预期结果

- **检测准确率**: > 95%
- **处理速度**: < 200ms（FMM）或 < 2s（PatchMatch）
- **移除质量**: 
  - 纯色背景: 完美
  - 渐变背景: 优秀
  - 复杂纹理: 良好（FMM）或优秀（PatchMatch）

## 总结

### 立即可用的方案

使用现有的 `watermark_removal.rs` 中的 FMM 算法：

```rust
// 在 watermark.rs 中添加豆包检测
// 然后直接使用现有的移除功能
```

**优点**: 
- ✅ 无需额外实现
- ✅ 速度快
- ✅ 对大多数情况效果可接受

### 最佳效果方案

实现 PatchMatch 算法：

```rust
// 新建 doubao_watermark.rs
// 实现高质量的纹理合成修复
```

**优点**:
- ✅ 效果最好
- ✅ 适合所有背景类型
- ✅ 接近专业工具水平

**缺点**:
- ❌ 实现复杂
- ❌ 需要更多开发时间

### 推荐路线

1. **第一步**: 添加豆包检测到 `watermark.rs`（30分钟）
2. **第二步**: 使用现有FMM算法测试效果（10分钟）
3. **第三步**: 根据效果决定是否需要实现更高级算法

## 参考资料

- [Fast Marching Method](https://en.wikipedia.org/wiki/Fast_marching_method)
- [PatchMatch Algorithm](https://gfx.cs.princeton.edu/pubs/Barnes_2009_PAR/)
- [Telea Inpainting](https://www.researchgate.net/publication/238183352_An_Image_Inpainting_Technique_Based_on_the_Fast_Marching_Method)
- [OpenCV Inpainting](https://docs.opencv.org/4.x/df/d3d/tutorial_py_inpainting.html)

## 更新日期

2026-05-28
