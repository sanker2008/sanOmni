use serde::{Deserialize, Serialize};
use std::path::Path;

const BG_48_BYTES: &[u8] = include_bytes!("../assets/bg_48.png");
const BG_96_BYTES: &[u8] = include_bytes!("../assets/bg_96.png");
const BG_96_20260520_BYTES: &[u8] = include_bytes!("../assets/bg_96_20260520.png");
const WATERMARK_SIZES_TO_CHECK: [u32; 4] = [96, 72, 48, 36];
const WATERMARK_DETECTION_THRESHOLD: f32 = 0.28;
const WATERMARK_LOW_CONFIDENCE_THRESHOLD: f32 = 0.12;
const WATERMARK_KNOWN_PROFILE_EVIDENCE_THRESHOLD: f32 = 8.0;
const WATERMARK_SMALL_PROFILE_EVIDENCE_THRESHOLD: f32 = 2.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AlphaMapVariant {
    Legacy,
    LegacyScale60,
    GeminiV2_20260520,
}

impl AlphaMapVariant {
    fn as_str(self) -> &'static str {
        match self {
            Self::Legacy => "legacy",
            Self::LegacyScale60 => "legacy_scale_0.60",
            Self::GeminiV2_20260520 => "20260520",
        }
    }
}

fn alpha_variant_from_profile(profile: Option<&str>, size: u32) -> AlphaMapVariant {
    match profile.unwrap_or("auto") {
        "legacy" | "legacy_48" | "legacy_96" => AlphaMapVariant::Legacy,
        "legacy_scale_0.60" | "legacy_scale_60" | "small_2026" => AlphaMapVariant::LegacyScale60,
        "20260520" | "v2_20260520" => AlphaMapVariant::GeminiV2_20260520,
        _ => {
            if size <= 64 {
                AlphaMapVariant::LegacyScale60
            } else {
                AlphaMapVariant::GeminiV2_20260520
            }
        }
    }
}

