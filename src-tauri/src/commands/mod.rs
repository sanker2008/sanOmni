use serde::Serialize;

#[derive(Serialize)]
pub struct CommandResult<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> CommandResult<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(msg: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(msg),
        }
    }
}

pub mod images;
pub mod vendors;
pub mod tags;
pub mod watermark;
pub mod watermark_removal;
pub mod gemini_watermark_removal;
pub mod watcher;
pub mod classifier;
pub mod settings;
pub mod scanner;
pub mod prompt_groups;
