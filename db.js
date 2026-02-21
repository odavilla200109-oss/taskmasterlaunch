/**
 * db.js — Banco de dados TaskMaster v2
 * Novidades: canvas_shares, due_date nos nós, dark_mode nos usuários
 */

const Database = require("better-sqlite3");
const path     = require("path");
const fs       = require("fs");

const DB_PATH = process.env.DB_PATH || "./data/taskmaster.db";
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

// ─── Schema ───────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    google_id  TEXT UNIQUE,
    name       TEXT NOT NULL,
    email      TEXT UNIQUE NOT NULL,
    photo      TEXT,
    dark_mode  INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS canvases (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL DEFAULT 'Meu Canvas',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS nodes (
    id         TEXT PRIMARY KEY,
    canvas_id  TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    title      TEXT NOT NULL DEFAULT '',
    x          REAL NOT NULL DEFAULT 0,
    y          REAL NOT NULL DEFAULT 0,
    priority   TEXT NOT NULL DEFAULT 'none' CHECK(priority IN ('none','low','medium','high')),
    completed  INTEGER NOT NULL DEFAULT 0,
    parent_id  TEXT REFERENCES nodes(id) ON DELETE SET NULL,
    due_date   TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS canvas_shares (
    id         TEXT PRIMARY KEY,
    canvas_id  TEXT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    token      TEXT UNIQUE NOT NULL,
    mode       TEXT NOT NULL DEFAULT 'view' CHECK(mode IN ('view','edit')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_canvases_user   ON canvases(user_id);
  CREATE INDEX IF NOT EXISTS idx_nodes_canvas    ON nodes(canvas_id);
  CREATE INDEX IF NOT EXISTS idx_nodes_parent    ON nodes(parent_id);
  CREATE INDEX IF NOT EXISTS idx_shares_token    ON canvas_shares(token);
  CREATE INDEX IF NOT EXISTS idx_shares_canvas   ON canvas_shares(canvas_id);
`);

// Migrações seguras (adiciona colunas se não existirem)
const migrate = (sql) => { try { db.exec(sql); } catch {} };
migrate("ALTER TABLE users ADD COLUMN dark_mode INTEGER NOT NULL DEFAULT 0");
migrate("ALTER TABLE nodes ADD COLUMN due_date TEXT");

// ─── Users ────────────────────────────────────────────
const Users = {
  findByGoogleId: db.prepare("SELECT * FROM users WHERE google_id = ?"),
  findById:       db.prepare("SELECT * FROM users WHERE id = ?"),
  findByEmail:    db.prepare("SELECT * FROM users WHERE email = ?"),
  create: db.prepare(`
    INSERT INTO users (id, google_id, name, email, photo)
    VALUES (@id, @google_id, @name, @email, @photo) RETURNING *
  `),
  update: db.prepare(`
    UPDATE users SET name=@name, photo=@photo, updated_at=datetime('now')
    WHERE id=@id RETURNING *
  `),
  setDarkMode: db.prepare(`
    UPDATE users SET dark_mode=@dark_mode WHERE id=@id
  `),
};

// ─── Canvases ─────────────────────────────────────────
const Canvases = {
  findByUser:  db.prepare("SELECT * FROM canvases WHERE user_id=? ORDER BY updated_at DESC"),
  findById:    db.prepare("SELECT * FROM canvases WHERE id=? AND user_id=?"),
  findByIdAny: db.prepare("SELECT * FROM canvases WHERE id=?"),
  create: db.prepare(`
    INSERT INTO canvases (id, user_id, name) VALUES (@id, @user_id, @name) RETURNING *
  `),
  rename: db.prepare(`
    UPDATE canvases SET name=@name, updated_at=datetime('now') WHERE id=@id AND user_id=@user_id RETURNING *
  `),
  touch:  db.prepare("UPDATE canvases SET updated_at=datetime('now') WHERE id=?"),
  delete: db.prepare("DELETE FROM canvases WHERE id=? AND user_id=?"),
};

// ─── Nodes ────────────────────────────────────────────
const Nodes = {
  findByCanvas:   db.prepare("SELECT * FROM nodes WHERE canvas_id=? ORDER BY created_at ASC"),
  deleteByCanvas: db.prepare("DELETE FROM nodes WHERE canvas_id=?"),
  upsert: db.prepare(`
    INSERT INTO nodes (id, canvas_id, title, x, y, priority, completed, parent_id, due_date)
    VALUES (@id, @canvas_id, @title, @x, @y, @priority, @completed, @parent_id, @due_date)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, x=excluded.x, y=excluded.y,
      priority=excluded.priority, completed=excluded.completed,
      parent_id=excluded.parent_id, due_date=excluded.due_date,
      updated_at=datetime('now')
  `),
  replaceAll: db.transaction((canvasId, nodes) => {
    Nodes.deleteByCanvas.run(canvasId);
    for (const n of nodes) {
      Nodes.upsert.run({
        id:        n.id,
        canvas_id: canvasId,
        title:     n.title    || "",
        x:         n.x        || 0,
        y:         n.y        || 0,
        priority:  n.priority || "none",
        completed: n.completed ? 1 : 0,
        parent_id: n.parentId || null,
        due_date:  n.dueDate  || null,
      });
    }
  }),
};

// ─── Shares ───────────────────────────────────────────
const Shares = {
  findByCanvas: db.prepare("SELECT * FROM canvas_shares WHERE canvas_id=?"),
  findByToken:  db.prepare("SELECT * FROM canvas_shares WHERE token=?"),
  create: db.prepare(`
    INSERT INTO canvas_shares (id, canvas_id, token, mode) VALUES (@id, @canvas_id, @token, @mode) RETURNING *
  `),
  delete: db.prepare("DELETE FROM canvas_shares WHERE id=? AND canvas_id=?"),
  deleteAll: db.prepare("DELETE FROM canvas_shares WHERE canvas_id=?"),
};

module.exports = { db, Users, Canvases, Nodes, Shares };
