use crate::AppState;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ThemeColors {
    #[serde(rename = "brand-bg")]
    pub brand_bg: String,
    #[serde(rename = "brand-card")]
    pub brand_card: String,
    #[serde(rename = "brand-border")]
    pub brand_border: String,
    #[serde(rename = "brand-text-main")]
    pub brand_text_main: String,
    #[serde(rename = "brand-text-muted")]
    pub brand_text_muted: String,
    #[serde(rename = "brand-primary")]
    pub brand_primary: String,
    #[serde(rename = "brand-open")]
    pub brand_open: String,
    #[serde(rename = "brand-closed")]
    pub brand_closed: String,
    #[serde(rename = "brand-danger")]
    pub brand_danger: String,
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ThemeFontConfig {
    pub family: String,
    #[serde(skip_serializing_if = "Option::is_none", rename = "importUrl")]
    pub import_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WidgetPosition {
    pub col: u32,
    pub row: u32,
    #[serde(skip_serializing_if = "Option::is_none", rename = "colSpan")]
    pub col_span: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "rowSpan")]
    pub row_span: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WidgetConfig {
    #[serde(rename = "type")]
    pub widget_type: String,
    pub position: WidgetPosition,
    #[serde(default)]
    pub config: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DashboardConfig {
    pub layout: String,
    pub widgets: Vec<WidgetConfig>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ThemeConfig {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
    pub colors: ThemeColors,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font: Option<ThemeFontConfig>,
    pub dashboard: DashboardConfig,
    #[serde(skip_serializing_if = "Option::is_none", rename = "customCss")]
    pub custom_css: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ThemeMetadata {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub author: String,
    pub preview_url: Option<String>,
    pub installed: bool,
}

/// テーマディレクトリのパスを取得
fn themes_dir(state: &AppState) -> PathBuf {
    state.config.local_dir.join("themes")
}

/// テーマキャッシュファイルのパス
fn cache_path(state: &AppState) -> PathBuf {
    state.config.local_dir.join("theme-cache.json")
}

/// インストール済みテーマの一覧を返す
#[tauri::command]
pub fn get_installed_themes(state: tauri::State<'_, AppState>) -> Result<Vec<ThemeConfig>, String> {
    let dir = themes_dir(&state);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut themes = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            let theme_json = path.join("theme.json");
            if theme_json.exists() {
                match fs::read_to_string(&theme_json) {
                    Ok(content) => match serde_json::from_str::<ThemeConfig>(&content) {
                        Ok(config) => themes.push(config),
                        Err(e) => {
                            crate::debug_log::log(&format!(
                                "Failed to parse theme.json in {:?}: {}",
                                path, e
                            ));
                        }
                    },
                    Err(e) => {
                        crate::debug_log::log(&format!(
                            "Failed to read theme.json in {:?}: {}",
                            path, e
                        ));
                    }
                }
            }
        }
    }

    Ok(themes)
}

/// アクティブなテーマを取得
#[tauri::command]
pub fn get_active_theme(state: tauri::State<'_, AppState>) -> Result<Option<ThemeConfig>, String> {
    let settings = crate::settings::read_settings(&state.config);
    let theme_id = match settings.selected_theme {
        Some(id) if !id.is_empty() && id != "default" => id,
        _ => return Ok(None),
    };

    let theme_json = themes_dir(&state).join(&theme_id).join("theme.json");
    if !theme_json.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&theme_json).map_err(|e| e.to_string())?;
    let config = serde_json::from_str::<ThemeConfig>(&content).map_err(|e| e.to_string())?;
    Ok(Some(config))
}

/// アクティブテーマを設定
#[tauri::command]
pub fn set_active_theme(
    theme_id: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut settings = crate::settings::read_settings(&state.config);
    settings.selected_theme = theme_id;
    crate::settings::write_settings_pub(&state.config, &settings)
}

/// テーマ内のファイルを読み取る（style.css等）
#[tauri::command]
pub fn read_theme_file(
    theme_id: String,
    file_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    // パストラバーサル防止
    if file_path.contains("..") {
        return Err("Invalid file path".to_string());
    }

    let path = themes_dir(&state).join(&theme_id).join(&file_path);
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", file_path, e))
}

/// テーマ内の画像アセットのファイルパスを返す
#[tauri::command]
pub fn get_theme_asset_path(
    theme_id: String,
    asset_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    if asset_path.contains("..") {
        return Err("Invalid asset path".to_string());
    }

    let path = themes_dir(&state).join(&theme_id).join(&asset_path);
    if !path.exists() {
        return Err(format!("Asset not found: {}", asset_path));
    }

    Ok(path.to_string_lossy().to_string())
}

/// テーマを削除
#[tauri::command]
pub fn delete_theme(theme_id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    if theme_id == "default" {
        return Err("Cannot delete default theme".to_string());
    }

    // パストラバーサル防止
    if theme_id.contains("..") || theme_id.contains('/') || theme_id.contains('\\') {
        return Err("Invalid theme ID".to_string());
    }

    let dir = themes_dir(&state).join(&theme_id);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }

    // アクティブテーマだった場合はデフォルトに戻す
    let settings = crate::settings::read_settings(&state.config);
    if settings.selected_theme.as_deref() == Some(&theme_id) {
        let mut settings = settings;
        settings.selected_theme = None;
        crate::settings::write_settings_pub(&state.config, &settings)?;
    }

    Ok(())
}

