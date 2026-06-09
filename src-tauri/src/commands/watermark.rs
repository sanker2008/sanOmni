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
    let img = image::open(path).map_err(|e| format!("Failed to open image: {}", e))?;

    // Run all detection methods
    let results = vec![
        detect_gemini_watermark(&img),
        detect_dalle_watermark(&img),
        detect_midjourney_watermark(&img),
        detect_doubao_watermark(&img),
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

    // Gemini watermark is in the bottom-right corner, typically 150-200px wide, 20-40px tall
    let region_width = (width as f32 * 0.12).max(120.0).min(250.0) as u32;
    let region_height = (height as f32 * 0.04).max(20.0).min(60.0) as u32;

    let start_x = width.saturating_sub(region_width);
    let start_y = height.saturating_sub(region_height);

    let corner_region = img.crop_imm(start_x, start_y, region_width, region_height);

    // Convert to grayscale for better analysis
    let gray = corner_region.to_luma8();

    // Multiple detection strategies
    let mut scores = Vec::new();

    // Strategy 1: Text edge detection
    let edge_score = detect_text_edges(&gray);
    scores.push(edge_score);

    // Strategy 2: Horizontal text line detection
    let line_score = detect_horizontal_text_lines(&gray);
    scores.push(line_score);

    // Strategy 3: Character pattern detection (look for "AI" or "generated")
    let pattern_score = detect_gemini_text_pattern(&corner_region);
    scores.push(pattern_score);

    // Strategy 4: Color consistency check (Gemini uses consistent gray/white text)
    let color_score = detect_gemini_color_pattern(&corner_region);
    scores.push(color_score);

    // Strategy 5: Shadow detection (Gemini text often has subtle shadow)
    let shadow_score = detect_text_shadow(&corner_region);
    scores.push(shadow_score);

    // Weighted average of all scores
    let confidence = (edge_score * 0.25
        + line_score * 0.2
        + pattern_score * 0.3
        + color_score * 0.15
        + shadow_score * 0.1)
        .min(0.95);

    WatermarkDetectionResult {
        has_watermark: confidence > 0.4, // Lower threshold for better detection
        platform: if confidence > 0.4 {
            Some("gemini".to_string())
        } else {
            None
        },
        confidence,
        watermark_region: Some(WatermarkRegion {
            x: start_x,
            y: start_y,
            width: region_width,
            height: region_height,
        }),
        detection_method: "gemini_multi_strategy".to_string(),
    }
}

/// Detect text edges using Sobel-like edge detection
fn detect_text_edges(gray: &image::GrayImage) -> f32 {
    let width = gray.width();
    let height = gray.height();

    if width < 3 || height < 3 {
        return 0.0;
    }

    let mut edge_pixels = 0;
    let mut total_pixels = 0;

    for y in 1..height - 1 {
        for x in 1..width - 1 {
            let center = gray.get_pixel(x, y)[0] as i32;

            // Horizontal gradient
            let gx =
                (gray.get_pixel(x + 1, y)[0] as i32 - gray.get_pixel(x - 1, y)[0] as i32).abs();
            // Vertical gradient
            let gy =
                (gray.get_pixel(x, y + 1)[0] as i32 - gray.get_pixel(x, y - 1)[0] as i32).abs();

            let gradient = ((gx * gx + gy * gy) as f32).sqrt();

            if gradient > 30.0 && center > 100 {
                edge_pixels += 1;
            }
            total_pixels += 1;
        }
    }

    let edge_ratio = edge_pixels as f32 / total_pixels as f32;

    // Text typically has 5-15% edge pixels
    if edge_ratio > 0.03 && edge_ratio < 0.20 {
        (edge_ratio * 5.0).min(1.0)
    } else {
        0.0
    }
}

/// Detect horizontal text lines
fn detect_horizontal_text_lines(gray: &image::GrayImage) -> f32 {
    let width = gray.width();
    let height = gray.height();

    let mut row_intensities = vec![0u32; height as usize];

    for y in 0..height {
        let mut row_sum = 0u32;
        for x in 0..width {
            row_sum += gray.get_pixel(x, y)[0] as u32;
        }
        row_intensities[y as usize] = row_sum / width;
    }

    // Find peaks (text lines) and valleys (gaps between lines)
    let mut text_lines = 0;
    let mut in_text = false;
    let avg_intensity: u32 = row_intensities.iter().sum::<u32>() / height;

    for intensity in row_intensities {
        if intensity > avg_intensity + 20 {
            if !in_text {
                text_lines += 1;
                in_text = true;
            }
        } else if intensity < avg_intensity - 10 {
            in_text = false;
        }
    }

    // Gemini watermark typically has 1-2 text lines
    if text_lines >= 1 && text_lines <= 3 {
        0.7
    } else if text_lines > 0 {
        0.3
    } else {
        0.0
    }
}

