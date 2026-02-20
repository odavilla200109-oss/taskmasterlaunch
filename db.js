/**
 * ══════════════════════════════════════════
 *  db.js — Camada de banco de dados (SQLite)
 *
 *  Para migrar para Postgres:
 *  1. npm install pg
 *  2. Substitua better-sqlite3 por pg
 *  3. Ajuste a sintaxe das queries (? → $1)
 *  4. Adicione DATABASE_URL no .env
 * ══════════════════════════════════════════
 */

const Database = require("better-sqlite3");
const path     = require("path");
const fs       = require("fs");

const DB_PATH = process.env.DB_PATH || "./data/taskmaster.db";

// Garante que o diretório existe
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("synchronous = NORMAL");

// ─── Schema ────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    google_id  TEXT UNIQUE,
    name       TEXT NOT NULL,
    email      TEXT UNIQUE NOT NULL,
    photo      TEXT,
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_canvases_user   ON canvases(user_id);
  CREATE INDEX IF NOT EXISTS idx_nodes_canvas    ON nodes(canvas_id);
  CREATE INDEX IF NOT EXISTS idx_nodes_parent    ON nodes(parent_id);
`);

// ─── Helpers ───────────────────────────────────────────
const Users = {
  findByGoogleId: db.prepare("SELECT * FROM users WHERE google_id = ?"),
  findById:       db.prepare("SELECT * FROM users WHERE id = ?"),
  findByEmail:    db.prepare("SELECT * FROM users WHERE email = ?"),

  create: db.prepare(`
    INSERT INTO users (id, google_id, name, email, photo)
    VALUES (@id, @google_id, @name, @email, @photo)
    RETURNING *
  `),

  update: db.prepare(`
    UPDATE users SET name=@name, photo=@photo, updated_at=datetime('now')
    WHERE id=@id RETURNING *
  `),
};

const Canvases = {
  findByUser: db.prepare("SELECT * FROM canvases WHERE user_id = ? ORDER BY updated_at DESC"),

  findById: db.prepare("SELECT * FROM canvases WHERE id = ? AND user_id = ?"),

  create: db.prepare(`
    INSERT INTO canvases (id, user_id, name) VALUES (@id, @user_id, @name)
    RETURNING *
  `),

  touch: db.prepare(`
    UPDATE canvases SET updated_at=datetime('now') WHERE id=?
  `),

  delete: db.prepare("DELETE FROM canvases WHERE id=? AND user_id=?"),
};

const Nodes = {
  findByCanvas: db.prepare(`
    SELECT * FROM nodes WHERE canvas_id=? ORDER BY created_at ASC
  `),

  upsert: db.prepare(`
    INSERT INTO nodes (id, canvas_id, title, x, y, priority, completed, parent_id)
    VALUES (@id, @canvas_id, @title, @x, @y, @priority, @completed, @parent_id)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, x=excluded.x, y=excluded.y,
      priority=excluded.priority, completed=excluded.completed,
      parent_id=excluded.parent_id, updated_at=datetime('now')
  `),

  deleteByCanvas: db.prepare("DELETE FROM nodes WHERE canvas_id=?"),

  // Usado para sincronização em lote
  replaceAll: db.transaction((canvasId, nodes) => {
    Nodes.deleteByCanvas.run(canvasId);
    for (const node of nodes) {
      Nodes.upsert.run({
        id:        node.id,
        canvas_id: canvasId,
        title:     node.title     || "",
        x:         node.x         || 0,
        y:         node.y         || 0,
        priority:  node.priority  || "none",
        completed: node.completed ? 1 : 0,
        parent_id: node.parentId  || null,
      });
    }
  }),
};

module.exports = { db, Users, Canvases, Nodes };
