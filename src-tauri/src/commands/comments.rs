use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize)]
pub struct Comment {
    pub id: Option<i32>,
    pub issue_id: i32,
    pub body: String,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub fn get_comments(issue_id: i32, state: State<'_, AppState>) -> Result<Vec<Comment>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT id, issue_id, body, created_by, created_at, updated_at FROM comments WHERE issue_id = ?1 AND is_deleted = 0 ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map([issue_id], |row| {
            Ok(Comment {
                id: row.get(0)?,
                issue_id: row.get(1)?,
                body: row.get(2)?,
                created_by: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut comments = Vec::new();
    for comment in iter.flatten() {
        comments.push(comment);
    }

    Ok(comments)
}

#[tauri::command]
pub fn create_comment(
    issue_id: i32,
    body: String,
    created_by: String,
    state: State<'_, AppState>,
) -> Result<i32, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().to_rfc3339();
    let id = (uuid::Uuid::new_v4().as_fields().0 & 0x7FFFFFFF) as i32;

    conn.execute(
        "INSERT INTO comments (id, issue_id, body, created_by, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        rusqlite::params![id, issue_id, body, created_by, now],
    )
    .map_err(|e| e.to_string())?;

    let payload = serde_json::json!({
        "id": id,
        "issue_id": issue_id,
        "body": body,
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
        "is_deleted": 0
    });
    let _ = crate::sync::push_delta(&state.config, "comments", id, "insert", payload);

    Ok(id)
}

#[tauri::command]
pub fn update_comment(id: i32, body: String, state: State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().to_rfc3339();
    conn.execute(
        "UPDATE comments SET body = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![body, now, id],
    )
    .map_err(|e| e.to_string())?;

    let payload = serde_json::json!({
        "body": body,
        "updated_at": now
    });
    let _ = crate::sync::push_delta(&state.config, "comments", id, "update", payload);

    Ok(())
}

#[tauri::command]
pub fn delete_comment(id: i32, state: State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().to_rfc3339();
    conn.execute(
        "UPDATE comments SET is_deleted = 1, updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, id],
    )
    .map_err(|e| e.to_string())?;

    let payload = serde_json::json!({
        "is_deleted": 1,
        "updated_at": now
    });
    let _ = crate::sync::push_delta(&state.config, "comments", id, "update", payload);

    Ok(())
}
