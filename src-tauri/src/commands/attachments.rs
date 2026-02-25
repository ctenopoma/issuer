use crate::AppState;
use arboard::Clipboard;
use base64::{engine::general_purpose, Engine as _};
use image::{ImageBuffer, RgbaImage};
use std::fs;
use std::path::Path;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn get_assets_dir(state: State<'_, AppState>) -> Result<String, String> {
    let assets_dir = state.config.original_dir.join("assets");
    Ok(assets_dir.to_string_lossy().replace('\\', "/"))
}

#[tauri::command]
pub fn paste_image(state: State<'_, AppState>) -> Result<String, String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    let image = clipboard
        .get_image()
        .map_err(|e| format!("No image in clipboard: {}", e))?;

    let file_name = format!(
        "{}_{}.png",
        chrono::Local::now().format("%Y%m%d_%H%M%S"),
        Uuid::new_v4()
            .to_string()
            .chars()
            .take(8)
            .collect::<String>()
    );

    let img_buffer: RgbaImage = ImageBuffer::from_raw(
        image.width.try_into().unwrap(),
        image.height.try_into().unwrap(),
        image.bytes.into_owned(),
    )
    .ok_or("Failed to convert image data")?;

    // Try saving to original_dir first
    let original_assets_dir = state.config.original_dir.join("assets");

    // Create directory, but catch the error
    let dir_creation_err = fs::create_dir_all(&original_assets_dir).err();
    let original_file_path = original_assets_dir.join(&file_name);

    // Try to save to original_dir
    if dir_creation_err.is_none() && img_buffer.save(&original_file_path).is_ok() {
        return Ok(original_file_path.to_string_lossy().replace('\\', "/"));
    }

    // Fallback: save to local_dir if original_dir fails
    crate::debug_log::log(&format!(
        "Failed to save image to original_dir {:?}, falling back to local_dir",
        original_assets_dir
    ));

    let local_assets_dir = state.config.local_dir.join("assets");
    fs::create_dir_all(&local_assets_dir)
        .map_err(|e| format!("Failed to create local assets dir: {}", e))?;

    let local_file_path = local_assets_dir.join(&file_name);
    img_buffer
        .save(&local_file_path)
        .map_err(|e| format!("Failed to save image to local dir: {}", e))?;

    // Return the local path. We will need to sync this to original_dir later,
    // but at least the image is saved and visible in the UI.
    Ok(local_file_path.to_string_lossy().replace('\\', "/"))
}

#[tauri::command]
pub fn read_image_base64(path: String) -> Result<String, String> {
    // Decode the URL-encoded path, as UNC paths with Japanese characters might be encoded
    let decoded_path = urlencoding::decode(&path)
        .map(|s| s.into_owned())
        .unwrap_or(path.clone());

    let file_path = Path::new(&decoded_path);
    if !file_path.exists() {
        return Err(format!("File not found: {}", decoded_path));
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
