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

    let mut stmt = conn.prepare("SELECT id, title, body, status, created_by, assignee, created_at, updated_at, milestone_id FROM issues WHERE is_deleted = 0 ORDER BY updated_at DESC")
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
    for i in iter.flatten() {
        issues.push(i);
    }

    Ok(issues)
}

#[tauri::command]
pub fn get_issue(id: i32, state: State<'_, AppState>) -> Result<Issue, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, title, body, status, created_by, assignee, created_at, updated_at, milestone_id FROM issues WHERE id = ?1 AND is_deleted = 0")
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
    crate::debug_log::log(&format!(
        "[create_issue] called: title={}, created_by={}, assignee={}",
        title, created_by, assignee
    ));
    let conn = state.db.lock().map_err(|e| {
        crate::debug_log::log(&format!("[create_issue] db lock error: {}", e));
        e.to_string()
    })?;
    let now = chrono::Local::now().to_rfc3339();

    let id: i32 = conn
        .query_row("SELECT COALESCE(MAX(id), 0) + 1 FROM issues", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO issues (id, title, body, status, created_by, assignee, created_at, updated_at) VALUES (?1, ?2, ?3, 'OPEN', ?4, ?5, ?6, ?6)",
        rusqlite::params![id, title, body, created_by, assignee, now],
    ).map_err(|e| {
        crate::debug_log::log(&format!("[create_issue] SQL error: {}", e));
        e.to_string()
    })?;

    let payload = serde_json::json!({
        "id": id,
        "title": title,
        "body": body,
        "status": "OPEN",
        "created_by": created_by,
        "assignee": assignee,
        "created_at": now,
        "updated_at": now,
        "milestone_id": null,
        "is_deleted": 0
    });
    let _ = crate::sync::push_delta(&state.config, "issues", id, "insert", payload);

    crate::debug_log::log(&format!("[create_issue] success: id={}", id));
    Ok(id)
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

    let payload = serde_json::json!({
        "title": title,
        "body": body,
        "status": status,
        "assignee": assignee,
        "milestone_id": milestone_id,
        "updated_at": now
    });
    let _ = crate::sync::push_delta(&state.config, "issues", id, "update", payload);

    Ok(())
}

#[tauri::command]
pub fn delete_issue(id: i32, state: State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().to_rfc3339();
    let mut stmt = conn
        .prepare("SELECT id FROM comments WHERE issue_id = ?1")
        .map_err(|e| e.to_string())?;
    let mut comments_to_delete = Vec::new();
    if let Ok(iter) = stmt.query_map([id], |row| row.get(0)) {
        for cid in iter.flatten() {
            comments_to_delete.push(cid);
        }
    }

    // Delete associated comments first
    conn.execute(
        "UPDATE comments SET is_deleted = 1, updated_at = ?2 WHERE issue_id = ?1",
        rusqlite::params![id, now],
    )
    .map_err(|e| e.to_string())?;

    // push deltas for comments
    for cid in comments_to_delete {
        let _ = crate::sync::push_delta(
            &state.config,
            "comments",
            cid,
            "update",
            serde_json::json!({"is_deleted": 1, "updated_at": now}),
        );
    }

    conn.execute(
        "UPDATE issues SET is_deleted = 1, updated_at = ?2 WHERE id = ?1",
        rusqlite::params![id, now],
    )
    .map_err(|e| e.to_string())?;

    let payload = serde_json::json!({
        "is_deleted": 1,
        "updated_at": now
    });
    let _ = crate::sync::push_delta(&state.config, "issues", id, "update", payload);
    Ok(())
}
