use image::{DynamicImage, GenericImageView};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Watermark detection result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatermarkDetectionResult {
    pub has_watermark: bool,
    pub platform: Option<String>,
    pub confidence: f32,
    pub watermark_region: Option<WatermarkRegion>,
    pub detection_method: String,
}

/// Region where watermark was detected
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatermarkRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Supported watermark platforms
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WatermarkPlatform {
    #[serde(rename = "gemini")]
    Gemini,
    #[serde(rename = "dalle")]
    DallE,
    #[serde(rename = "midjourney")]
    Midjourney,
    #[serde(rename = "unknown")]
    Unknown,
}

/// Detect watermark in an image
#[tauri::command]
pub async fn detect_watermark(image_path: String) -> Result<WatermarkDetectionResult, String> {
    let path = Path::new(&image_path);
    
    if !path.exists() {
        return Err(format!("Image file not found: {}", image_path));
    }
    
    // Load the image
    let img = image::open(path)
        .map_err(|e| format!("Failed to open image: {}", e))?;
    
    // Run all detection methods
    let results = vec![
        detect_gemini_watermark(&img),
        detect_dalle_watermark(&img),
        detect_midjourney_watermark(&img),
    ];
    
    // Find the best match
    let best = results
        .into_iter()
        .filter(|r| r.has_watermark)
        .max_by(|a, b| {
            a.confidence
                .partial_cmp(&b.confidence)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    
    Ok(best.unwrap_or(WatermarkDetectionResult {
        has_watermark: false,
        platform: None,
        confidence: 0.0,
        watermark_region: None,
        detection_method: "none".to_string(),
    }))
}

/// Detect Gemini watermark (right-bottom corner "AI-generated" text)
fn detect_gemini_watermark(img: &DynamicImage) -> WatermarkDetectionResult {
    let width = img.width();
    let height = img.height();
    
    // Gemini watermark is typically in the bottom-right corner
    // Check a region of about 150x30 pixels from the bottom-right
    let region_width = (width as f32 * 0.15).min(200.0) as u32;
    let region_height = (height as f32 * 0.05).min(50.0) as u32;
    
    let start_x = width.saturating_sub(region_width);
    let start_y = height.saturating_sub(region_height);
    
    // Analyze the corner region
    let corner_region = img.crop_imm(start_x, start_y, region_width, region_height);
    
    // Gemini watermarks typically have:
    // 1. Semi-transparent text
    // 2. Low contrast with background
    // 3. Specific color patterns (usually white/light text with shadow)
    
    let mut text_pixel_count = 0;
    let mut total_pixels = 0;
    
    for pixel in corner_region.pixels() {
        let rgba = pixel.2;
        let r = rgba[0] as f32;
        let g = rgba[1] as f32;
        let b = rgba[2] as f32;
        let a = rgba[3] as f32;
        
        // Check for semi-transparent pixels (watermark characteristic)
        if a > 100.0 && a < 255.0 {
            // Check for light-colored text (white/gray)
            let brightness = (r + g + b) / 3.0;
            if brightness > 150.0 {
                text_pixel_count += 1;
            }
        }
        total_pixels += 1;
    }
    
    let ratio = text_pixel_count as f32 / total_pixels as f32;
    
    // Gemini watermark typically has 5-20% semi-transparent pixels in corner
    let has_gemini_pattern = ratio > 0.03 && ratio < 0.35;
    
    // Additional check: look for "AI" pattern by checking horizontal lines
    let has_ai_pattern = check_ai_text_pattern(&corner_region);
    
    let confidence = if has_gemini_pattern && has_ai_pattern {
        0.85
    } else if has_gemini_pattern {
        0.65
    } else if has_ai_pattern {
        0.55
    } else {
        ratio * 2.0 // Low confidence based on pixel ratio
    };
    
    WatermarkDetectionResult {
        has_watermark: confidence > 0.5,
        platform: if confidence > 0.5 { Some("gemini".to_string()) } else { None },
        confidence,
        watermark_region: Some(WatermarkRegion {
            x: start_x,
            y: start_y,
            width: region_width,
            height: region_height,
        }),
        detection_method: "gemini_corner_analysis".to_string(),
    }
}

/// Check for "AI" text pattern in region
fn check_ai_text_pattern(img: &DynamicImage) -> bool {
    let width = img.width();
    let height = img.height();
    
    // Look for vertical lines (characteristic of "I" and "A")
    let mut vertical_lines = 0;
    let threshold = 0.7;
    
    for x in 0..width {
        let mut consecutive = 0;
        for y in 0..height {
            let pixel = img.get_pixel(x, y);
            let brightness = (pixel[0] as f32 + pixel[1] as f32 + pixel[2] as f32) / 3.0;
            if brightness > 150.0 {
                consecutive += 1;
            }
        }
        if consecutive as f32 / height as f32 > threshold {
            vertical_lines += 1;
        }
    }
    
    // "AI" text typically has 2-4 strong vertical lines
    vertical_lines >= 2 && vertical_lines <= 8
}

/// Detect DALL-E watermark (colorful dots pattern)
fn detect_dalle_watermark(img: &DynamicImage) -> WatermarkDetectionResult {
    let width = img.width();
    let height = img.height();
    
    // DALL-E 3 uses a pattern of colorful dots in the bottom-right corner
    let region_size = (width.min(height) as f32 * 0.1).min(100.0) as u32;
    let start_x = width.saturating_sub(region_size);
    let start_y = height.saturating_sub(region_size);
    
    let corner_region = img.crop_imm(start_x, start_y, region_size, region_size);
    
    // Look for colorful dots pattern
    let mut color_variety = std::collections::HashSet::new();
    let mut bright_pixels = 0;
    let mut total_pixels = 0;
    
    for pixel in corner_region.pixels() {
        let rgba = pixel.2;
        let r = rgba[0];
        let g = rgba[1];
        let b = rgba[2];
        
        // Quantize colors to detect variety
        let color_key = (r / 32, g / 32, b / 32);
        color_variety.insert(color_key);
        
        // Count bright, saturated pixels
        let max = r.max(g).max(b);
        let min = r.min(g).min(b);
        let saturation = if max > 0 { (max - min) as f32 / max as f32 } else { 0.0 };
        
        if saturation > 0.5 && max > 150 {
            bright_pixels += 1;
        }
        total_pixels += 1;
    }
    
    let color_variety_score = color_variety.len() as f32 / 64.0; // Max possible quantized colors
    let bright_ratio = bright_pixels as f32 / total_pixels as f32;
    
    // DALL-E watermark has high color variety and scattered bright pixels
    let has_dalle_pattern = color_variety_score > 0.3 && bright_ratio > 0.1 && bright_ratio < 0.5;
    
    let confidence = if has_dalle_pattern {
        0.7 + color_variety_score * 0.2
    } else {
        0.0
    };
    
    WatermarkDetectionResult {
        has_watermark: confidence > 0.5,
        platform: if confidence > 0.5 { Some("dalle".to_string()) } else { None },
        confidence,
        watermark_region: Some(WatermarkRegion {
            x: start_x,
            y: start_y,
            width: region_size,
            height: region_size,
        }),
        detection_method: "dalle_color_pattern".to_string(),
    }
}

/// Detect Midjourney watermark (bottom-right identifier)
fn detect_midjourney_watermark(img: &DynamicImage) -> WatermarkDetectionResult {
    let width = img.width();
    let height = img.height();
    
    // Midjourney watermark is typically in the bottom-right corner
    let region_width = (width as f32 * 0.2).min(250.0) as u32;
    let region_height = (height as f32 * 0.08).min(80.0) as u32;
    
    let start_x = width.saturating_sub(region_width);
    let start_y = height.saturating_sub(region_height);
    
    let corner_region = img.crop_imm(start_x, start_y, region_width, region_height);
    
    // Midjourney watermarks typically have:
    // 1. User identifier text
    // 2. Version info
    // 3. Usually white or light colored
    
    let mut light_pixel_rows = vec![0u32; region_height as usize];
    
    for (_x, y, pixel) in corner_region.pixels() {
        let brightness = (pixel[0] as f32 + pixel[1] as f32 + pixel[2] as f32) / 3.0;
        if brightness > 180.0 {
            light_pixel_rows[y as usize] += 1;
        }
    }
    
    // Look for horizontal text lines (consecutive rows with light pixels)
    let mut text_lines = 0;
    let mut in_line = false;
    let threshold = region_width as f32 * 0.2;
    
    for count in light_pixel_rows {
        if count as f32 > threshold {
            if !in_line {
                text_lines += 1;
                in_line = true;
            }
        } else {
            in_line = false;
        }
    }
    
    // Midjourney typically has 1-2 text lines
    let has_mj_pattern = text_lines >= 1 && text_lines <= 3;
    
    // Additional check for MJ-specific patterns
    let has_grid_pattern = check_midjourney_grid(&corner_region);
    
    let confidence = if has_mj_pattern && has_grid_pattern {
        0.8
    } else if has_mj_pattern {
        0.6
    } else {
        0.0
    };
    
    WatermarkDetectionResult {
        has_watermark: confidence > 0.5,
        platform: if confidence > 0.5 { Some("midjourney".to_string()) } else { None },
        confidence,
        watermark_region: Some(WatermarkRegion {
            x: start_x,
            y: start_y,
            width: region_width,
            height: region_height,
        }),
        detection_method: "midjourney_text_analysis".to_string(),
    }
}

/// Check for Midjourney grid pattern (characteristic of MJ outputs)
fn check_midjourney_grid(img: &DynamicImage) -> bool {
    // Midjourney images sometimes have a subtle grid pattern
    // This is a simplified check
    let width = img.width();
    let height = img.height();
    
    if width < 10 || height < 10 {
        return false;
    }
    
    // Sample pixels at regular intervals
    let step: u32 = 5;
    let mut pattern_count = 0;
    let mut total_checks = 0;
    
    for y in (0..height.saturating_sub(step)).step_by(step as usize) {
        for x in (0..width.saturating_sub(step)).step_by(step as usize) {
            let p1 = img.get_pixel(x, y);
            let p2 = img.get_pixel(x + step, y + step);
            
            // Check if diagonal pixels are similar (grid characteristic)
            let diff = (p1[0] as i32 - p2[0] as i32).abs()
                + (p1[1] as i32 - p2[1] as i32).abs()
                + (p1[2] as i32 - p2[2] as i32).abs();
            
            if diff < 30 {
                pattern_count += 1;
            }
            total_checks += 1;
        }
    }
    
    let pattern_ratio = pattern_count as f32 / total_checks as f32;
    pattern_ratio > 0.4
}

/// Batch detect watermarks for multiple images
#[tauri::command]
pub async fn batch_detect_watermarks(image_paths: Vec<String>) -> Result<Vec<WatermarkDetectionResult>, String> {
    let mut results = Vec::new();
    
    for path in image_paths {
        let result = detect_watermark(path).await?;
        results.push(result);
    }
    
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_watermark_region_size() {
        let region = WatermarkRegion {
            x: 100,
            y: 200,
            width: 50,
            height: 30,
        };
        assert_eq!(region.x, 100);
        assert_eq!(region.width, 50);
    }
}
