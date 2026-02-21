use crate::config::AppConfig;
use rusqlite::Connection;
use std::path::Path;

pub fn establish_connection<P: AsRef<Path>>(db_path: P) -> rusqlite::Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;",
    )?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS issues (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            title      TEXT    NOT NULL,
            body       TEXT    DEFAULT '',
            status     TEXT    NOT NULL DEFAULT 'OPEN',
            created_by TEXT    NOT NULL,
            assignee   TEXT    DEFAULT '',
            created_at TEXT    NOT NULL,
            updated_at TEXT    NOT NULL,
            milestone_id INTEGER
        );
        CREATE TABLE IF NOT EXISTS comments (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_id   INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
            body       TEXT    NOT NULL,
            created_by TEXT    NOT NULL,
            created_at TEXT    NOT NULL
        );
        CREATE TABLE IF NOT EXISTS milestones (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            description TEXT DEFAULT '',
            start_date  TEXT,
            due_date    TEXT,
            status      TEXT NOT NULL DEFAULT 'planned',
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS labels (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        );
        CREATE TABLE IF NOT EXISTS issue_labels (
            issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
            label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
            PRIMARY KEY (issue_id, label_id)
        );
        CREATE TABLE IF NOT EXISTS issue_reactions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_id    INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
            reacted_by  TEXT    NOT NULL,
            reaction    TEXT    NOT NULL,
            created_at  TEXT    NOT NULL,
            UNIQUE(issue_id, reacted_by, reaction)
        );
        CREATE TABLE IF NOT EXISTS comment_reactions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            comment_id  INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
            reacted_by  TEXT    NOT NULL,
            reaction    TEXT    NOT NULL,
            created_at  TEXT    NOT NULL,
            UNIQUE(comment_id, reacted_by, reaction)
        );
        CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
        CREATE INDEX IF NOT EXISTS idx_issues_created_at ON issues(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_comments_issue_id ON comments(issue_id);
        CREATE INDEX IF NOT EXISTS idx_issue_reactions_issue_id ON issue_reactions(issue_id);
        CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id ON comment_reactions(comment_id);
        CREATE INDEX IF NOT EXISTS idx_issue_labels_issue_id ON issue_labels(issue_id);
        CREATE INDEX IF NOT EXISTS idx_issue_labels_label_id ON issue_labels(label_id);
        CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);
        CREATE INDEX IF NOT EXISTS idx_milestones_due_date ON milestones(due_date);"
    )?;

    // Add milestone_id column if missing (migration for older databases)
    let columns: Vec<String> = conn
        .prepare("PRAGMA table_info(issues)")
        .map_err(|e| e)?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e)?
        .filter_map(|r| r.ok())
        .collect();
    if !columns.iter().any(|c| c == "milestone_id") {
        conn.execute_batch(
            "ALTER TABLE issues ADD COLUMN milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL"
        )?;
    }
    let _ = conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_issues_milestone_id ON issues(milestone_id)",
    );

    Ok(conn)
}

pub fn sync_db_back(config: &AppConfig) {
    if !config.is_local_relaunch || !config.db_path.exists() {
        return;
    }

    if let Ok(conn) = Connection::open(&config.db_path) {
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    }

    let db_files = ["data.db", "data.db-wal", "data.db-shm"];
    for file in db_files {
        let src = config.local_dir.join(file);
        let dst = config.original_dir.join(file);
        if src.exists() {
            let _ = std::fs::copy(&src, &dst);
            let _ = std::fs::remove_file(&src); // cleanup local db file after syncing back
        }
    }
}
