const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const databaseDir = path.join(__dirname, 'database');
fs.mkdirSync(databaseDir, { recursive: true });
const db = new DatabaseSync(path.join(databaseDir, 'either.db'));
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS question_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    set_id INTEGER NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (set_id) REFERENCES question_sets(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS games (
    code TEXT PRIMARY KEY,
    set_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'lobby',
    question_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (set_id) REFERENCES question_sets(id)
);
`);

const count = db.prepare('SELECT COUNT(*) AS count FROM question_sets').get().count;
if (count === 0) {
    const result = db.prepare('INSERT INTO question_sets (name) VALUES (?)').run('Demo Questions');
    const setId = Number(result.lastInsertRowid);
    const insert = db.prepare('INSERT INTO questions (set_id, option_a, option_b, sort_order) VALUES (?, ?, ?, ?)');
    insert.run(setId, 'Live in the mountains', 'Live at the beach', 1);
    insert.run(setId, 'Give up coffee', 'Give up desserts', 2);
    insert.run(setId, 'Travel to the past', 'Travel to the future', 3);
}

module.exports = db;
