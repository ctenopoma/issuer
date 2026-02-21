use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize)]
pub struct Issue {
    pub id: Option<i32>,
    pub title: String,
    pub body: String,
    pub status: String,
    pub created_by: String,
    pub assignee: String,
    pub created_at: String,
    pub updated_at: String,
    pub milestone_id: Option<i32>,
}

#[tauri::command]
pub fn get_issues(state: State<'_, AppState>) -> Result<Vec<Issue>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT id, title, body, status, created_by, assignee, created_at, updated_at, milestone_id FROM issues ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map([], |row| {
            Ok(Issue {
                id: row.get(0)?,
                title: row.get(1)?,
                body: row.get(2)?,
                status: row.get(3)?,
                created_by: row.get(4)?,
                assignee: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
                milestone_id: row.get(8).unwrap_or(None),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut issues = Vec::new();
    for issue in iter {
        if let Ok(i) = issue {
            issues.push(i);
        }
    }

    Ok(issues)
}

#[tauri::command]
pub fn get_issue(id: i32, state: State<'_, AppState>) -> Result<Issue, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, title, body, status, created_by, assignee, created_at, updated_at, milestone_id FROM issues WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let issue = stmt
        .query_row([id], |row| {
            Ok(Issue {
                id: row.get(0)?,
                title: row.get(1)?,
                body: row.get(2)?,
                status: row.get(3)?,
                created_by: row.get(4)?,
                assignee: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
                milestone_id: row.get(8).unwrap_or(None),
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(issue)
}

#[tauri::command]
pub fn create_issue(
    title: String,
    body: String,
    created_by: String,
    assignee: String,
    state: State<'_, AppState>,
) -> Result<i32, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().to_rfc3339();

    conn.execute(
        "INSERT INTO issues (title, body, status, created_by, assignee, created_at, updated_at) VALUES (?1, ?2, 'OPEN', ?3, ?4, ?5, ?5)",
        rusqlite::params![title, body, created_by, assignee, now],
    ).map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid() as i32)
}

#[tauri::command]
pub fn update_issue(
    id: i32,
    title: String,
    body: String,
    status: String,
    assignee: String,
    milestone_id: Option<i32>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().to_rfc3339();

    conn.execute(
        "UPDATE issues SET title = ?1, body = ?2, status = ?3, assignee = ?4, milestone_id = ?5, updated_at = ?6 WHERE id = ?7",
        rusqlite::params![title, body, status, assignee, milestone_id, now, id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_issue(id: i32, state: State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    // Delete associated comments first
    conn.execute(
        "DELETE FROM comments WHERE issue_id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM issues WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