/// Detect Gemini-specific text patterns
fn detect_gemini_text_pattern(img: &DynamicImage) -> f32 {
    let width = img.width();
    let height = img.height();

    // Look for vertical strokes (common in "AI", "I", "l", "t", etc.)
    let mut vertical_strokes = 0;
    let stroke_threshold = (height as f32 * 0.4) as u32;

    for x in 0..width {
        let mut consecutive_bright = 0;
        for y in 0..height {
            let pixel = img.get_pixel(x, y);
            let brightness = (pixel[0] as u32 + pixel[1] as u32 + pixel[2] as u32) / 3;

            if brightness > 150 {
                consecutive_bright += 1;
            } else if consecutive_bright > 0 {
                if consecutive_bright >= stroke_threshold {
                    vertical_strokes += 1;
                }
                consecutive_bright = 0;
            }
        }
        if consecutive_bright >= stroke_threshold {
            vertical_strokes += 1;
        }
    }

    // "AI-generated" or similar text should have 3-10 vertical strokes
    if vertical_strokes >= 3 && vertical_strokes <= 15 {
        (vertical_strokes as f32 / 10.0).min(1.0)
    } else {
        0.0
    }
}

/// Detect Gemini's characteristic color pattern (gray/white text)
fn detect_gemini_color_pattern(img: &DynamicImage) -> f32 {
    let mut light_pixels = 0;
    let mut gray_pixels = 0;
    let mut total_pixels = 0;

    for pixel in img.pixels() {
        let rgba = pixel.2;
        let r = rgba[0] as i32;
        let g = rgba[1] as i32;
        let b = rgba[2] as i32;

        // Check if pixel is grayscale (R≈G≈B)
        let color_diff = (r - g).abs() + (g - b).abs() + (b - r).abs();
        let brightness = (r + g + b) / 3;

        if color_diff < 30 && brightness > 150 {
            light_pixels += 1;
            if brightness < 240 {
                gray_pixels += 1;
            }
        }
        total_pixels += 1;
    }

    let light_ratio = light_pixels as f32 / total_pixels as f32;
    let gray_ratio = gray_pixels as f32 / total_pixels as f32;

    // Gemini watermark has 10-30% light gray pixels
    if light_ratio > 0.08 && light_ratio < 0.40 && gray_ratio > 0.05 {
        0.8
    } else if light_ratio > 0.05 {
        0.4
    } else {
        0.0
    }
}

/// Detect text shadow (Gemini text often has subtle shadow for readability)
fn detect_text_shadow(img: &DynamicImage) -> f32 {
    let width = img.width();
    let height = img.height();

    if width < 2 || height < 2 {
        return 0.0;
    }

    let mut shadow_pairs = 0;
    let mut total_checks = 0;

    // Check for light pixel followed by darker pixel (shadow effect)
    for y in 0..height {
        for x in 0..width - 1 {
            let p1 = img.get_pixel(x, y);
            let p2 = img.get_pixel(x + 1, y);

            let b1 = (p1[0] as u32 + p1[1] as u32 + p1[2] as u32) / 3;
            let b2 = (p2[0] as u32 + p2[1] as u32 + p2[2] as u32) / 3;

            // Light pixel followed by darker pixel
            if b1 > 180 && b2 < b1 - 30 && b2 > 50 {
                shadow_pairs += 1;
            }
            total_checks += 1;
        }
    }

    let shadow_ratio = shadow_pairs as f32 / total_checks as f32;

    if shadow_ratio > 0.02 && shadow_ratio < 0.15 {
        0.6
    } else {
        0.0
    }
}

