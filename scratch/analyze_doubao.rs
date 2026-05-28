// 豆包水印分析工具
// 编译: rustc analyze_doubao.rs
// 运行: ./analyze_doubao

use std::collections::HashMap;

fn main() {
    println!("豆包水印分析工具");
    println!("=================\n");
    
    let images = vec![
        "docs/doubao.png",
        "docs/doubao-black.png", 
        "docs/doubao-white.png",
    ];
    
    for img_path in images {
        println!("分析图片: {}", img_path);
        
        match image::open(img_path) {
            Ok(img) => {
                analyze_image(&img, img_path);
            }
            Err(e) => {
                println!("  错误: 无法打开图片 - {}\n", e);
            }
        }
    }
}

fn analyze_image(img: &image::DynamicImage, path: &str) {
    let width = img.width();
    let height = img.height();
    
    println!("  尺寸: {} x {}", width, height);
    
    // 分析整个图片
    println!("\n  === 整图分析 ===");
    analyze_region(img, 0, 0, width, height, "整图");
    
    // 分析右下角不同大小的区域
    let regions = vec![
        ("右下10%", (width as f32 * 0.9) as u32, (height as f32 * 0.9) as u32, width, height),
        ("右下15%", (width as f32 * 0.85) as u32, (height as f32 * 0.85) as u32, width, height),
        ("右下20%", (width as f32 * 0.8) as u32, (height as f32 * 0.8) as u32, width, height),
        ("右下角150px", width.saturating_sub(150), height.saturating_sub(150), width, height),
    ];
    
    for (name, x1, y1, x2, y2) in regions {
        if x2 > x1 && y2 > y1 {
            println!("\n  === {} 区域 ===", name);
            let region = img.crop_imm(x1, y1, x2 - x1, y2 - y1);
            analyze_region(&region, x1, y1, x2, y2, name);
        }
    }
    
    // 保存右下角区域
    let corner_size = 200u32.min(width).min(height);
    let corner = img.crop_imm(
        width.saturating_sub(corner_size),
        height.saturating_sub(corner_size),
        corner_size,
        corner_size
    );
    
    let output_path = path.replace(".png", "_corner.png");
    if let Err(e) = corner.save(&output_path) {
        println!("  警告: 无法保存角落图片 - {}", e);
    } else {
        println!("\n  右下角已保存到: {}", output_path);
    }
    
    println!("\n{}\n", "=".repeat(60));
}

fn analyze_region(img: &image::DynamicImage, x1: u32, y1: u32, x2: u32, y2: u32, name: &str) {
    let width = x2 - x1;
    let height = y2 - y1;
    
    // 统计颜色
    let mut color_stats = ColorStats::new();
    let mut brightness_histogram = vec![0u32; 256];
    
    for y in 0..height {
        for x in 0..width {
            let pixel = img.get_pixel(x1 + x, y1 + y);
            let r = pixel[0];
            let g = pixel[1];
            let b = pixel[2];
            
            color_stats.add_pixel(r, g, b);
            
            let brightness = ((r as u32 + g as u32 + b as u32) / 3) as u8;
            brightness_histogram[brightness as usize] += 1;
        }
    }
    
    let total_pixels = (width * height) as f32;
    
    println!("    区域大小: {} x {}", width, height);
    println!("    RGB均值: R={:.1} G={:.1} B={:.1}", 
        color_stats.r_sum as f32 / total_pixels,
        color_stats.g_sum as f32 / total_pixels,
        color_stats.b_sum as f32 / total_pixels
    );
    
    println!("    亮度均值: {:.1}", color_stats.brightness_sum as f32 / total_pixels);
    
    // 亮色和暗色像素
    let bright_ratio = color_stats.bright_pixels as f32 / total_pixels * 100.0;
    let dark_ratio = color_stats.dark_pixels as f32 / total_pixels * 100.0;
    let mid_ratio = color_stats.mid_pixels as f32 / total_pixels * 100.0;
    
    println!("    亮色像素(>200): {:.2}%", bright_ratio);
    println!("    中等像素(100-200): {:.2}%", mid_ratio);
    println!("    暗色像素(<100): {:.2}%", dark_ratio);
    
    // 灰度像素（R≈G≈B）
    let gray_ratio = color_stats.gray_pixels as f32 / total_pixels * 100.0;
    println!("    灰度像素: {:.2}%", gray_ratio);
    
    // 颜色多样性
    println!("    唯一颜色数: {}", color_stats.unique_colors.len());
    
    // 边缘检测
    let edge_count = detect_edges(img, x1, y1, width, height);
    let edge_ratio = edge_count as f32 / total_pixels * 100.0;
    println!("    边缘像素: {:.2}%", edge_ratio);
    
    // 亮度分布
    let mut peak_count = 0;
    let mut in_peak = false;
    let avg_count = total_pixels / 256.0;
    
    for count in &brightness_histogram {
        if *count as f32 > avg_count * 2.0 {
            if !in_peak {
                peak_count += 1;
                in_peak = true;
            }
        } else {
            in_peak = false;
        }
    }
    println!("    亮度峰值数: {}", peak_count);
}

