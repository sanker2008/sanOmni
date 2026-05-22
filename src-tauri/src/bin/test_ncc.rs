use image::GenericImageView;

const BG_48_BYTES: &[u8] = include_bytes!("../assets/bg_48.png");
const BG_96_BYTES: &[u8] = include_bytes!("../assets/bg_96.png");

fn load_alpha_map(size: u32) -> Result<Vec<f32>, String> {
    let bytes = match size {
        48 => BG_48_BYTES,
        96 => BG_96_BYTES,
        _ => return Err(format!("Unsupported alpha map size: {}", size)),
    };
    
    let img = image::load_from_memory(bytes)
        .map_err(|e| format!("Failed to decode alpha map: {}", e))?;
    
    let img = img.to_rgba8();
    let mut alpha_map = vec![0.0; (size * size) as usize];
    
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

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let image_path = if args.len() > 1 {
        &args[1]
    } else {
        r#"C:\Users\Admin\AppData\Roaming\com.sanmediabox.app\inbox\1779446708315_Gemini_Generated_Image_tgzf02tgzf02tgzf (1).png"#
    };
    let output_path = r#"C:\Users\Admin\AppData\Roaming\com.sanmediabox.app\inbox\test_output.png"#;

    let start = std::time::Instant::now();
    
    let img = image::open(image_path).unwrap();
    let mut result_img = img.to_rgba8();
    
    let width = result_img.width();
    let height = result_img.height();
    
    let sizes_to_check = [96, 48];
    let mut best_overall_ncc = -1.0_f32;
    let mut best_match = None;
    
    for &wm_size in &sizes_to_check {
        if width < wm_size || height < wm_size { continue; }
        
        let alpha_map = load_alpha_map(wm_size).unwrap();
        
        struct ActivePixel {
            x: u32,
            y: u32,
            alpha: f32,
        }
        let mut active_pixels = Vec::with_capacity((wm_size * wm_size) as usize);
        for row in 0..wm_size {
            for col in 0..wm_size {
                let alpha = alpha_map[(row * wm_size + col) as usize];
                if alpha > 0.02 { 
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
    
    println!("Best NCC: {:.3}", best_overall_ncc);

    let (wm_size, target_x, target_y, alpha_map) = if let Some(match_info) = best_match {
        println!("Match found: size={}, x={}, y={}", match_info.0, match_info.1, match_info.2);
        match_info
    } else {
        println!("No match found");
        return;
    };
    
    let alpha_threshold: f32 = 0.002;
    let max_alpha: f32 = 0.99;
    let logo_value: f32 = 255.0;
    
    for row in 0..wm_size {
        for col in 0..wm_size {
            let alpha_idx = (row * wm_size + col) as usize;
            let mut alpha = alpha_map[alpha_idx];
            
            if alpha < alpha_threshold { continue; }
            if alpha > max_alpha { alpha = max_alpha; }
            
            let px = target_x + col;
            let py = target_y + row;
            
            if px >= width || py >= height { continue; }
            
            let mut pixel = result_img.get_pixel(px, py).clone();
            
            for c in 0..3 {
                let watermarked = pixel[c] as f32;
                let original = (watermarked - alpha * logo_value) / (1.0 - alpha);
                pixel[c] = original.max(0.0).min(255.0) as u8;
            }
            
            result_img.put_pixel(px, py, pixel);
        }
    }
    
    result_img.save(output_path).unwrap();
    println!("Processed in {} ms", start.elapsed().as_millis());
}