fn apply_alpha_scale(alpha_map: &mut [f32], alpha_scale: f32) {
    if (alpha_scale - 1.0).abs() < f32::EPSILON {
        return;
    }

    for alpha in alpha_map {
        *alpha = (*alpha * alpha_scale).clamp(0.0, 0.99);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeminiWatermarkRemovalResult {
    pub success: bool,
    pub output_path: String,
    pub method: String,
    pub processing_time_ms: u64,
    pub watermark_detected: bool,
    pub alpha_value: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatermarkRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatermarkColor {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeminiWatermarkRemovalRequest {
    pub image_path: String,
    pub output_path: String,
    pub watermark_color: Option<WatermarkColor>,
    pub alpha: Option<f32>,
    pub region: Option<WatermarkRegion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdvancedGeminiWatermarkRemovalRequest {
    pub image_path: String,
    pub output_path: String,
    pub region: Option<WatermarkRegion>,
    pub profile: Option<String>,
    pub alpha_scale: Option<f32>,
}

#[derive(Debug, Clone)]
struct ActivePixel {
    x: u32,
    y: u32,
    alpha: f32,
}

#[derive(Debug, Clone)]
struct GeminiWatermarkMatch {
    size: u32,
    x: u32,
    y: u32,
    alpha_map: Vec<f32>,
    alpha_variant: AlphaMapVariant,
    score: f32,
    known_profile: bool,
}

#[derive(Debug, Clone, Copy)]
struct KnownWatermarkProfile {
    size: u32,
    margin: u32,
    alpha_variant: AlphaMapVariant,
}

fn load_alpha_map(size: u32, variant: AlphaMapVariant) -> Result<Vec<f32>, String> {
    let bytes = match variant {
        AlphaMapVariant::Legacy | AlphaMapVariant::LegacyScale60 => {
            if size >= 72 {
                BG_96_BYTES
            } else {
                BG_48_BYTES
            }
        }
        AlphaMapVariant::GeminiV2_20260520 => BG_96_20260520_BYTES,
    };

    let img =
        image::load_from_memory(bytes).map_err(|e| format!("Failed to decode alpha map: {}", e))?;
    let mut img = img.to_rgba8();
    if img.width() != size || img.height() != size {
        img = image::imageops::resize(&img, size, size, image::imageops::FilterType::Lanczos3);
    }

    let mut alpha_map = vec![0.0; (size * size) as usize];
    for i in 0..(size * size) as usize {
        let y = i as u32 / size;
        let x = i as u32 % size;
        let pixel = img.get_pixel(x, y);

        let alpha = pixel[0].max(pixel[1]).max(pixel[2]) as f32 / 255.0;
        alpha_map[i] = match variant {
            AlphaMapVariant::LegacyScale60 => (alpha * 0.6).clamp(0.0, 0.99),
            _ => alpha,
        };
    }

    Ok(alpha_map)
}

fn collect_active_pixels(alpha_map: &[f32], size: u32) -> Vec<ActivePixel> {
    let mut active_pixels = Vec::with_capacity((size * size) as usize);
    for row in 0..size {
        for col in 0..size {
            let alpha = alpha_map[(row * size + col) as usize];
            if alpha > 0.02 {
                active_pixels.push(ActivePixel {
                    x: col,
                    y: row,
                    alpha,
                });
            }
        }
    }
    active_pixels
}

fn search_margin(width: u32, height: u32, wm_size: u32) -> (u32, u32) {
    let max_x = width.saturating_sub(wm_size);
    let max_y = height.saturating_sub(wm_size);
    let margin_x = ((width as f32 * 0.16).round() as u32).clamp(128, 384);
    let margin_y = ((height as f32 * 0.25).round() as u32).clamp(128, 384);
    (margin_x.min(max_x), margin_y.min(max_y))
}

fn score_watermark_at(
    img: &image::RgbaImage,
    active_pixels: &[ActivePixel],
    mean_a: f32,
    std_a: f32,
    x: u32,
    y: u32,
) -> Option<f32> {
    let n = active_pixels.len() as f32;
    if n == 0.0 || std_a == 0.0 {
        return None;
    }

    let mut mean_l = 0.0;
    for p in active_pixels {
        let pixel = img.get_pixel(x + p.x, y + p.y);
        mean_l += 0.299 * pixel[0] as f32 + 0.587 * pixel[1] as f32 + 0.114 * pixel[2] as f32;
    }
    mean_l /= n;

    let mut cov = 0.0;
    let mut var_l = 0.0;
    for p in active_pixels {
        let pixel = img.get_pixel(x + p.x, y + p.y);
        let l = 0.299 * pixel[0] as f32 + 0.587 * pixel[1] as f32 + 0.114 * pixel[2] as f32;

        let da = p.alpha - mean_a;
        let dl = l - mean_l;
        cov += da * dl;
        var_l += dl * dl;
    }

    let std_l = var_l.sqrt();
    if std_l > 0.0 {
        Some(cov / (std_a * std_l))
    } else {
        None
    }
}

fn evidence_score_at(img: &image::RgbaImage, active_pixels: &[ActivePixel], x: u32, y: u32) -> f32 {
    let mut count = 0.0;
    let mut alpha_sum = 0.0;
    let mut luminance_sum = 0.0;
    let mut alpha_squared_sum = 0.0;
    let mut luminance_squared_sum = 0.0;
    let mut alpha_luminance_sum = 0.0;
    let mut high_alpha_luminance_sum = 0.0;
    let mut high_alpha_count = 0.0;
    let mut low_alpha_luminance_sum = 0.0;
    let mut low_alpha_count = 0.0;

    for p in active_pixels {
        if p.alpha < 0.01 {
            continue;
        }

        let pixel = img.get_pixel(x + p.x, y + p.y);
        let luminance =
            0.2126 * pixel[0] as f32 + 0.7152 * pixel[1] as f32 + 0.0722 * pixel[2] as f32;

        count += 1.0;
        alpha_sum += p.alpha;
        luminance_sum += luminance;
        alpha_squared_sum += p.alpha * p.alpha;
        luminance_squared_sum += luminance * luminance;
        alpha_luminance_sum += p.alpha * luminance;

        if p.alpha > 0.35 {
            high_alpha_luminance_sum += luminance;
            high_alpha_count += 1.0;
        } else if p.alpha < 0.08 {
            low_alpha_luminance_sum += luminance;
            low_alpha_count += 1.0;
        }
    }

    if count == 0.0 {
        return f32::NEG_INFINITY;
    }

    let alpha_mean = alpha_sum / count;
    let luminance_mean = luminance_sum / count;
    let covariance = alpha_luminance_sum / count - alpha_mean * luminance_mean;
    let alpha_variance = alpha_squared_sum / count - alpha_mean * alpha_mean;
    let luminance_variance = luminance_squared_sum / count - luminance_mean * luminance_mean;
    let luminance_delta = if high_alpha_count > 0.0 && low_alpha_count > 0.0 {
        high_alpha_luminance_sum / high_alpha_count - low_alpha_luminance_sum / low_alpha_count
    } else {
        0.0
    };

    if alpha_variance <= 1e-6 || luminance_variance <= 1e-6 {
        return luminance_delta;
    }

    let correlation = covariance / (alpha_variance * luminance_variance).sqrt();

    correlation * 100.0 + luminance_delta
}

fn has_visible_watermark_evidence(
    img: &image::RgbaImage,
    active_pixels: &[ActivePixel],
    x: u32,
    y: u32,
) -> bool {
    if active_pixels.is_empty() {
        return false;
    }

    let mut total_darkening = 0.0;
    let mut colorful_pixels = 0usize;

    for p in active_pixels {
        let pixel = img.get_pixel(x + p.x, y + p.y);
        let luma = 0.299 * pixel[0] as f32 + 0.587 * pixel[1] as f32 + 0.114 * pixel[2] as f32;
        total_darkening += 255.0 - luma;

        let max_channel = pixel[0].max(pixel[1]).max(pixel[2]);
        let min_channel = pixel[0].min(pixel[1]).min(pixel[2]);
        if max_channel.saturating_sub(min_channel) > 45 {
            colorful_pixels += 1;
        }
    }

    let count = active_pixels.len() as f32;
    let average_darkening = total_darkening / count;
    let colorful_ratio = colorful_pixels as f32 / count;

    average_darkening >= 8.0 && colorful_ratio <= 0.85
}

fn find_best_watermark_match(
    img: &image::RgbaImage,
) -> Result<Option<GeminiWatermarkMatch>, String> {
    let width = img.width();
    let height = img.height();
    let mut best_match: Option<GeminiWatermarkMatch> = None;

    for &wm_size in &WATERMARK_SIZES_TO_CHECK {
        if width < wm_size || height < wm_size {
            continue;
        }

        let alpha_map = load_alpha_map(wm_size, AlphaMapVariant::Legacy)?;
        let active_pixels = collect_active_pixels(&alpha_map, wm_size);
        if active_pixels.is_empty() {
            continue;
        }

        let n = active_pixels.len() as f32;
        let mean_a = active_pixels.iter().map(|p| p.alpha).sum::<f32>() / n;
        let std_a = active_pixels
            .iter()
            .map(|p| (p.alpha - mean_a) * (p.alpha - mean_a))
            .sum::<f32>()
            .sqrt();
        if std_a == 0.0 {
            continue;
        }

        let (search_w, search_h) = search_margin(width, height, wm_size);
        let start_x = width.saturating_sub(wm_size).saturating_sub(search_w);
        let start_y = height.saturating_sub(wm_size).saturating_sub(search_h);
        let end_x = width.saturating_sub(wm_size);
        let end_y = height.saturating_sub(wm_size);

        let mut coarse_best: Option<(u32, u32, f32)> = None;
        let mut y = start_y;
        while y <= end_y {
            let mut x = start_x;
            while x <= end_x {
                if let Some(score) = score_watermark_at(img, &active_pixels, mean_a, std_a, x, y) {
                    if coarse_best.map_or(true, |(_, _, best_score)| score > best_score) {
                        coarse_best = Some((x, y, score));
                    }
                }
                x = x.saturating_add(4);
                if x == u32::MAX {
                    break;
                }
            }
            y = y.saturating_add(4);
            if y == u32::MAX {
                break;
            }
        }

        let Some((coarse_x, coarse_y, _)) = coarse_best else {
            continue;
        };

        let refine_start_x = coarse_x.saturating_sub(5).max(start_x);
        let refine_start_y = coarse_y.saturating_sub(5).max(start_y);
        let refine_end_x = coarse_x.saturating_add(5).min(end_x);
        let refine_end_y = coarse_y.saturating_add(5).min(end_y);

        for y in refine_start_y..=refine_end_y {
            for x in refine_start_x..=refine_end_x {
                let Some(score) = score_watermark_at(img, &active_pixels, mean_a, std_a, x, y)
                else {
                    continue;
                };
                if !has_visible_watermark_evidence(img, &active_pixels, x, y) {
                    continue;
                }

                if best_match.as_ref().map_or(true, |best| score > best.score) {
                    best_match = Some(GeminiWatermarkMatch {
                        size: wm_size,
                        x,
                        y,
                        alpha_map: alpha_map.clone(),
                        alpha_variant: AlphaMapVariant::Legacy,
                        score,
                        known_profile: false,
                    });
                }
            }
        }
    }

    Ok(best_match)
}

fn known_profile_candidates(width: u32, height: u32) -> Vec<KnownWatermarkProfile> {
    let mut candidates = Vec::new();

    let new_profile = if width > 1024 && height > 1024 {
        KnownWatermarkProfile {
            size: 96,
            margin: 192,
            alpha_variant: AlphaMapVariant::GeminiV2_20260520,
        }
    } else {
        KnownWatermarkProfile {
            size: 48,
            margin: 96,
            alpha_variant: AlphaMapVariant::LegacyScale60,
        }
    };
    candidates.push(new_profile);

    let legacy_profile = if width > 1024 && height > 1024 {
        KnownWatermarkProfile {
            size: 96,
            margin: 64,
            alpha_variant: AlphaMapVariant::Legacy,
        }
    } else {
        KnownWatermarkProfile {
            size: 48,
            margin: 32,
            alpha_variant: AlphaMapVariant::Legacy,
        }
    };
    candidates.push(legacy_profile);

    candidates
}

fn find_known_profile_match(
    img: &image::RgbaImage,
) -> Result<Option<GeminiWatermarkMatch>, String> {
    let width = img.width();
    let height = img.height();
    let mut best_match: Option<GeminiWatermarkMatch> = None;

    for profile in known_profile_candidates(width, height) {
        let wm_size = profile.size;
        let margin = profile.margin;
        if width <= wm_size + margin || height <= wm_size + margin {
            continue;
        }

        let x = width - wm_size - margin;
        let y = height - wm_size - margin;
        let alpha_map = load_alpha_map(wm_size, profile.alpha_variant)?;
        let active_pixels = collect_active_pixels(&alpha_map, wm_size);
        if active_pixels.is_empty() || !has_visible_watermark_evidence(img, &active_pixels, x, y) {
            continue;
        }

        let score = evidence_score_at(img, &active_pixels, x, y);

        let profile_threshold = match profile.alpha_variant {
            AlphaMapVariant::LegacyScale60 => WATERMARK_SMALL_PROFILE_EVIDENCE_THRESHOLD,
            _ => WATERMARK_KNOWN_PROFILE_EVIDENCE_THRESHOLD,
        };

        if score >= profile_threshold {
            let matched = GeminiWatermarkMatch {
                size: wm_size,
                x,
                y,
                alpha_map,
                alpha_variant: profile.alpha_variant,
                score,
                known_profile: true,
            };

            if best_match.as_ref().map_or(true, |best| score > best.score) {
                best_match = Some(matched);
            }
        }
    }

    Ok(best_match)
}

fn fallback_watermark_match(width: u32, height: u32) -> Result<GeminiWatermarkMatch, String> {
    let is_large = width > 1024 && height > 1024;
    let (fallback_size, margin) = if is_large { (96, 64) } else { (48, 32) };
    Ok(GeminiWatermarkMatch {
        size: fallback_size,
        x: width.saturating_sub(fallback_size).saturating_sub(margin),
        y: height.saturating_sub(fallback_size).saturating_sub(margin),
        alpha_map: load_alpha_map(fallback_size, AlphaMapVariant::Legacy)?,
        alpha_variant: AlphaMapVariant::Legacy,
        score: -1.0,
        known_profile: false,
    })
}

fn manual_watermark_match(
    img: &image::RgbaImage,
    region: &WatermarkRegion,
    profile: Option<&str>,
    alpha_scale: f32,
) -> Result<GeminiWatermarkMatch, String> {
    let size = region.width.min(region.height).clamp(16, 160);
    let x = region.x.min(img.width().saturating_sub(size));
    let y = region.y.min(img.height().saturating_sub(size));
    let alpha_variant = alpha_variant_from_profile(profile, size);
    let mut alpha_map = load_alpha_map(size, alpha_variant)?;
    apply_alpha_scale(&mut alpha_map, alpha_scale);
    let active_pixels = collect_active_pixels(&alpha_map, size);
    let score = if active_pixels.is_empty() {
        -1.0
    } else {
        evidence_score_at(img, &active_pixels, x, y)
    };

    Ok(GeminiWatermarkMatch {
        size,
        x,
        y,
        alpha_map,
        alpha_variant,
        score,
        known_profile: true,
    })
}

fn apply_reverse_alpha_blend(result_img: &mut image::RgbaImage, matched: &GeminiWatermarkMatch) {
    let width = result_img.width();
    let height = result_img.height();
    let alpha_threshold: f32 = 0.002;
    let max_alpha: f32 = 0.99;
    let logo_value: f32 = 255.0;

    for row in 0..matched.size {
        for col in 0..matched.size {
            let alpha_idx = (row * matched.size + col) as usize;
            let mut alpha = matched.alpha_map[alpha_idx];

            if alpha < alpha_threshold {
                continue;
            }
            if alpha > max_alpha {
                alpha = max_alpha;
            }

            let px = matched.x + col;
            let py = matched.y + row;

            if px >= width || py >= height {
                continue;
            }

            let mut pixel = *result_img.get_pixel(px, py);
            for c in 0..3 {
                let watermarked = pixel[c] as f32;
                let original = (watermarked - alpha * logo_value) / (1.0 - alpha);
                pixel[c] = original.max(0.0).min(255.0) as u8;
            }

            result_img.put_pixel(px, py, pixel);
        }
    }
}

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
        return Err(format!("Image file not found: {}", image_path));
    }

    let img = image::open(input).map_err(|e| format!("Failed to open image: {}", e))?;
    let mut result_img = img.to_rgba8();

    let width = result_img.width();
    let height = result_img.height();

    let matched = if let Some(profile) = find_known_profile_match(&result_img)? {
        profile
    } else if let Some(best) = find_best_watermark_match(&result_img)? {
        if best.score >= WATERMARK_LOW_CONFIDENCE_THRESHOLD {
            best
        } else {
            fallback_watermark_match(width, height)?
        }
    } else {
        fallback_watermark_match(width, height)?
    };

    let alpha_threshold: f32 = 0.002;
    let max_alpha: f32 = 0.99;
    let logo_value: f32 = 255.0;

    for row in 0..matched.size {
        for col in 0..matched.size {
            let alpha_idx = (row * matched.size + col) as usize;
            let mut alpha = matched.alpha_map[alpha_idx];

            if alpha < alpha_threshold {
                continue;
            }
            if alpha > max_alpha {
                alpha = max_alpha;
            }

            let px = matched.x + col;
            let py = matched.y + row;

            if px >= width || py >= height {
                continue;
            }

            let mut pixel = *result_img.get_pixel(px, py);
            for c in 0..3 {
                let watermarked = pixel[c] as f32;
                let original = (watermarked - alpha * logo_value) / (1.0 - alpha);
                pixel[c] = original.max(0.0).min(255.0) as u8;
            }

            result_img.put_pixel(px, py, pixel);
        }
    }

    result_img
        .save(output)
        .map_err(|e| format!("Failed to save image: {}", e))?;

    let processing_time = start.elapsed().as_millis() as u64;
    let watermark_detected =
        matched.known_profile || matched.score >= WATERMARK_DETECTION_THRESHOLD;

    Ok(GeminiWatermarkRemovalResult {
        success: true,
        output_path: output_path.clone(),
        method: format!(
            "gemini_ncc_pixel_reconstruction (size: {}, x: {}, y: {}, conf: {:.2}, profile: {}, alpha: {})",
            matched.size,
            matched.x,
            matched.y,
            matched.score,
            matched.known_profile,
            matched.alpha_variant.as_str()
        ),
        processing_time_ms: processing_time,
        watermark_detected,
        alpha_value: 1.0,
    })
}

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
        )
        .await?;
        results.push(result);
    }
    Ok(results)
}

