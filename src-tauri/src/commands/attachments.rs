use arboard::Clipboard;
use image::{ImageBuffer, RgbaImage};
use uuid::Uuid;
use std::fs;
use tauri::State;
use crate::AppState;

#[tauri::command]
pub fn paste_image(state: State<'_, AppState>) -> Result<String, String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    let image = clipboard.get_image().map_err(|e| format!("No image in clipboard: {}", e))?;
    
    let assets_dir = state.config.original_dir.join("assets");
    let _ = fs::create_dir_all(&assets_dir);
    
    let file_name = format!(
        "{}_{}.png",
        chrono::Local::now().format("%Y%m%d_%H%M%S"),
        Uuid::new_v4().to_string().chars().take(8).collect::<String>()
    );
    let file_path = assets_dir.join(&file_name);
    
    let img_buffer: RgbaImage = ImageBuffer::from_raw(
        image.width.try_into().unwrap(),
        image.height.try_into().unwrap(),
        image.bytes.into_owned()
    ).ok_or("Failed to convert image data")?;
    
    img_buffer.save(&file_path).map_err(|e| e.to_string())?;
    
    Ok(format!("assets/{}", file_name))
}
