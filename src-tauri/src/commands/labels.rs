use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize)]
pub struct Label {
    pub id: i32,
    pub name: String,
}

#[tauri::command]
pub fn list_all_labels(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT name FROM labels ORDER BY name")
        .map_err(|e| e.to_string())?;
    let iter = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut labels = Vec::new();
    for l in iter.flatten() {
        labels.push(l);
    }
    Ok(labels)
}

#[tauri::command]
pub fn get_issue_labels(issue_id: i32, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT l.name FROM labels l
             JOIN issue_labels il ON il.label_id = l.id
             WHERE il.issue_id = ?1
             ORDER BY l.name",
        )
        .map_err(|e| e.to_string())?;
    let iter = stmt
        .query_map(rusqlite::params![issue_id], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut labels = Vec::new();
    for l in iter.flatten() {
        labels.push(l);
    }
    Ok(labels)
}

/// Returns a map of issue_id -> [label_name, ...] for all given issues
#[tauri::command]
pub fn get_labels_map(
    issue_ids: Vec<i32>,
    state: State<'_, AppState>,
) -> Result<Vec<(i32, Vec<String>)>, String> {
    if issue_ids.is_empty() {
        return Ok(vec![]);
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let placeholders: Vec<String> = issue_ids.iter().map(|_| "?".to_string()).collect();
    let sql = format!(
        "SELECT il.issue_id, l.name FROM issue_labels il
         JOIN labels l ON l.id = il.label_id
         WHERE il.issue_id IN ({})
         ORDER BY il.issue_id, l.name",
        placeholders.join(",")
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let params: Vec<Box<dyn rusqlite::types::ToSql>> = issue_ids
        .iter()
        .map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>)
        .collect();
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let iter = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok((row.get::<_, i32>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut map: std::collections::HashMap<i32, Vec<String>> = std::collections::HashMap::new();
    for (issue_id, label) in iter.flatten() {
        map.entry(issue_id).or_default().push(label);
    }
    Ok(map.into_iter().collect())
}

#[tauri::command]
pub fn set_issue_labels(
    issue_id: i32,
    labels: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // Normalize labels
    let normalized: Vec<String> = labels
        .iter()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect::<std::collections::HashSet<String>>()
        .into_iter()
        .collect();

    // Ensure all labels exist
    let mut label_ids = Vec::new();
    for name in &normalized {
        conn.execute(
            "INSERT OR IGNORE INTO labels (name) VALUES (?1)",
            rusqlite::params![name],
        )
        .map_err(|e| e.to_string())?;
        let id: i32 = conn
            .query_row(
                "SELECT id FROM labels WHERE name = ?1",
                rusqlite::params![name],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        label_ids.push(id);
    }

    // Replace all labels for this issue
    conn.execute(
        "DELETE FROM issue_labels WHERE issue_id = ?1",
        rusqlite::params![issue_id],
    )
    .map_err(|e| e.to_string())?;

    for label_id in label_ids {
        conn.execute(
            "INSERT INTO issue_labels (issue_id, label_id) VALUES (?1, ?2)",
            rusqlite::params![issue_id, label_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Update issue timestamp
    let now = chrono::Local::now().to_rfc3339();
    conn.execute(
        "UPDATE issues SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, issue_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
