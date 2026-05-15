use image::{DynamicImage, ImageBuffer, Rgba};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Watermark removal result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatermarkRemovalResult {
    pub success: bool,
    pub output_path: String,
    pub method: String,
    pub processing_time_ms: u64,
}

/// Remove watermark from an image
#[tauri::command]
pub async fn remove_watermark(
    image_path: String,
    output_path: String,
    region: Option<WatermarkRegion>,
) -> Result<WatermarkRemovalResult, String> {
    let start = std::time::Instant::now();
    
    let input = Path::new(&image_path);
    let output = Path::new(&output_path);
    
    if !input.exists() {
        return Err(format!("Image file not found: {}", image_path));
    }
    
    // Load the image
    let img = image::open(input)
        .map_err(|e| format!("Failed to open image: {}", e))?;
    
    // Determine the watermark region
    let watermark_region = region.unwrap_or_else(|| {
        // Default: bottom-right corner (15% width, 5% height)
        let width = img.width();
        let height = img.height();
        WatermarkRegion {
            x: (width as f32 * 0.85) as u32,
            y: (height as f32 * 0.95) as u32,
            width: (width as f32 * 0.15) as u32,
            height: (height as f32 * 0.05) as u32,
        }
    });
    
    // Apply inpainting
    let result = inpaint_watermark(&img, &watermark_region)?;
    
    // Save the result
    result.save(output)
        .map_err(|e| format!("Failed to save image: {}", e))?;
    
    let processing_time = start.elapsed().as_millis() as u64;
    
    Ok(WatermarkRemovalResult {
        success: true,
        output_path: output_path.clone(),
        method: "fast_marching_inpainting".to_string(),
        processing_time_ms: processing_time,
    })
}

/// Region where watermark was detected
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatermarkRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Inpaint watermark region using Fast Marching Method approximation
fn inpaint_watermark(img: &DynamicImage, region: &WatermarkRegion) -> Result<DynamicImage, String> {
    let width = img.width();
    let height = img.height();
    
    // Ensure region is within bounds
    let x = region.x.min(width - 1);
    let y = region.y.min(height - 1);
    let w = region.width.min(width - x);
    let h = region.height.min(height - y);
    
    // Clone the image
    let mut result = img.to_rgba8();
    
    // Get surrounding pixels for inpainting
    let border_size = 5u32;
    
    // Sample colors from the border around the watermark region
    let samples = collect_border_samples(&result, x, y, w, h, border_size);
    
    if samples.is_empty() {
        return Ok(DynamicImage::ImageRgba8(result));
    }
    
    // Calculate average color from samples
    let avg_color = calculate_average_color(&samples);
    
    // Apply gradient-based inpainting
    for py in y..y + h {
        for px in x..x + w {
            // Calculate distance from border
            let dist_left = px.saturating_sub(x) as f32;
            let dist_right = (x + w - px) as f32;
            let dist_top = py.saturating_sub(y) as f32;
            let dist_bottom = (y + h - py) as f32;
            
            let min_dist = dist_left.min(dist_right).min(dist_top).min(dist_bottom);
            let max_dist = (w.min(h) / 2) as f32;
            
            // Blend factor based on distance from border
            let blend = if max_dist > 0.0 {
                (min_dist / max_dist).min(1.0)
            } else {
                1.0
            };
            
            // Get original pixel
            let original = result.get_pixel(px, py);
            
            // Blend with average color
            let blended = blend_pixels(original, &avg_color, blend);
            
            result.put_pixel(px, py, blended);
        }
    }
    
    // Apply additional smoothing to the inpainted region
    smooth_region(&mut result, x, y, w, h);
    
    Ok(DynamicImage::ImageRgba8(result))
}

/// Collect color samples from the border around a region
fn collect_border_samples(
    img: &ImageBuffer<Rgba<u8>, Vec<u8>>,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
    border_size: u32,
) -> Vec<Rgba<u8>> {
    let mut samples = Vec::new();
    let width = img.width();
    let height = img.height();
    
    // Sample from top border
    for dy in 1..=border_size {
        let sy = y.saturating_sub(dy);
        for sx in x..x + w {
            if sx < width && sy < height {
                samples.push(*img.get_pixel(sx, sy));
            }
        }
    }
    
    // Sample from bottom border
    for dy in 1..=border_size {
        let sy = (y + h + dy).min(height - 1);
        for sx in x..x + w {
            if sx < width && sy < height {
                samples.push(*img.get_pixel(sx, sy));
            }
        }
    }
    
    // Sample from left border
    for dx in 1..=border_size {
        let sx = x.saturating_sub(dx);
        for sy in y..y + h {
            if sx < width && sy < height {
                samples.push(*img.get_pixel(sx, sy));
            }
        }
    }
    
    // Sample from right border
    for dx in 1..=border_size {
        let sx = (x + w + dx).min(width - 1);
        for sy in y..y + h {
            if sx < width && sy < height {
                samples.push(*img.get_pixel(sx, sy));
            }
        }
    }
    
    samples
}

