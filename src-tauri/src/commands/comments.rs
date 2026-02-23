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
}

#[tauri::command]
pub fn get_comments(issue_id: i32, state: State<'_, AppState>) -> Result<Vec<Comment>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT id, issue_id, body, created_by, created_at FROM comments WHERE issue_id = ?1 ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map([issue_id], |row| {
            Ok(Comment {
                id: row.get(0)?,
                issue_id: row.get(1)?,
                body: row.get(2)?,
                created_by: row.get(3)?,
                created_at: row.get(4)?,
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

    conn.execute(
        "INSERT INTO comments (issue_id, body, created_by, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![issue_id, body, created_by, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid() as i32)
}

#[tauri::command]
pub fn update_comment(id: i32, body: String, state: State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE comments SET body = ?1 WHERE id = ?2",
        rusqlite::params![body, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_comment(id: i32, state: State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM comments WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
