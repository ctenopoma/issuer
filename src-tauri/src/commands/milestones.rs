use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize)]
pub struct Milestone {
    pub id: Option<i32>,
    pub title: String,
    pub description: String,
    pub start_date: Option<String>,
    pub due_date: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub fn get_milestones(state: State<'_, AppState>) -> Result<Vec<Milestone>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT id, title, description, start_date, due_date, status, created_at, updated_at FROM milestones WHERE is_deleted = 0 ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map([], |row| {
            Ok(Milestone {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                start_date: row.get(3)?,
                due_date: row.get(4)?,
                status: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for i in iter.flatten() {
        items.push(i);
    }

    Ok(items)
}

#[tauri::command]
pub fn create_milestone(
    title: String,
    description: String,
    start_date: Option<String>,
    due_date: Option<String>,
    state: State<'_, AppState>,
) -> Result<i32, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().to_rfc3339();

    let id = (uuid::Uuid::new_v4().as_fields().0 & 0x7FFFFFFF) as i32;

    conn.execute(
        "INSERT INTO milestones (id, title, description, start_date, due_date, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'planned', ?6, ?6)",
        rusqlite::params![id, title, description, start_date, due_date, now],
    ).map_err(|e| e.to_string())?;

    let payload = serde_json::json!({
        "id": id,
        "title": title,
        "description": description,
        "start_date": start_date,
        "due_date": due_date,
        "status": "planned",
        "created_at": now,
        "updated_at": now,
        "is_deleted": 0
    });
    let _ = crate::sync::push_delta(&state.config, "milestones", id, "insert", payload);

    Ok(id)
}

#[tauri::command]
pub fn update_milestone(
    id: i32,
    title: String,
    description: String,
    start_date: Option<String>,
    due_date: Option<String>,
    status: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().to_rfc3339();

    conn.execute(
        "UPDATE milestones SET title = ?1, description = ?2, start_date = ?3, due_date = ?4, status = ?5, updated_at = ?6 WHERE id = ?7",
        rusqlite::params![title, description, start_date, due_date, status, now, id],
    )
    .map_err(|e| e.to_string())?;

    let payload = serde_json::json!({
        "title": title,
        "description": description,
        "start_date": start_date,
        "due_date": due_date,
        "status": status,
        "updated_at": now
    });
    let _ = crate::sync::push_delta(&state.config, "milestones", id, "update", payload);

    Ok(())
}

#[tauri::command]
pub fn delete_milestone(id: i32, state: State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = chrono::Local::now().to_rfc3339();

    // Find issues first to push deltas for them
    let mut stmt = conn
        .prepare("SELECT id FROM issues WHERE milestone_id = ?1")
        .map_err(|e| e.to_string())?;
    let mut issues_to_unlink = Vec::new();
    if let Ok(iter) = stmt.query_map([id], |row| row.get(0)) {
        for issue_id in iter.flatten() {
            issues_to_unlink.push(issue_id);
        }
    }

    // Unlink issues from this milestone
    conn.execute(
        "UPDATE issues SET milestone_id = NULL WHERE milestone_id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;

    for issue_id in issues_to_unlink {
        let _ = crate::sync::push_delta(
            &state.config,
            "issues",
            issue_id,
            "update",
            serde_json::json!({"milestone_id": null, "updated_at": now}),
        );
    }

    conn.execute(
        "UPDATE milestones SET is_deleted = 1, updated_at = ?2 WHERE id = ?1",
        rusqlite::params![id, now],
    )
    .map_err(|e| e.to_string())?;

    let payload = serde_json::json!({
        "is_deleted": 1,
        "updated_at": now
    });
    let _ = crate::sync::push_delta(&state.config, "milestones", id, "update", payload);

    Ok(())
}

#[derive(Serialize)]
pub struct MilestoneProgress {
    pub milestone_id: i32,
    pub total: i32,
    pub closed: i32,
    pub percent: i32,
}

#[tauri::command]
pub fn get_milestone_progress(
    state: State<'_, AppState>,
) -> Result<Vec<MilestoneProgress>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT m.id,
                    COUNT(i.id) AS total,
                    SUM(CASE WHEN i.status = 'CLOSED' THEN 1 ELSE 0 END) AS closed
             FROM milestones m
             LEFT JOIN issues i ON i.milestone_id = m.id AND i.is_deleted = 0
             WHERE m.is_deleted = 0
             GROUP BY m.id
             ORDER BY m.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map([], |row| {
            let total: i32 = row.get(1)?;
            let closed: i32 = row.get(2)?;
            let percent = if total > 0 { (closed * 100) / total } else { 0 };
            Ok(MilestoneProgress {
                milestone_id: row.get(0)?,
                total,
                closed,
                percent,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for p in iter.flatten() {
        results.push(p);
    }
    Ok(results)
}
