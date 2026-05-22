use image::GenericImageView;
use std::env;

fn main() {
    let img = image::open("src-tauri/src/assets/bg_48.png").unwrap();
    let img = img.to_rgba8();
    println!("Dimensions: {}x{}", img.width(), img.height());
    let p = img.get_pixel(0, 0); // corner pixel
    println!("Corner pixel (0,0): R={}, G={}, B={}, A={}", p[0], p[1], p[2], p[3]);
    
    // find a non-zero alpha pixel
    let mut found = false;
    for y in 0..img.height() {
        for x in 0..img.width() {
            let p = img.get_pixel(x, y);
            if p[3] > 0 && p[3] < 255 && !found {
                println!("First semi-transparent pixel at ({},{}): R={}, G={}, B={}, A={}", x, y, p[0], p[1], p[2], p[3]);
                found = true;
            }
        }
    }
}
