
use serde::{Deserialize, Serialize};
use std::path::Path;

const BG_48_BYTES: &[u8] = include_bytes!("../assets/bg_48.png");
const BG_96_BYTES: &[u8] = include_bytes!("../assets/bg_96.png");

/// Gemini 水印移除结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeminiWatermarkRemovalResult {
    pub success: bool,
    pub output_path: String,
    pub method: String,
    pub processing_time_ms: u64,
    pub watermark_detected: bool,
    pub alpha_value: f32,
}

/// 水印区域定义（为了保持现有 API 兼容性保留，但内部将采用完全忠实于前端的处理逻辑）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatermarkRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// 水印颜色定义（为了保持现有 API 兼容性保留）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatermarkColor {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

/// 批量移除 Gemini 水印请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeminiWatermarkRemovalRequest {
    pub image_path: String,
    pub output_path: String,
    pub watermark_color: Option<WatermarkColor>,
    pub alpha: Option<f32>,
    pub region: Option<WatermarkRegion>,
}

/// 加载并解析透明度通道图 (loadAlphaMap)
fn load_alpha_map(size: u32) -> Result<Vec<f32>, String> {
    let bytes = match size {
        48 => BG_48_BYTES,
        96 => BG_96_BYTES,
        _ => return Err(format!("不支持的 alpha map 尺寸: {}", size)),
    };
    
    let img = image::load_from_memory(bytes)
        .map_err(|e| format!("无法解码内置 alpha map: {}", e))?;
    
    let img = img.to_rgba8();
    let mut alpha_map = vec![0.0; (size * size) as usize];
    
    // 提取 RGB 的最大值作为透明度
    for i in 0..(size * size) as usize {
        let y = i as u32 / size;
        let x = i as u32 % size;
        let pixel = img.get_pixel(x, y);
        
        let a = pixel[3] as f32 / 255.0;
        let r = pixel[0] as f32 * a;
        let g = pixel[1] as f32 * a;
        let b = pixel[2] as f32 * a;
        
        let max_channel = r.max(g).max(b);
        alpha_map[i] = max_channel / 255.0;
    }
    
    Ok(alpha_map)
}