/// Detect DALL-E watermark (colorful dots pattern in bottom-right)
fn detect_dalle_watermark(img: &DynamicImage) -> WatermarkDetectionResult {
    let width = img.width();
    let height = img.height();

    // DALL-E 3 watermark: colorful dots/squares pattern, typically 80-120px square
    let region_size = (width.min(height) as f32 * 0.08).max(60.0).min(150.0) as u32;
    let start_x = width.saturating_sub(region_size);
    let start_y = height.saturating_sub(region_size);

    let corner_region = img.crop_imm(start_x, start_y, region_size, region_size);

    let mut scores = Vec::new();

    // Strategy 1: Color diversity (DALL-E uses multiple colors)
    let color_score = detect_dalle_color_diversity(&corner_region);
    scores.push(color_score);

    // Strategy 2: Dot/square pattern detection
    let pattern_score = detect_dalle_dot_pattern(&corner_region);
    scores.push(pattern_score);

    // Strategy 3: High frequency content (dots create high frequency)
    let frequency_score = detect_high_frequency_pattern(&corner_region);
    scores.push(frequency_score);

    // Strategy 4: Saturation check (DALL-E dots are highly saturated)
    let saturation_score = detect_high_saturation(&corner_region);
    scores.push(saturation_score);

    let confidence = (color_score * 0.3
        + pattern_score * 0.35
        + frequency_score * 0.2
        + saturation_score * 0.15)
        .min(0.95);

    WatermarkDetectionResult {
        has_watermark: confidence > 0.4,
        platform: if confidence > 0.4 {
            Some("dalle".to_string())
        } else {
            None
        },
        confidence,
        watermark_region: Some(WatermarkRegion {
            x: start_x,
            y: start_y,
            width: region_size,
            height: region_size,
        }),
        detection_method: "dalle_multi_strategy".to_string(),
    }
}

/// Detect DALL-E's color diversity
fn detect_dalle_color_diversity(img: &DynamicImage) -> f32 {
    let mut color_buckets = std::collections::HashMap::new();
    let mut total_pixels = 0;

    for pixel in img.pixels() {
        let rgba = pixel.2;
        let r = rgba[0];
        let g = rgba[1];
        let b = rgba[2];

        // Quantize to reduce noise
        let color_key = (r / 16, g / 16, b / 16);
        *color_buckets.entry(color_key).or_insert(0) += 1;
        total_pixels += 1;
    }

    let unique_colors = color_buckets.len();
    let color_diversity = unique_colors as f32 / (total_pixels as f32).sqrt();

    // DALL-E watermark has high color diversity
    if color_diversity > 2.0 {
        (color_diversity / 5.0).min(1.0)
    } else {
        0.0
    }
}

/// Detect DALL-E's dot pattern
fn detect_dalle_dot_pattern(img: &DynamicImage) -> f32 {
    let width = img.width();
    let height = img.height();

    if width < 10 || height < 10 {
        return 0.0;
    }

    // Sample grid to detect regular pattern
    let step = 3u32;
    let mut pattern_matches = 0;
    let mut total_checks = 0;

    for y in (0..height - step).step_by(step as usize) {
        for x in (0..width - step).step_by(step as usize) {
            let center = img.get_pixel(x, y);
            let neighbors = [
                img.get_pixel((x + step).min(width - 1), y),
                img.get_pixel(x, (y + step).min(height - 1)),
            ];

            let center_brightness = (center[0] as u32 + center[1] as u32 + center[2] as u32) / 3;

            // Check if center is different from neighbors (dot characteristic)
            let mut is_dot = true;
            for neighbor in &neighbors {
                let neighbor_brightness =
                    (neighbor[0] as u32 + neighbor[1] as u32 + neighbor[2] as u32) / 3;
                let diff = (center_brightness as i32 - neighbor_brightness as i32).abs();
                if diff < 30 {
                    is_dot = false;
                    break;
                }
            }

            if is_dot && center_brightness > 100 {
                pattern_matches += 1;
            }
            total_checks += 1;
        }
    }

    let pattern_ratio = pattern_matches as f32 / total_checks as f32;

    if pattern_ratio > 0.15 && pattern_ratio < 0.60 {
        (pattern_ratio * 2.0).min(1.0)
    } else {
        0.0
    }
}

/// Detect high frequency content
fn detect_high_frequency_pattern(img: &DynamicImage) -> f32 {
    let width = img.width();
    let height = img.height();

    if width < 2 || height < 2 {
        return 0.0;
    }

    let mut high_freq_pixels = 0;
    let mut total_pixels = 0;

    for y in 0..height - 1 {
        for x in 0..width - 1 {
            let p1 = img.get_pixel(x, y);
            let p2 = img.get_pixel(x + 1, y);
            let p3 = img.get_pixel(x, y + 1);

            let b1 = (p1[0] as i32 + p1[1] as i32 + p1[2] as i32) / 3;
            let b2 = (p2[0] as i32 + p2[1] as i32 + p2[2] as i32) / 3;
            let b3 = (p3[0] as i32 + p3[1] as i32 + p3[2] as i32) / 3;

            let diff = (b1 - b2).abs() + (b1 - b3).abs();

            if diff > 60 {
                high_freq_pixels += 1;
            }
            total_pixels += 1;
        }
    }

    let freq_ratio = high_freq_pixels as f32 / total_pixels as f32;

    if freq_ratio > 0.2 && freq_ratio < 0.7 {
        (freq_ratio * 1.5).min(1.0)
    } else {
        0.0
    }
}

