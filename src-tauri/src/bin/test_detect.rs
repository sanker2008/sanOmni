#[tokio::main]
async fn main() {
    let result = sanomni_lib::commands::watermark::detect_watermark(
        r#"C:\Users\Admin\AppData\Roaming\com.sanomni.app\inbox\1779446708315_Gemini_Generated_Image_tgzf02tgzf02tgzf (1).png"#.to_string()
    ).await;
    println!("Detection Result: {:#?}", result);
}
