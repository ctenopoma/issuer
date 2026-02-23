use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize)]
pub struct ReactionEntry {
    pub reaction: String,
    pub count: i32,
    pub reacted: bool,
    pub users: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ReactionSummary {
    pub target_id: i32,
    pub reactions: Vec<ReactionEntry>,
}

#[tauri::command]
pub fn get_issue_reactions(
    issue_id: i32,
    current_user: String,
    state: State<'_, AppState>,
) -> Result<Vec<ReactionEntry>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT reaction, COUNT(*) AS cnt,
                    SUM(CASE WHEN reacted_by = ?1 THEN 1 ELSE 0 END) AS mine,
                    GROUP_CONCAT(reacted_by, ',') AS users
             FROM issue_reactions WHERE issue_id = ?2
             GROUP BY reaction",
        )
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map(rusqlite::params![current_user, issue_id], |row| {
            let users_str: String = row.get::<_, String>(3).unwrap_or_default();
            let users: Vec<String> = if users_str.is_empty() {
                vec![]
            } else {
                users_str.split(',').map(|s| s.to_string()).collect()
            };
            Ok(ReactionEntry {
                reaction: row.get(0)?,
                count: row.get(1)?,
                reacted: row.get::<_, i32>(2).unwrap_or(0) > 0,
                users,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for e in iter.flatten() {
        results.push(e);
    }
    Ok(results)
}

#[tauri::command]
pub fn toggle_issue_reaction(
    issue_id: i32,
    reaction: String,
    current_user: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM issue_reactions WHERE issue_id = ?1 AND reacted_by = ?2 AND reaction = ?3",
            rusqlite::params![issue_id, current_user, reaction],
            |row| row.get::<_, i32>(0),
        )
        .map_err(|e| e.to_string())?
        > 0;

    if exists {
        conn.execute(
            "DELETE FROM issue_reactions WHERE issue_id = ?1 AND reacted_by = ?2 AND reaction = ?3",
            rusqlite::params![issue_id, current_user, reaction],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let now = chrono::Local::now().to_rfc3339();
        conn.execute(
            "INSERT INTO issue_reactions (issue_id, reacted_by, reaction, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![issue_id, current_user, reaction, now],
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

#[tauri::command]
pub fn get_comment_reactions(
    issue_id: i32,
    current_user: String,
    state: State<'_, AppState>,
) -> Result<Vec<ReactionSummary>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT cr.comment_id, cr.reaction, COUNT(*) AS cnt,
                    SUM(CASE WHEN cr.reacted_by = ?1 THEN 1 ELSE 0 END) AS mine,
                    GROUP_CONCAT(cr.reacted_by, ',') AS users
             FROM comment_reactions cr
             JOIN comments c ON c.id = cr.comment_id
             WHERE c.issue_id = ?2
             GROUP BY cr.comment_id, cr.reaction",
        )
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map(rusqlite::params![current_user, issue_id], |row| {
            let users_str: String = row.get::<_, String>(4).unwrap_or_default();
            let users: Vec<String> = if users_str.is_empty() {
                vec![]
            } else {
                users_str.split(',').map(|s| s.to_string()).collect()
            };
            Ok((
                row.get::<_, i32>(0)?,
                ReactionEntry {
                    reaction: row.get(1)?,
                    count: row.get(2)?,
                    reacted: row.get::<_, i32>(3).unwrap_or(0) > 0,
                    users,
                },
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut map: std::collections::HashMap<i32, Vec<ReactionEntry>> =
        std::collections::HashMap::new();
    for (comment_id, reaction_entry) in iter.flatten() {
        map.entry(comment_id).or_default().push(reaction_entry);
    }

    let results: Vec<ReactionSummary> = map
        .into_iter()
        .map(|(target_id, reactions)| ReactionSummary {
            target_id,
            reactions,
        })
        .collect();
    Ok(results)
}

#[tauri::command]
pub fn toggle_comment_reaction(
    comment_id: i32,
    reaction: String,
    current_user: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM comment_reactions WHERE comment_id = ?1 AND reacted_by = ?2 AND reaction = ?3",
            rusqlite::params![comment_id, current_user, reaction],
            |row| row.get::<_, i32>(0),
        )
        .map_err(|e| e.to_string())?
        > 0;

    if exists {
        conn.execute(
            "DELETE FROM comment_reactions WHERE comment_id = ?1 AND reacted_by = ?2 AND reaction = ?3",
            rusqlite::params![comment_id, current_user, reaction],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let now = chrono::Local::now().to_rfc3339();
        conn.execute(
            "INSERT INTO comment_reactions (comment_id, reacted_by, reaction, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![comment_id, current_user, reaction, now],
        )
        .map_err(|e| e.to_string())?;
    }

    // Update parent issue timestamp
    let issue_id: i32 = conn
        .query_row(
            "SELECT issue_id FROM comments WHERE id = ?1",
            rusqlite::params![comment_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let now = chrono::Local::now().to_rfc3339();
    conn.execute(
        "UPDATE issues SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, issue_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
