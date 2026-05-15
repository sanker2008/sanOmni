use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassificationResult {
    pub vendor_id: Option<String>,
    pub model_id: Option<String>,
    pub confidence: f32,
    pub matched_pattern: Option<String>,
}

/// 根据文件名自动分类，推断厂商和模型
pub fn classify_filename(filename: &str) -> ClassificationResult {
    let lower = filename.to_lowercase();

    // 匹配规则（按优先级排序）：

    // ── OpenAI / DALL-E ──────────────────────────────
    // gpt-image-2 (高优先级，先匹配更具体的)
    if lower.contains("gpt-image") {
        if lower.contains("gpt-image-2") {
            return ClassificationResult {
                vendor_id: Some("openai".to_string()),
                model_id: Some("gpt-image-2".to_string()),
                confidence: 0.9,
                matched_pattern: Some("gpt-image-2".to_string()),
            };
        }
        return ClassificationResult {
            vendor_id: Some("openai".to_string()),
            model_id: Some("gpt-image".to_string()),
            confidence: 0.8,
            matched_pattern: Some("gpt-image".to_string()),
        };
    }

    // dall-e-3 / dalle3
    if lower.contains("dall-e-3") || lower.contains("dalle3") {
        return ClassificationResult {
            vendor_id: Some("openai".to_string()),
            model_id: Some("dall-e-3".to_string()),
            confidence: 0.9,
            matched_pattern: Some("dall-e-3".to_string()),
        };
    }

    // dall-e-2 / dalle2
    if lower.contains("dall-e-2") || lower.contains("dalle2") {
        return ClassificationResult {
            vendor_id: Some("openai".to_string()),
            model_id: Some("dall-e-2".to_string()),
            confidence: 0.9,
            matched_pattern: Some("dall-e-2".to_string()),
        };
    }

    // dall-e / dalle (通用)
    if lower.contains("dall-e") || lower.contains("dalle") {
        return ClassificationResult {
            vendor_id: Some("openai".to_string()),
            model_id: Some("dall-e".to_string()),
            confidence: 0.7,
            matched_pattern: Some("dall-e".to_string()),
        };
    }

    // ── Google / Gemini ──────────────────────────────
    // imagen-3 / imagen3
    if lower.contains("imagen-3") || lower.contains("imagen3") {
        return ClassificationResult {
            vendor_id: Some("google".to_string()),
            model_id: Some("imagen-3".to_string()),
            confidence: 0.9,
            matched_pattern: Some("imagen-3".to_string()),
        };
    }

    // imagen-4 / imagen4
    if lower.contains("imagen-4") || lower.contains("imagen4") {
        return ClassificationResult {
            vendor_id: Some("google".to_string()),
            model_id: Some("imagen-4".to_string()),
            confidence: 0.9,
            matched_pattern: Some("imagen-4".to_string()),
        };
    }

    // imagen (通用)
    if lower.contains("imagen") {
        return ClassificationResult {
            vendor_id: Some("google".to_string()),
            model_id: Some("imagen".to_string()),
            confidence: 0.7,
            matched_pattern: Some("imagen".to_string()),
        };
    }

    // nano-banana-pro
    if lower.contains("nano-banana-pro") || lower.contains("nano_banana_pro") {
        return ClassificationResult {
            vendor_id: Some("google".to_string()),
            model_id: Some("nano-banana-pro".to_string()),
            confidence: 0.9,
            matched_pattern: Some("nano-banana-pro".to_string()),
        };
    }

    // nano-banana (不含 pro)
    if lower.contains("nano-banana") || lower.contains("nano_banana") {
        return ClassificationResult {
            vendor_id: Some("google".to_string()),
            model_id: Some("nano-banana".to_string()),
            confidence: 0.8,
            matched_pattern: Some("nano-banana".to_string()),
        };
    }

    // gemini
    if lower.contains("gemini") {
        return ClassificationResult {
            vendor_id: Some("google".to_string()),
            model_id: Some("gemini".to_string()),
            confidence: 0.7,
            matched_pattern: Some("gemini".to_string()),
        };
    }

    // ── Midjourney ───────────────────────────────────
    // midjourney-v6 / mj-v6
    if lower.contains("midjourney-v6") || lower.contains("mj-v6") {
        return ClassificationResult {
            vendor_id: Some("midjourney".to_string()),
            model_id: Some("midjourney-v6".to_string()),
            confidence: 0.9,
            matched_pattern: Some("midjourney-v6".to_string()),
        };
    }

    // midjourney-v5 / mj-v5
    if lower.contains("midjourney-v5") || lower.contains("mj-v5") {
        return ClassificationResult {
            vendor_id: Some("midjourney".to_string()),
            model_id: Some("midjourney-v5".to_string()),
            confidence: 0.9,
            matched_pattern: Some("midjourney-v5".to_string()),
        };
    }

    // midjourney / mj (通用)
    if lower.contains("midjourney") || lower.contains("mj_") {
        return ClassificationResult {
            vendor_id: Some("midjourney".to_string()),
            model_id: Some("midjourney".to_string()),
            confidence: 0.7,
            matched_pattern: Some("midjourney".to_string()),
        };
    }

    // 未匹配
    ClassificationResult {
        vendor_id: None,
        model_id: None,
        confidence: 0.0,
        matched_pattern: None,
    }
}

#[tauri::command]
pub async fn classify_image(filename: String) -> ClassificationResult {
    classify_filename(&filename)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_openai_dalle3() {
        let result = classify_filename("dall-e-3-cat.png");
        assert_eq!(result.vendor_id, Some("openai".to_string()));
        assert_eq!(result.model_id, Some("dall-e-3".to_string()));
        assert!(result.confidence >= 0.9);
    }

    #[test]
    fn test_openai_dalle3_short() {
        let result = classify_filename("DALLE3_landscape.jpg");
        assert_eq!(result.vendor_id, Some("openai".to_string()));
        assert_eq!(result.model_id, Some("dall-e-3".to_string()));
    }

    #[test]
    fn test_openai_gpt_image() {
        let result = classify_filename("gpt-image-2-portrait.png");
        assert_eq!(result.vendor_id, Some("openai".to_string()));
        assert_eq!(result.model_id, Some("gpt-image-2".to_string()));
    }

    #[test]
    fn test_google_gemini() {
        let result = classify_filename("gemini-generated-art.webp");
        assert_eq!(result.vendor_id, Some("google".to_string()));
        assert_eq!(result.model_id, Some("gemini".to_string()));
    }

    #[test]
    fn test_google_imagen3() {
        let result = classify_filename("imagen-3-photo.jpg");
        assert_eq!(result.vendor_id, Some("google".to_string()));
        assert_eq!(result.model_id, Some("imagen-3".to_string()));
    }

    #[test]
    fn test_google_nano_banana_pro() {
        let result = classify_filename("nano-banana-pro-icon.png");
        assert_eq!(result.vendor_id, Some("google".to_string()));
        assert_eq!(result.model_id, Some("nano-banana-pro".to_string()));
    }

    #[test]
    fn test_midjourney_v6() {
        let result = classify_filename("midjourney-v6-fantasy.png");
        assert_eq!(result.vendor_id, Some("midjourney".to_string()));
        assert_eq!(result.model_id, Some("midjourney-v6".to_string()));
    }

    #[test]
    fn test_no_match() {
        let result = classify_filename("my-vacation-photo.jpg");
        assert_eq!(result.vendor_id, None);
        assert_eq!(result.model_id, None);
        assert_eq!(result.confidence, 0.0);
    }
}