struct ColorStats {
    r_sum: u64,
    g_sum: u64,
    b_sum: u64,
    brightness_sum: u64,
    bright_pixels: u32,
    dark_pixels: u32,
    mid_pixels: u32,
    gray_pixels: u32,
    unique_colors: HashMap<(u8, u8, u8), u32>,
}

impl ColorStats {
    fn new() -> Self {
        Self {
            r_sum: 0,
            g_sum: 0,
            b_sum: 0,
            brightness_sum: 0,
            bright_pixels: 0,
            dark_pixels: 0,
            mid_pixels: 0,
            gray_pixels: 0,
            unique_colors: HashMap::new(),
        }
    }
    
    fn add_pixel(&mut self, r: u8, g: u8, b: u8) {
        self.r_sum += r as u64;
        self.g_sum += g as u64;
        self.b_sum += b as u64;
        
        let brightness = (r as u32 + g as u32 + b as u32) / 3;
        self.brightness_sum += brightness as u64;
        
        if brightness > 200 {
            self.bright_pixels += 1;
        } else if brightness < 100 {
            self.dark_pixels += 1;
        } else {
            self.mid_pixels += 1;
        }
        
        // 检查是否为灰度
        let r_i32 = r as i32;
        let g_i32 = g as i32;
        let b_i32 = b as i32;
        let color_diff = (r_i32 - g_i32).abs() + (g_i32 - b_i32).abs() + (b_i32 - r_i32).abs();
        
        if color_diff < 30 {
            self.gray_pixels += 1;
        }
        
        // 量化颜色以减少唯一颜色数
        let color_key = (r / 16, g / 16, b / 16);
        *self.unique_colors.entry(color_key).or_insert(0) += 1;
    }
}

fn detect_edges(img: &image::DynamicImage, x1: u32, y1: u32, width: u32, height: u32) -> u32 {
    let mut edge_count = 0;
    
    for y in 1..height-1 {
        for x in 1..width-1 {
            let center = img.get_pixel(x1 + x, y1 + y);
            let center_b = (center[0] as i32 + center[1] as i32 + center[2] as i32) / 3;
            
            let right = img.get_pixel(x1 + x + 1, y1 + y);
            let right_b = (right[0] as i32 + right[1] as i32 + right[2] as i32) / 3;
            
            let down = img.get_pixel(x1 + x, y1 + y + 1);
            let down_b = (down[0] as i32 + down[1] as i32 + down[2] as i32) / 3;
            
            let gx = (center_b - right_b).abs();
            let gy = (center_b - down_b).abs();
            
            if gx > 30 || gy > 30 {
                edge_count += 1;
            }
        }
    }
    
    edge_count
}
