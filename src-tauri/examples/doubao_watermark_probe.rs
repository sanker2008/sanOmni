use image::{DynamicImage, GenericImageView, ImageBuffer, Rgba};
use std::collections::VecDeque;
use std::fs;
use std::path::Path;

#[derive(Clone, Copy)]
struct Rect {
    x: u32,
    y: u32,
    w: u32,
    h: u32,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = Path::new("..");
    let input_dir = root.join("docs").join("watermark");
    let output_dir = root.join("scratch").join("doubao_watermark_probe");
    fs::create_dir_all(&output_dir)?;

    for name in ["doubao.png", "doubao-white.png", "doubao-black.png"] {
        let input_path = input_dir.join(name);
        let img = image::open(&input_path)?;
        let roi = detect_bottom_right_text_region(&img);
        let base = name.trim_end_matches(".png");

        let roi_img = img.crop_imm(roi.x, roi.y, roi.w, roi.h);
        roi_img.save(output_dir.join(format!("{base}_roi.png")))?;

        let rect = remove_by_rect_fill(&img, roi);
        rect.save(output_dir.join(format!("{base}_rect_fill.png")))?;

        let (masked, mask_count) = remove_by_text_mask(&img, roi);
        masked.save(output_dir.join(format!("{base}_text_mask.png")))?;

        let smart = remove_by_smart_fill(&img, roi);
        smart.save(output_dir.join(format!("{base}_smart_fill.png")))?;

        println!(
            "{name}: {}x{}, roi=({},{} {}x{}), mask_pixels={}",
            img.width(),
            img.height(),
            roi.x,
            roi.y,
            roi.w,
            roi.h,
            mask_count
        );
    }

    println!("outputs: {}", output_dir.display());
    Ok(())
}

fn detect_bottom_right_text_region(img: &DynamicImage) -> Rect {
    let width = img.width();
    let height = img.height();
    let search_w = (width as f32 * 0.17).max(380.0).min(470.0) as u32;
    let search_h = (height as f32 * 0.10).max(115.0).min(175.0) as u32;
    let sx = width.saturating_sub(search_w);
    let sy = height.saturating_sub(search_h);

    let mut lum = Vec::with_capacity((search_w * search_h) as usize);
    for y in sy..height {
        for x in sx..width {
            lum.push(luma(img.get_pixel(x, y)));
        }
    }
    lum.sort_unstable();
    let median = lum[lum.len() / 2] as i16;

    let mut min_x = width;
    let mut min_y = height;
    let mut max_x = 0;
    let mut max_y = 0;
    let mut found = false;

    for y in sy..height {
        for x in sx..width {
            if y < sy + (search_h as f32 * 0.28) as u32 {
                continue;
            }
            let p = img.get_pixel(x, y);
            let l = luma(p) as i16;
            let diff = (l - median).abs();
            let candidate = if median < 90 {
                l > median + 32
            } else if median > 210 {
                diff > 10 && l < 252
            } else {
                diff > 24
            };

            if candidate {
                found = true;
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
            }
        }
    }

    if !found {
        let w = (width as f32 * 0.18).max(220.0).min(360.0) as u32;
        let h = (height as f32 * 0.06).max(70.0).min(110.0) as u32;
        return Rect {
            x: width.saturating_sub(w),
            y: height.saturating_sub(h),
            w,
            h,
        };
    }

    let pad_x = 12;
    let pad_y = 10;
    let x = min_x.saturating_sub(pad_x);
    let y = min_y.saturating_sub(pad_y);
    let right = (max_x + pad_x).min(width - 1);
    let bottom = (max_y + pad_y).min(height - 1);

    Rect {
        x,
        y,
        w: right.saturating_sub(x).max(1),
        h: bottom.saturating_sub(y).max(1),
    }
}

fn remove_by_smart_fill(img: &DynamicImage, roi: Rect) -> DynamicImage {
    let mut out = img.to_rgba8();
    let bg = sample_border_median(&out, roi);
    let variance = roi_luma_variance(&out, roi);

    if variance < 520.0 {
        soft_fill_rect(&mut out, roi, bg);
    } else {
        let threshold = adaptive_threshold(&out, roi);
        let mask = build_mask(&out, roi, bg, threshold);
        let expanded = dilate(&mask, roi.w as usize, roi.h as usize, 5);
        let softened = dilate(&expanded, roi.w as usize, roi.h as usize, 3);
        for yy in 0..roi.h {
            for xx in 0..roi.w {
                let idx = (yy * roi.w + xx) as usize;
                if expanded[idx] || softened[idx] {
                    let x = roi.x + xx;
                    let y = roi.y + yy;
                    if x < out.width() && y < out.height() {
                        let original = *out.get_pixel(x, y);
                        let blend = if expanded[idx] { 1.0 } else { 0.82 };
                        out.put_pixel(x, y, blend_pixel(original, bg, blend));
                    }
                }
            }
        }
    }

    DynamicImage::ImageRgba8(out)
}

