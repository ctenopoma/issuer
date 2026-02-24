use arboard::Clipboard;
use base64::{Engine as _, engine::general_purpose};
use image::{ImageBuffer, RgbaImage};
use uuid::Uuid;
use std::fs;
use std::path::Path;
use tauri::State;
use crate::AppState;

#[tauri::command]
pub fn get_assets_dir(state: State<'_, AppState>) -> Result<String, String> {
    let assets_dir = state.config.original_dir.join("assets");
    Ok(assets_dir.to_string_lossy().replace('\\', "/"))
}

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
    
    Ok(file_path.to_string_lossy().replace('\\', "/"))
}

#[tauri::command]
pub fn read_image_base64(path: String) -> Result<String, String> {
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }
    let data = fs::read(file_path).map_err(|e| format!("Failed to read file: {}", e))?;
    let mime = match file_path.extension().and_then(|e| e.to_str()) {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        _ => "image/png",
    };
    let b64 = general_purpose::STANDARD.encode(&data);
    Ok(format!("data:{};base64,{}", mime, b64))
}
