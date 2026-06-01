use image::GenericImageView;

fn main() {
    let orig = image::open(r#"C:\Users\Admin\AppData\Roaming\com.sanomni.app\inbox\1779447215206_Gemini_Generated_Image_sidza0sidza0sidz.png"#).unwrap();
    let proc = image::open(r#"C:\Users\Admin\AppData\Roaming\com.sanomni.app\inbox\test_output.png"#).unwrap();
    
    let mut max_diff = 0;
    let mut sum_diff = 0u64;
    let mut diff_count = 0;
    
    for y in 944..944+48 {
        for x in 4048..4048+48 {
            let p1 = orig.get_pixel(x, y);
            let p2 = proc.get_pixel(x, y);
            
            for c in 0..3 {
                let d = (p1[c] as i32 - p2[c] as i32).abs();
                if d > 0 {
                    max_diff = max_diff.max(d);
                    sum_diff += d as u64;
                    diff_count += 1;
                }
            }
        }
    }
    
    println!("Max Diff: {}", max_diff);
    println!("Avg Diff: {}", if diff_count > 0 { sum_diff as f64 / diff_count as f64 } else { 0.0 });
    println!("Modified Pixels: {} / {}", diff_count, 48*48*3);
}