fn soft_fill_rect(img: &mut ImageBuffer<Rgba<u8>, Vec<u8>>, roi: Rect, bg: Rgba<u8>) {
    let feather = 10.0f32;
    for y in roi.y..(roi.y + roi.h).min(img.height()) {
        for x in roi.x..(roi.x + roi.w).min(img.width()) {
            let dx = (x - roi.x).min(roi.x + roi.w - 1 - x) as f32;
            let dy = (y - roi.y).min(roi.y + roi.h - 1 - y) as f32;
            let edge = dx.min(dy);
            let t = (edge / feather).clamp(0.35, 1.0);
            let original = *img.get_pixel(x, y);
            img.put_pixel(x, y, blend_pixel(original, bg, t));
        }
    }
}

fn remove_by_rect_fill(img: &DynamicImage, roi: Rect) -> DynamicImage {
    let mut out = img.to_rgba8();
    let bg = sample_border_median(&out, roi);
    for y in roi.y..(roi.y + roi.h).min(out.height()) {
        for x in roi.x..(roi.x + roi.w).min(out.width()) {
            out.put_pixel(x, y, bg);
        }
    }
    DynamicImage::ImageRgba8(out)
}

fn remove_by_text_mask(img: &DynamicImage, roi: Rect) -> (DynamicImage, usize) {
    let mut out = img.to_rgba8();
    let bg = sample_border_median(&out, roi);
    let threshold = adaptive_threshold(&out, roi);
    let mask = build_mask(&out, roi, bg, threshold);
    let expanded = dilate(&mask, roi.w as usize, roi.h as usize, 2);
    let softened = dilate(&expanded, roi.w as usize, roi.h as usize, 1);
    let mut changed = 0usize;

    for yy in 0..roi.h {
        for xx in 0..roi.w {
            let idx = (yy * roi.w + xx) as usize;
            if expanded[idx] || softened[idx] {
                let x = roi.x + xx;
                let y = roi.y + yy;
                if x < out.width() && y < out.height() {
                    let original = *out.get_pixel(x, y);
                    let blend = if expanded[idx] { 0.92 } else { 0.55 };
                    out.put_pixel(x, y, blend_pixel(original, bg, blend));
                    if expanded[idx] {
                        changed += 1;
                    }
                }
            }
        }
    }

    (DynamicImage::ImageRgba8(out), changed)
}

fn build_mask(
    img: &ImageBuffer<Rgba<u8>, Vec<u8>>,
    roi: Rect,
    bg: Rgba<u8>,
    threshold: i16,
) -> Vec<bool> {
    let mut raw = vec![false; (roi.w * roi.h) as usize];
    let bg_l = luma(bg) as i16;

    for yy in 0..roi.h {
        for xx in 0..roi.w {
            let x = roi.x + xx;
            let y = roi.y + yy;
            if x >= img.width() || y >= img.height() {
                continue;
            }
            let p = *img.get_pixel(x, y);
            let l = luma(p) as i16;
            let color_diff = channel_distance(p, bg);
            let lum_diff = (l - bg_l).abs();
            raw[(yy * roi.w + xx) as usize] = lum_diff > threshold || color_diff > threshold * 2;
        }
    }

    keep_reasonable_components(raw, roi.w as usize, roi.h as usize)
}

fn keep_reasonable_components(raw: Vec<bool>, w: usize, h: usize) -> Vec<bool> {
    let mut out = vec![false; raw.len()];
    let mut seen = vec![false; raw.len()];

    for start in 0..raw.len() {
        if !raw[start] || seen[start] {
            continue;
        }
        let mut queue = VecDeque::new();
        let mut pixels = Vec::new();
        let mut min_x = w;
        let mut min_y = h;
        let mut max_x = 0usize;
        let mut max_y = 0usize;
        queue.push_back(start);
        seen[start] = true;

        while let Some(idx) = queue.pop_front() {
            pixels.push(idx);
            let x = idx % w;
            let y = idx / w;
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);

            for (nx, ny) in neighbors4(x, y, w, h) {
                let nidx = ny * w + nx;
                if raw[nidx] && !seen[nidx] {
                    seen[nidx] = true;
                    queue.push_back(nidx);
                }
            }
        }

        let count = pixels.len();
        let bw = max_x - min_x + 1;
        let bh = max_y - min_y + 1;
        let area = bw * bh;
        let fill = count as f32 / area as f32;
        let plausible = count >= 3
            && count <= 20_000
            && bh <= (h as f32 * 0.85) as usize
            && bw <= (w as f32 * 0.95) as usize
            && fill <= 0.85;

        if plausible {
            for idx in pixels {
                out[idx] = true;
            }
        }
    }

    out
}