/// Detect high saturation pixels
fn detect_high_saturation(img: &DynamicImage) -> f32 {
    let mut saturated_pixels = 0;
    let mut total_pixels = 0;

    for pixel in img.pixels() {
        let rgba = pixel.2;
        let r = rgba[0];
        let g = rgba[1];
        let b = rgba[2];

        let max = r.max(g).max(b);
        let min = r.min(g).min(b);

        let saturation = if max > 0 {
            ((max - min) as f32 / max as f32) * 100.0
        } else {
            0.0
        };

        if saturation > 40.0 && max > 100 {
            saturated_pixels += 1;
        }
        total_pixels += 1;
    }

    let saturation_ratio = saturated_pixels as f32 / total_pixels as f32;

    if saturation_ratio > 0.15 && saturation_ratio < 0.70 {
        (saturation_ratio * 1.5).min(1.0)
    } else {
        0.0
    }
}

/// Detect Midjourney watermark (bottom-right text identifier)
fn detect_midjourney_watermark(img: &DynamicImage) -> WatermarkDetectionResult {
    let width = img.width();
    let height = img.height();

    // Midjourney watermark: text in bottom-right, typically 200-300px wide, 40-80px tall
    let region_width = (width as f32 * 0.18).max(150.0).min(350.0) as u32;
    let region_height = (height as f32 * 0.06).max(30.0).min(100.0) as u32;

    let start_x = width.saturating_sub(region_width);
    let start_y = height.saturating_sub(region_height);

    let corner_region = img.crop_imm(start_x, start_y, region_width, region_height);

    let mut scores = Vec::new();

    // Strategy 1: Horizontal text line detection
    let line_score = detect_mj_text_lines(&corner_region);
    scores.push(line_score);

    // Strategy 2: Small text characteristics (MJ uses small font)
    let small_text_score = detect_small_text(&corner_region);
    scores.push(small_text_score);

    // Strategy 3: White/light text on various backgrounds
    let text_color_score = detect_mj_text_color(&corner_region);
    scores.push(text_color_score);

    // Strategy 4: Look for typical MJ patterns (username, version info)
    let pattern_score = detect_mj_pattern(&corner_region);
    scores.push(pattern_score);

    let confidence = (line_score * 0.3
        + small_text_score * 0.25
        + text_color_score * 0.25
        + pattern_score * 0.2)
        .min(0.95);

    WatermarkDetectionResult {
        has_watermark: confidence > 0.4,
        platform: if confidence > 0.4 {
            Some("midjourney".to_string())
        } else {
            None
        },
        confidence,
        watermark_region: Some(WatermarkRegion {
            x: start_x,
            y: start_y,
            width: region_width,
            height: region_height,
        }),
        detection_method: "midjourney_multi_strategy".to_string(),
    }
}

/// Detect Midjourney text lines
fn detect_mj_text_lines(img: &DynamicImage) -> f32 {
    let width = img.width();
    let height = img.height();

    let mut row_brightness = vec![0u32; height as usize];

    for y in 0..height {
        let mut sum = 0u32;
        for x in 0..width {
            let pixel = img.get_pixel(x, y);
            sum += (pixel[0] as u32 + pixel[1] as u32 + pixel[2] as u32) / 3;
        }
        row_brightness[y as usize] = sum / width;
    }

    // Find text lines (bright rows)
    let avg_brightness: u32 = row_brightness.iter().sum::<u32>() / height;
    let mut in_line = false;
    let mut line_heights = Vec::new();
    let mut current_line_height = 0;

    for brightness in &row_brightness {
        if *brightness > avg_brightness + 15 {
            if !in_line {
                in_line = true;
            }
            current_line_height += 1;
        } else {
            if in_line && current_line_height > 0 {
                line_heights.push(current_line_height);
                current_line_height = 0;
            }
            in_line = false;
        }
    }

    // MJ typically has 1-2 text lines, each 8-20 pixels tall
    let valid_lines = line_heights.iter().filter(|&&h| h >= 6 && h <= 25).count();

    if valid_lines >= 1 && valid_lines <= 3 {
        0.8
    } else if valid_lines > 0 {
        0.4
    } else {
        0.0
    }
}