#[tauri::command]
pub async fn auto_remove_gemini_watermark(
    image_path: String,
    output_path: String,
) -> Result<GeminiWatermarkRemovalResult, String> {
    remove_gemini_watermark(image_path, output_path, None, None, None).await
}

#[tauri::command]
pub async fn advanced_remove_gemini_watermark(
    request: AdvancedGeminiWatermarkRemovalRequest,
) -> Result<GeminiWatermarkRemovalResult, String> {
    let start = std::time::Instant::now();
    let input = Path::new(&request.image_path);
    let output = Path::new(&request.output_path);

    if !input.exists() {
        return Err(format!("Image file not found: {}", request.image_path));
    }

    let img = image::open(input).map_err(|e| format!("Failed to open image: {}", e))?;
    let mut result_img = img.to_rgba8();
    let width = result_img.width();
    let height = result_img.height();

    let alpha_scale = request.alpha_scale.unwrap_or(1.0).clamp(0.1, 2.0);
    let matched = if let Some(region) = request.region.as_ref() {
        manual_watermark_match(&result_img, region, request.profile.as_deref(), alpha_scale)?
    } else if let Some(profile) = find_known_profile_match(&result_img)? {
        profile
    } else if let Some(best) = find_best_watermark_match(&result_img)? {
        if best.score >= WATERMARK_LOW_CONFIDENCE_THRESHOLD {
            best
        } else {
            fallback_watermark_match(width, height)?
        }
    } else {
        fallback_watermark_match(width, height)?
    };

    apply_reverse_alpha_blend(&mut result_img, &matched);

    result_img
        .save(output)
        .map_err(|e| format!("Failed to save image: {}", e))?;

    let processing_time = start.elapsed().as_millis() as u64;
    let watermark_detected =
        matched.known_profile || matched.score >= WATERMARK_DETECTION_THRESHOLD;

    Ok(GeminiWatermarkRemovalResult {
        success: true,
        output_path: request.output_path.clone(),
        method: format!(
            "gemini_advanced_pixel_reconstruction (size: {}, x: {}, y: {}, conf: {:.2}, profile: {}, alpha: {}, alpha_scale: {:.2}, advanced: true)",
            matched.size,
            matched.x,
            matched.y,
            matched.score,
            matched.known_profile,
            matched.alpha_variant.as_str(),
            alpha_scale
        ),
        processing_time_ms: processing_time,
        watermark_detected,
        alpha_value: alpha_scale,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    fn composite_watermark(
        img: &mut RgbaImage,
        size: u32,
        x: u32,
        y: u32,
        variant: AlphaMapVariant,
    ) {
        let alpha_map = load_alpha_map(size, variant).unwrap();
        for row in 0..size {
            for col in 0..size {
                let alpha = alpha_map[(row * size + col) as usize];
                if alpha <= 0.002 {
                    continue;
                }

                let px = x + col;
                let py = y + row;
                let mut pixel = *img.get_pixel(px, py);
                for c in 0..3 {
                    let original = pixel[c] as f32;
                    pixel[c] = (original * (1.0 - alpha) + 255.0 * alpha)
                        .round()
                        .clamp(0.0, 255.0) as u8;
                }
                img.put_pixel(px, py, pixel);
            }
        }
    }

    #[test]
    fn scales_alpha_map_for_newer_small_profile() {
        let alpha_map = load_alpha_map(36, AlphaMapVariant::Legacy).unwrap();
        assert_eq!(alpha_map.len(), 36 * 36);
        assert!(alpha_map.iter().any(|alpha| *alpha > 0.02));
    }

    #[test]
    fn detects_inset_watermark_outside_old_128px_search_area() {
        let mut img = RgbaImage::from_pixel(2048, 1152, Rgba([0, 0, 0, 255]));
        let expected_size = 72;
        let expected_x = 2048 - expected_size - 170;
        let expected_y = 1152 - expected_size - 150;
        composite_watermark(
            &mut img,
            expected_size,
            expected_x,
            expected_y,
            AlphaMapVariant::Legacy,
        );

        let detected = find_best_watermark_match(&img).unwrap().unwrap();
        assert_eq!(detected.size, expected_size);
        assert!((detected.x as i32 - expected_x as i32).abs() <= 1);
        assert!((detected.y as i32 - expected_y as i32).abs() <= 1);
        assert!(detected.score >= WATERMARK_DETECTION_THRESHOLD);
    }

    #[test]
    fn detects_default_bottom_right_watermark() {
        let mut img = RgbaImage::from_pixel(2048, 1152, Rgba([40, 70, 65, 255]));
        let expected_size = 96;
        let expected_x = 2048 - expected_size - 32;
        let expected_y = 1152 - expected_size - 32;
        composite_watermark(
            &mut img,
            expected_size,
            expected_x,
            expected_y,
            AlphaMapVariant::Legacy,
        );

        let detected = find_best_watermark_match(&img).unwrap().unwrap();
        assert_eq!(detected.size, expected_size);
        assert!((detected.x as i32 - expected_x as i32).abs() <= 1);
        assert!((detected.y as i32 - expected_y as i32).abs() <= 1);
        assert!(detected.score >= WATERMARK_DETECTION_THRESHOLD);
    }

    #[test]
    fn detects_known_gemini_1024_profile_before_free_search() {
        let mut img = RgbaImage::from_pixel(1024, 1024, Rgba([255, 255, 255, 255]));
        for y in 820..1010 {
            for x in 800..980 {
                if (x + y) % 17 < 6 {
                    img.put_pixel(x, y, Rgba([35, 18, 12, 255]));
                } else if (x + y) % 17 < 10 {
                    img.put_pixel(x, y, Rgba([75, 175, 215, 255]));
                }
            }
        }

        let expected_size = 48;
        let expected_x = 1024 - expected_size - 96;
        let expected_y = 1024 - expected_size - 96;
        composite_watermark(
            &mut img,
            expected_size,
            expected_x,
            expected_y,
            AlphaMapVariant::LegacyScale60,
        );

        let detected = find_known_profile_match(&img).unwrap().unwrap();
        assert!(detected.known_profile);
        assert_eq!(detected.size, expected_size);
        assert_eq!(detected.x, expected_x);
        assert_eq!(detected.y, expected_y);

        assert_eq!(detected.alpha_variant, AlphaMapVariant::LegacyScale60);
    }

    #[test]
    fn detects_known_gemini_large_20260520_profile() {
        let mut img = RgbaImage::from_pixel(2752, 1536, Rgba([0, 5, 3, 255]));
        let expected_size = 96;
        let expected_x = 2752 - expected_size - 192;
        let expected_y = 1536 - expected_size - 192;
        composite_watermark(
            &mut img,
            expected_size,
            expected_x,
            expected_y,
            AlphaMapVariant::GeminiV2_20260520,
        );

        let detected = find_known_profile_match(&img).unwrap().unwrap();
        assert!(detected.known_profile);
        assert_eq!(detected.size, expected_size);
        assert_eq!(detected.x, expected_x);
        assert_eq!(detected.y, expected_y);
        assert_eq!(detected.alpha_variant, AlphaMapVariant::GeminiV2_20260520);
    }

    #[test]
    fn ignores_plain_dark_area_for_known_20260520_profile() {
        let img = RgbaImage::from_pixel(2752, 1536, Rgba([0, 5, 3, 255]));

        let detected = find_known_profile_match(&img).unwrap();

        assert!(detected.is_none());
    }

    #[test]
    fn ignores_bottom_right_art_without_visible_watermark_evidence() {
        let mut img = RgbaImage::from_pixel(1024, 1024, Rgba([255, 255, 255, 255]));

        for y in 840..990 {
            for x in 820..970 {
                if (x + y) % 9 < 4 {
                    img.put_pixel(x, y, Rgba([55, 28, 18, 255]));
                } else if (x + y) % 9 < 7 {
                    img.put_pixel(x, y, Rgba([250, 185, 165, 255]));
                }
            }
        }
        for y in 850..910 {
            for x in 930..990 {
                if x == 930 || x == 989 || y == 850 || y == 909 {
                    img.put_pixel(x, y, Rgba([30, 30, 30, 255]));
                }
            }
        }

        let detected = find_best_watermark_match(&img).unwrap();
        if let Some(candidate) = detected {
            assert!(candidate.score < WATERMARK_DETECTION_THRESHOLD);
        }
    }
}
