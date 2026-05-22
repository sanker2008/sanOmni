use image::GenericImageView;

fn main() {
    let orig = image::open(r#"C:\Users\Admin\AppData\Roaming\com.sanmediabox.app\inbox\1779446708315_Gemini_Generated_Image_tgzf02tgzf02tgzf (1).png"#).unwrap();
    let proc = image::open(r#"C:\Users\Admin\AppData\Roaming\com.sanmediabox.app\inbox\test_output.png"#).unwrap();
    
    // Watermark is at 4048, 944, size 48
    let mut sum_diff = 0;
    println!("Sample pixels before/after:");
    for y in 944..944+10 {
        for x in 4048..4048+10 {
            let p1 = orig.get_pixel(x, y);
            let p2 = proc.get_pixel(x, y);
            if p1 != p2 {
                println!("({},{}): {:?} -> {:?}", x, y, p1.0, p2.0);
                sum_diff += 1;
            }
        }
    }
    if sum_diff == 0 {
        println!("No changes in the first 10x10 block.");
    }
}
