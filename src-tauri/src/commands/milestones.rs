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

    let mut stmt = conn.prepare("SELECT id, title, description, start_date, due_date, status, created_at, updated_at FROM milestones ORDER BY updated_at DESC")
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
    for item in iter {
        if let Ok(i) = item {
            items.push(i);
        }
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

    conn.execute(
        "INSERT INTO milestones (title, description, start_date, due_date, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'planned', ?5, ?5)",
        rusqlite::params![title, description, start_date, due_date, now],
    ).map_err(|e| e.to_string())?;

    Ok(conn.last_insert_rowid() as i32)
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

    Ok(())
}

#[tauri::command]
pub fn delete_milestone(id: i32, state: State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // Unlink issues from this milestone
    conn.execute(
        "UPDATE issues SET milestone_id = NULL WHERE milestone_id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM milestones WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;

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
             LEFT JOIN issues i ON i.milestone_id = m.id
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
    for entry in iter {
        if let Ok(p) = entry {
            results.push(p);
        }
    }
    Ok(results)
}