fn neighbors4(x: usize, y: usize, w: usize, h: usize) -> Vec<(usize, usize)> {
    let mut n = Vec::with_capacity(4);
    if x > 0 {
        n.push((x - 1, y));
    }
    if x + 1 < w {
        n.push((x + 1, y));
    }
    if y > 0 {
        n.push((x, y - 1));
    }
    if y + 1 < h {
        n.push((x, y + 1));
    }
    n
}

fn dilate(mask: &[bool], w: usize, h: usize, radius: usize) -> Vec<bool> {
    let mut out = vec![false; mask.len()];
    for y in 0..h {
        for x in 0..w {
            if !mask[y * w + x] {
                continue;
            }
            let min_x = x.saturating_sub(radius);
            let max_x = (x + radius).min(w - 1);
            let min_y = y.saturating_sub(radius);
            let max_y = (y + radius).min(h - 1);
            for ny in min_y..=max_y {
                for nx in min_x..=max_x {
                    out[ny * w + nx] = true;
                }
            }
        }
    }
    out
}

fn adaptive_threshold(img: &ImageBuffer<Rgba<u8>, Vec<u8>>, roi: Rect) -> i16 {
    let bg = sample_border_median(img, roi);
    let bg_l = luma(bg) as i16;
    let mut diffs = Vec::with_capacity((roi.w * roi.h) as usize);
    for y in roi.y..(roi.y + roi.h).min(img.height()) {
        for x in roi.x..(roi.x + roi.w).min(img.width()) {
            let d = (luma(*img.get_pixel(x, y)) as i16 - bg_l).abs();
            diffs.push(d);
        }
    }
    diffs.sort_unstable();
    let p75 = diffs[diffs.len() * 3 / 4];
    (p75 + 8).clamp(8, 34)
}

fn roi_luma_variance(img: &ImageBuffer<Rgba<u8>, Vec<u8>>, roi: Rect) -> f32 {
    let mut values = Vec::with_capacity((roi.w * roi.h) as usize);
    for y in roi.y..(roi.y + roi.h).min(img.height()) {
        for x in roi.x..(roi.x + roi.w).min(img.width()) {
            values.push(luma(*img.get_pixel(x, y)) as f32);
        }
    }
    if values.is_empty() {
        return 0.0;
    }
    let mean = values.iter().sum::<f32>() / values.len() as f32;
    values
        .iter()
        .map(|v| {
            let d = v - mean;
            d * d
        })
        .sum::<f32>()
        / values.len() as f32
}

fn sample_border_median(img: &ImageBuffer<Rgba<u8>, Vec<u8>>, roi: Rect) -> Rgba<u8> {
    let mut rs = Vec::new();
    let mut gs = Vec::new();
    let mut bs = Vec::new();
    let margin = 10u32;
    let x0 = roi.x.saturating_sub(margin);
    let y0 = roi.y.saturating_sub(margin);
    let x1 = (roi.x + roi.w + margin).min(img.width() - 1);
    let y1 = (roi.y + roi.h + margin).min(img.height() - 1);

    for y in y0..=y1 {
        for x in x0..=x1 {
            let inside = x >= roi.x && x < roi.x + roi.w && y >= roi.y && y < roi.y + roi.h;
            if !inside {
                let p = *img.get_pixel(x, y);
                rs.push(p[0]);
                gs.push(p[1]);
                bs.push(p[2]);
            }
        }
    }

    if rs.is_empty() {
        return Rgba([128, 128, 128, 255]);
    }
    rs.sort_unstable();
    gs.sort_unstable();
    bs.sort_unstable();
    let mid = rs.len() / 2;
    Rgba([rs[mid], gs[mid], bs[mid], 255])
}

fn luma(p: Rgba<u8>) -> u8 {
    ((p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000) as u8
}

fn channel_distance(a: Rgba<u8>, b: Rgba<u8>) -> i16 {
    (a[0] as i16 - b[0] as i16).abs()
        + (a[1] as i16 - b[1] as i16).abs()
        + (a[2] as i16 - b[2] as i16).abs()
}

fn blend_pixel(a: Rgba<u8>, b: Rgba<u8>, t: f32) -> Rgba<u8> {
    let inv = 1.0 - t;
    Rgba([
        (a[0] as f32 * inv + b[0] as f32 * t) as u8,
        (a[1] as f32 * inv + b[1] as f32 * t) as u8,
        (a[2] as f32 * inv + b[2] as f32 * t) as u8,
        255,
    ])
}