/// 严格参考 useImageProcessor.ts 并加入 NCC 模板匹配增强的 Gemini 水印移除逻辑
#[tauri::command]
pub async fn remove_gemini_watermark(
    image_path: String,
    output_path: String,
    _watermark_color: Option<WatermarkColor>,
    _alpha: Option<f32>,
    _region: Option<WatermarkRegion>,
) -> Result<GeminiWatermarkRemovalResult, String> {
    let start = std::time::Instant::now();
    
    let input = Path::new(&image_path);
    let output = Path::new(&output_path);
    
    if !input.exists() {
        return Err(format!("图片文件未找到: {}", image_path));
    }
    
    let img = image::open(input).map_err(|e| format!("无法打开图片: {}", e))?;
    let mut result_img = img.to_rgba8();
    
    let width = result_img.width();
    let height = result_img.height();
    
    // 步骤一：使用 NCC (Normalized Cross-Correlation) 自动检测最佳的水印尺寸和位置
    let sizes_to_check = [96, 48];
    let mut best_overall_ncc = -1.0_f32;
    let mut best_match = None;
    
    for &wm_size in &sizes_to_check {
        if width < wm_size || height < wm_size {
            continue;
        }
        
        let alpha_map = match load_alpha_map(wm_size) {
            Ok(map) => map,
            Err(_) => continue,
        };
        
        // 收集有效像素以加速 NCC 计算并提高精度
        struct ActivePixel {
            x: u32,
            y: u32,
            alpha: f32,
        }
        let mut active_pixels = Vec::with_capacity((wm_size * wm_size) as usize);
        for row in 0..wm_size {
            for col in 0..wm_size {
                let alpha = alpha_map[(row * wm_size + col) as usize];
                if alpha > 0.02 { // 过滤掉背景
                    active_pixels.push(ActivePixel { x: col, y: row, alpha });
                }
            }
        }
        
        if active_pixels.is_empty() { continue; }
        let n = active_pixels.len() as f32;
        
        let mut mean_a = 0.0;
        for p in &active_pixels { mean_a += p.alpha; }
        mean_a /= n;
        
        let mut var_a = 0.0;
        for p in &active_pixels { var_a += (p.alpha - mean_a) * (p.alpha - mean_a); }
        let std_a = var_a.sqrt();
        if std_a == 0.0 { continue; }
        
        // 在右下角区域搜索 (允许边距 0~128 像素)
        let search_w = 128.min(width - wm_size);
        let search_h = 128.min(height - wm_size);
        
        let start_x = width.saturating_sub(wm_size).saturating_sub(search_w);
        let start_y = height.saturating_sub(wm_size).saturating_sub(search_h);
        let end_x = width.saturating_sub(wm_size);
        let end_y = height.saturating_sub(wm_size);
        
        for y in start_y..=end_y {
            for x in start_x..=end_x {
                let mut mean_l = 0.0;
                for p in &active_pixels {
                    let pixel = result_img.get_pixel(x + p.x, y + p.y);
                    let l = 0.299 * pixel[0] as f32 + 0.587 * pixel[1] as f32 + 0.114 * pixel[2] as f32;
                    mean_l += l;
                }
                mean_l /= n;
                
                let mut cov = 0.0;
                let mut var_l = 0.0;
                for p in &active_pixels {
                    let pixel = result_img.get_pixel(x + p.x, y + p.y);
                    let l = 0.299 * pixel[0] as f32 + 0.587 * pixel[1] as f32 + 0.114 * pixel[2] as f32;
                    
                    let da = p.alpha - mean_a;
                    let dl = l - mean_l;
                    
                    cov += da * dl;
                    var_l += dl * dl;
                }
                
                let std_l = var_l.sqrt();
                if std_l > 0.0 {
                    let ncc = cov / (std_a * std_l);
                    if ncc > best_overall_ncc {
                        best_overall_ncc = ncc;
                        best_match = Some((wm_size, x, y, alpha_map.clone()));
                    }
                }
            }
        }
    }
    
    // 步骤二：像素级反算重建
    let (wm_size, target_x, target_y, alpha_map) = if let Some(match_info) = best_match {
        if best_overall_ncc > 0.3 {
            match_info
        } else {
            // 如果置信度过低，回退到默认启发式算法位置
            let is_large = width > 1024 && height > 1024;
            let fallback_size = if is_large { 96 } else { 48 };
            let margin = if is_large { 64 } else { 32 };
            let fallback_x = width.saturating_sub(fallback_size).saturating_sub(margin);
            let fallback_y = height.saturating_sub(fallback_size).saturating_sub(margin);
            let fallback_map = load_alpha_map(fallback_size)?;
            (fallback_size, fallback_x, fallback_y, fallback_map)
        }
    } else {
        return Err("无法检测或加载水印模板".to_string());
    };
    
    let alpha_threshold: f32 = 0.002;
    let max_alpha: f32 = 0.99;
    let logo_value: f32 = 255.0;
    
    for row in 0..wm_size {
        for col in 0..wm_size {
            let alpha_idx = (row * wm_size + col) as usize;
            let mut alpha = alpha_map[alpha_idx];
            
            // 忽略透明度极低的非水印像素
            if alpha < alpha_threshold {
                continue;
            }
            // 限制最大透明度，避免分母为零
            if alpha > max_alpha {
                alpha = max_alpha;
            }
            
            let px = target_x + col;
            let py = target_y + row;
            
            if px >= width || py >= height {
                continue;
            }
            
            let mut pixel = result_img.get_pixel(px, py).clone();
            
            for c in 0..3 {
                let watermarked = pixel[c] as f32;
                // 核心还原公式：I = (J - alpha * W) / (1 - alpha)
                let original = (watermarked - alpha * logo_value) / (1.0 - alpha);
                // 截断至合法像素范围 [0, 255]
                pixel[c] = original.max(0.0).min(255.0) as u8;
            }
            
            result_img.put_pixel(px, py, pixel);
        }
    }
    
    result_img.save(output).map_err(|e| format!("无法保存图片: {}", e))?;
    
    let processing_time = start.elapsed().as_millis() as u64;
    
    Ok(GeminiWatermarkRemovalResult {
        success: true,
        output_path: output_path.clone(),
        method: format!("gemini_ncc_pixel_reconstruction (size: {}, conf: {:.2})", wm_size, best_overall_ncc),
        processing_time_ms: processing_time,
        watermark_detected: best_overall_ncc > 0.3,
        alpha_value: 1.0, // 此参数已废弃，填充默认值
    })
}

/// 批量移除 Gemini 水印
#[tauri::command]
pub async fn batch_remove_gemini_watermarks(
    requests: Vec<GeminiWatermarkRemovalRequest>,
) -> Result<Vec<GeminiWatermarkRemovalResult>, String> {
    let mut results = Vec::new();
    for request in requests {
        let result = remove_gemini_watermark(
            request.image_path,
            request.output_path,
            request.watermark_color,
            request.alpha,
            request.region,
        ).await?;
        results.push(result);
    }
    Ok(results)
}

/// 自动检测并移除 Gemini 水印（一键操作）
#[tauri::command]
pub async fn auto_remove_gemini_watermark(
    image_path: String,
    output_path: String,
) -> Result<GeminiWatermarkRemovalResult, String> {
    remove_gemini_watermark(
        image_path,
        output_path,
        None,
        None,
        None,
    ).await
}