/// Calculate average color from samples
fn calculate_average_color(samples: &[Rgba<u8>]) -> Rgba<u8> {
    if samples.is_empty() {
        return Rgba([128, 128, 128, 255]);
    }
    
    let mut r_sum = 0u64;
    let mut g_sum = 0u64;
    let mut b_sum = 0u64;
    let mut a_sum = 0u64;
    
    for pixel in samples {
        r_sum += pixel[0] as u64;
        g_sum += pixel[1] as u64;
        b_sum += pixel[2] as u64;
        a_sum += pixel[3] as u64;
    }
    
    let count = samples.len() as u64;
    
    Rgba([
        (r_sum / count) as u8,
        (g_sum / count) as u8,
        (b_sum / count) as u8,
        (a_sum / count) as u8,
    ])
}

/// Blend two pixels
fn blend_pixels(original: &Rgba<u8>, fill: &Rgba<u8>, factor: f32) -> Rgba<u8> {
    let inv_factor = 1.0 - factor;
    
    Rgba([
        (original[0] as f32 * inv_factor + fill[0] as f32 * factor) as u8,
        (original[1] as f32 * inv_factor + fill[1] as f32 * factor) as u8,
        (original[2] as f32 * inv_factor + fill[2] as f32 * factor) as u8,
        (original[3] as f32 * inv_factor + fill[3] as f32 * factor) as u8,
    ])
}

/// Apply smoothing to a region
fn smooth_region(img: &mut ImageBuffer<Rgba<u8>, Vec<u8>>, x: u32, y: u32, w: u32, h: u32) {
    // Simple box blur with 3x3 kernel
    let width = img.width();
    let height = img.height();
    
    // Create a copy for reading
    let original = img.clone();
    
    for py in (y + 1)..(y + h - 1).min(height - 1) {
        for px in (x + 1)..(x + w - 1).min(width - 1) {
            let mut r_sum = 0u32;
            let mut g_sum = 0u32;
            let mut b_sum = 0u32;
            let mut count = 0u32;
            
            // 3x3 kernel
            for ky in -1i32..=1 {
                for kx in -1i32..=1 {
                    let nx = (px as i32 + kx) as u32;
                    let ny = (py as i32 + ky) as u32;
                    
                    if nx < width && ny < height {
                        let pixel = original.get_pixel(nx, ny);
                        r_sum += pixel[0] as u32;
                        g_sum += pixel[1] as u32;
                        b_sum += pixel[2] as u32;
                        count += 1;
                    }
                }
            }
            
            if count > 0 {
                let smoothed = Rgba([
                    (r_sum / count) as u8,
                    (g_sum / count) as u8,
                    (b_sum / count) as u8,
                    255,
                ]);
                img.put_pixel(px, py, smoothed);
            }
        }
    }
}

/// Batch remove watermarks from multiple images
#[tauri::command]
pub async fn batch_remove_watermarks(
    requests: Vec<WatermarkRemovalRequest>,
) -> Result<Vec<WatermarkRemovalResult>, String> {
    let mut results = Vec::new();
    
    for request in requests {
        let result = remove_watermark(
            request.image_path,
            request.output_path,
            request.region,
        ).await?;
        results.push(result);
    }
    
    Ok(results)
}

/// Request for watermark removal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatermarkRemovalRequest {
    pub image_path: String,
    pub output_path: String,
    pub region: Option<WatermarkRegion>,
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_watermark_removal_region() {
        let region = WatermarkRegion {
            x: 100,
            y: 200,
            width: 50,
            height: 30,
        };
        assert_eq!(region.x, 100);
        assert_eq!(region.width, 50);
    }
    
    #[test]
    fn test_average_color() {
        let samples = vec![
            Rgba([100, 150, 200, 255]),
            Rgba([110, 160, 210, 255]),
        ];
        let avg = calculate_average_color(&samples);
        assert_eq!(avg[0], 105);
        assert_eq!(avg[1], 155);
        assert_eq!(avg[2], 205);
    }
}
