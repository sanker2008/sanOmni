use image::GenericImageView;

fn main() {
    let image_path = r#"C:\Users\Admin\AppData\Roaming\com.sanomni.app\inbox\1779446708315_Gemini_Generated_Image_tgzf02tgzf02tgzf (1).png"#;
    let img = image::open(image_path).unwrap();
    let width = img.width();
    let height = img.height();
    
    // Logic from detect_gemini_watermark
    let region_width = (width as f32 * 0.12).max(120.0).min(250.0) as u32;
    let region_height = (height as f32 * 0.04).max(20.0).min(60.0) as u32;
    
    let start_x = width.saturating_sub(region_width);
    let start_y = height.saturating_sub(region_height);
    
    let corner_region = img.crop_imm(start_x, start_y, region_width, region_height);
    let gray = corner_region.to_luma8();
    
    // Mock the scores, or just print region size
    println!("Detect region: {}x{} at {},{}", region_width, region_height, start_x, start_y);
}