/// Detect small text characteristics
fn detect_small_text(img: &DynamicImage) -> f32 {
    let width = img.width();
    let height = img.height();

    if width < 5 || height < 5 {
        return 0.0;
    }

    // Look for small clusters of bright pixels (small text)
    let mut small_clusters = 0;
    let mut checked = vec![vec![false; width as usize]; height as usize];

    for y in 0..height {
        for x in 0..width {
            if checked[y as usize][x as usize] {
                continue;
            }

            let pixel = img.get_pixel(x, y);
            let brightness = (pixel[0] as u32 + pixel[1] as u32 + pixel[2] as u32) / 3;

            if brightness > 160 {
                // Found bright pixel, check cluster size
                let cluster_size = flood_fill_count(img, &mut checked, x, y, 160);

                // Small text clusters are typically 5-50 pixels
                if cluster_size >= 5 && cluster_size <= 60 {
                    small_clusters += 1;
                }
            }
        }
    }

    // MJ watermark should have multiple small text clusters
    if small_clusters >= 5 && small_clusters <= 50 {
        (small_clusters as f32 / 30.0).min(1.0)
    } else {
        0.0
    }
}

/// Simple flood fill to count cluster size
fn flood_fill_count(
    img: &DynamicImage,
    checked: &mut Vec<Vec<bool>>,
    start_x: u32,
    start_y: u32,
    threshold: u32,
) -> u32 {
    let width = img.width();
    let height = img.height();
    let mut count = 0;
    let mut stack = vec![(start_x, start_y)];

    while let Some((x, y)) = stack.pop() {
        if x >= width || y >= height || checked[y as usize][x as usize] {
            continue;
        }

        let pixel = img.get_pixel(x, y);
        let brightness = (pixel[0] as u32 + pixel[1] as u32 + pixel[2] as u32) / 3;

        if brightness < threshold {
            continue;
        }

        checked[y as usize][x as usize] = true;
        count += 1;

        // Limit cluster size check to avoid infinite loops
        if count > 100 {
            return count;
        }

        // Check 4-connected neighbors
        if x > 0 {
            stack.push((x - 1, y));
        }
        if x < width - 1 {
            stack.push((x + 1, y));
        }
        if y > 0 {
            stack.push((x, y - 1));
        }
        if y < height - 1 {
            stack.push((x, y + 1));
        }
    }

    count
}

/// Detect Midjourney text color (typically white/light)
fn detect_mj_text_color(img: &DynamicImage) -> f32 {
    let mut light_pixels = 0;
    let mut total_pixels = 0;

    for pixel in img.pixels() {
        let rgba = pixel.2;
        let brightness = (rgba[0] as u32 + rgba[1] as u32 + rgba[2] as u32) / 3;

        if brightness > 180 {
            light_pixels += 1;
        }
        total_pixels += 1;
    }

    let light_ratio = light_pixels as f32 / total_pixels as f32;

    // MJ watermark has 10-35% light pixels
    if light_ratio > 0.08 && light_ratio < 0.40 {
        0.7
    } else if light_ratio > 0.05 {
        0.3
    } else {
        0.0
    }
}

/// Detect Midjourney-specific patterns
fn detect_mj_pattern(img: &DynamicImage) -> f32 {
    let width = img.width();
    let height = img.height();

    // Look for character-like patterns (letters, numbers)
    let mut char_patterns = 0;
    let step = 8u32;

    for y in (0..height.saturating_sub(step)).step_by(step as usize) {
        for x in (0..width.saturating_sub(step)).step_by(step as usize) {
            // Check if this region has text-like characteristics
            let mut bright_count = 0;
            let mut total = 0;

            for dy in 0..step {
                for dx in 0..step {
                    let px = (x + dx).min(width - 1);
                    let py = (y + dy).min(height - 1);
                    let pixel = img.get_pixel(px, py);
                    let brightness = (pixel[0] as u32 + pixel[1] as u32 + pixel[2] as u32) / 3;

                    if brightness > 170 {
                        bright_count += 1;
                    }
                    total += 1;
                }
            }

            let bright_ratio = bright_count as f32 / total as f32;

            // Character-like regions have 20-70% bright pixels
            if bright_ratio > 0.2 && bright_ratio < 0.7 {
                char_patterns += 1;
            }
        }
    }

    // Should have multiple character patterns
    if char_patterns >= 3 && char_patterns <= 20 {
        (char_patterns as f32 / 15.0).min(1.0)
    } else {
        0.0
    }
}

