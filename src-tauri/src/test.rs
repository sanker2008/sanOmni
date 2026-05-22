use std::fs::File;
use std::io::Read;

fn main() {
    let bytes = include_bytes!("D:/dev/san/watermelon/public/bg_48.png");
    let img = image::load_from_memory(bytes).unwrap();
    let rgba = img.to_rgba8();
    let mut vals = vec![];
    for (x, y, p) in rgba.enumerate_pixels() {
        if p[0] > 0 || p[1] > 0 || p[2] > 0 || p[3] > 0 {
            vals.push(p);
        }
    }
    println!("Found {} non-zero pixels", vals.len());
    println!("First 10: {:?}", &vals[0..10.min(vals.len())]);
}