/// GitHub Organization からリモートテーマ一覧を取得
#[tauri::command]
pub fn list_remote_themes(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ThemeMetadata>, String> {
    let cache = cache_path(&state);

    // キャッシュが5分以内なら再利用
    if let Ok(metadata) = fs::metadata(&cache) {
        if let Ok(modified) = metadata.modified() {
            if modified.elapsed().unwrap_or_default().as_secs() < 300 {
                if let Ok(content) = fs::read_to_string(&cache) {
                    if let Ok(cached) = serde_json::from_str::<Vec<ThemeMetadata>>(&content) {
                        return Ok(cached);
                    }
                }
            }
        }
    }

    // GitHub API でリポジトリ一覧を取得
    let url = "https://api.github.com/orgs/IssuerTheme/repos?per_page=100";
    let client = reqwest::blocking::Client::builder()
        .user_agent("Issuer-App/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(url).send().map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("GitHub API error: {}", response.status()));
    }

    let repos: Vec<serde_json::Value> = response.json().map_err(|e| e.to_string())?;

    // インストール済みテーマの一覧
    let installed_ids: Vec<String> = get_installed_theme_ids(&state);

    let themes: Vec<ThemeMetadata> = repos
        .iter()
        .filter(|repo| {
            repo["name"]
                .as_str()
                .map(|n| n.starts_with("theme-"))
                .unwrap_or(false)
        })
        .map(|repo| {
            let full_name = repo["name"].as_str().unwrap_or("");
            let id = full_name.strip_prefix("theme-").unwrap_or(full_name).to_string();
            ThemeMetadata {
                id: id.clone(),
                name: repo["description"]
                    .as_str()
                    .unwrap_or(full_name)
                    .to_string(),
                description: repo["description"]
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
                version: "".to_string(),
                author: repo["owner"]["login"]
                    .as_str()
                    .unwrap_or("IssuerTheme")
                    .to_string(),
                preview_url: None,
                installed: installed_ids.contains(&id),
            }
        })
        .collect();

    // キャッシュに保存
    if let Ok(json) = serde_json::to_string_pretty(&themes) {
        let _ = fs::create_dir_all(cache.parent().unwrap());
        let _ = fs::write(&cache, json);
    }

    Ok(themes)
}

/// テーマをダウンロード（GitHub リポジトリの zipball を展開）
#[tauri::command]
pub fn download_theme(
    theme_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<ThemeConfig, String> {
    // パストラバーサル防止
    if theme_id.contains("..") || theme_id.contains('/') || theme_id.contains('\\') {
        return Err("Invalid theme ID".to_string());
    }

    let repo_name = format!("theme-{}", theme_id);
    let url = format!(
        "https://api.github.com/repos/IssuerTheme/{}/zipball/main",
        repo_name
    );

    let client = reqwest::blocking::Client::builder()
        .user_agent("Issuer-App/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&url).send().map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download theme: HTTP {}",
            response.status()
        ));
    }

    let bytes = response.bytes().map_err(|e| e.to_string())?;

    // ZIP を展開
    let dest_dir = themes_dir(&state).join(&theme_id);
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let cursor = std::io::Cursor::new(&bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;

    // GitHub zipball はルートにリポジトリ名のディレクトリがある
    // 例: IssuerTheme-theme-nordic-abc1234/theme.json
    // これをフラットに展開する
    let prefix = archive
        .by_index(0)
        .map_err(|e| e.to_string())?
        .name()
        .split('/')
        .next()
        .unwrap_or("")
        .to_string();

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let raw_name = file.name().to_string();

        // プレフィックスを除去
        let relative = raw_name
            .strip_prefix(&format!("{}/", prefix))
            .unwrap_or(&raw_name);

        if relative.is_empty() {
            continue;
        }

        let target = dest_dir.join(relative);

        if file.is_dir() {
            fs::create_dir_all(&target).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out = fs::File::create(&target).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut out).map_err(|e| e.to_string())?;
        }
    }

    // theme.json を読み込んで返す
    let theme_json = dest_dir.join("theme.json");
    let content = fs::read_to_string(&theme_json)
        .map_err(|e| format!("Downloaded theme has no theme.json: {}", e))?;
    let config = serde_json::from_str::<ThemeConfig>(&content)
        .map_err(|e| format!("Invalid theme.json: {}", e))?;

    Ok(config)
}

/// ヘルパー: インストール済みテーマIDの一覧
fn get_installed_theme_ids(state: &AppState) -> Vec<String> {
    let dir = themes_dir(state);
    if !dir.exists() {
        return vec![];
    }

    fs::read_dir(&dir)
        .ok()
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_dir())
                .filter(|e| e.path().join("theme.json").exists())
                .filter_map(|e| e.file_name().into_string().ok())
                .collect()
        })
        .unwrap_or_default()
}