/// Detect Doubao watermark (right-bottom corner text)
fn detect_doubao_watermark(img: &DynamicImage) -> WatermarkDetectionResult {
    let width = img.width();
    let height = img.height();

    // Doubao watermark is in the bottom-right corner, typically 100-250px wide, 20-60px tall
    let region_width = (width as f32 * 0.15).max(100.0).min(250.0) as u32;
    let region_height = (height as f32 * 0.05).max(20.0).min(60.0) as u32;

    let start_x = width.saturating_sub(region_width);
    let start_y = height.saturating_sub(region_height);

    let corner_region = img.crop_imm(start_x, start_y, region_width, region_height);

    let mut scores = Vec::new();

    // Strategy 1: Text edge detection (Doubao uses clear text)
    let edge_score = detect_text_edges(&corner_region.to_luma8());
    scores.push(edge_score * 0.3);

    // Strategy 2: Bimodal distribution detection (text + background)
    let bimodal_score = detect_bimodal_distribution(&corner_region);
    scores.push(bimodal_score * 0.25);

    // Strategy 3: Horizontal text line detection
    let line_score = detect_horizontal_text_lines(&corner_region.to_luma8());
    scores.push(line_score * 0.25);

    // Strategy 4: Small text features (Doubao uses relatively small font)
    let small_text_score = detect_small_text_features(&corner_region);
    scores.push(small_text_score * 0.2);

    let confidence = scores.iter().sum::<f32>().min(0.95);

    WatermarkDetectionResult {
        has_watermark: confidence > 0.35,
        platform: if confidence > 0.35 {
            Some("doubao".to_string())
        } else {
            None
        },
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

/// Detect bimodal distribution (typical feature of text watermarks)
fn detect_bimodal_distribution(img: &DynamicImage) -> f32 {
    let mut histogram = vec![0u32; 256];

    for pixel in img.pixels() {
        let brightness = (pixel.2[0] as u32 + pixel.2[1] as u32 + pixel.2[2] as u32) / 3;
        histogram[brightness as usize] += 1;
    }

    // Find two peaks (background and text)
    let peaks = find_histogram_peaks(&histogram, 2);

    if peaks.len() >= 2 {
        // Check if the two peaks are sufficiently separated
        let separation = (peaks[1] as i32 - peaks[0] as i32).abs();
        if separation > 80 {
            return 0.9;
        } else if separation > 50 {
            return 0.6;
        } else if separation > 30 {
            return 0.3;
        }
    }

    0.0
}

/// Detect small text features
fn detect_small_text_features(img: &DynamicImage) -> f32 {
    let width = img.width();
    let height = img.height();

    // Doubao text is usually 15-60 pixels in height
    if height < 15 || height > 80 {
        return 0.0;
    }

    // Check text aspect ratio
    let aspect_ratio = width as f32 / height as f32;

    // Text watermarks are usually horizontal, width is 3-10 times the height
    if aspect_ratio > 3.0 && aspect_ratio < 10.0 {
        0.8
    } else if aspect_ratio > 2.0 && aspect_ratio < 12.0 {
        0.5
    } else if aspect_ratio > 1.5 && aspect_ratio < 15.0 {
        0.2
    } else {
        0.0
    }
}

/// Find peaks in histogram
fn find_histogram_peaks(histogram: &[u32], num_peaks: usize) -> Vec<usize> {
    let mut peaks = Vec::new();
    let total: u32 = histogram.iter().sum();
    let threshold = total / (histogram.len() as u32 * 10);

    for i in 1..histogram.len() - 1 {
        if histogram[i] > threshold
            && histogram[i] > histogram[i - 1]
            && histogram[i] > histogram[i + 1]
        {
            peaks.push(i);
        }
    }

    // Return the highest peaks
    peaks.sort_by(|a, b| histogram[*b].cmp(&histogram[*a]));
    peaks.truncate(num_peaks);
    peaks.sort();
    peaks
}

/// Batch detect watermarks for multiple images
#[tauri::command]
pub async fn batch_detect_watermarks(
    image_paths: Vec<String>,
) -> Result<Vec<WatermarkDetectionResult>, String> {
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
