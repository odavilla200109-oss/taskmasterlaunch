/**
 * routes/canvases.js — CRUD de canvases e nós
 *
 * Todas as rotas exigem autenticação (JWT).
 *
 * Endpoints:
 *   GET    /api/canvases              → lista canvases do usuário
 *   POST   /api/canvases              → cria novo canvas
 *   DELETE /api/canvases/:id          → exclui canvas
 *
 *   GET    /api/canvases/:id/nodes    → carrega nós do canvas
 *   PUT    /api/canvases/:id/nodes    → salva/sincroniza nós (replace all)
 */

const express  = require("express");
const { randomUUID } = require("crypto");
const { Canvases, Nodes } = require("../db");
const { requireAuth }     = require("../middleware/auth");

const router = express.Router();

// Todas as rotas protegidas
router.use(requireAuth);

// ──────────────────────────────────────────────────────
//  GET /api/canvases
// ──────────────────────────────────────────────────────
router.get("/", (req, res) => {
  const canvases = Canvases.findByUser.all(req.user.id);
  res.json(canvases);
});

// ──────────────────────────────────────────────────────
//  POST /api/canvases
//  Body: { name?: string }
// ──────────────────────────────────────────────────────
router.post("/", (req, res) => {
  const name   = (req.body.name || "Novo Canvas").slice(0, 100);
  const canvas = Canvases.create.get({
    id:      randomUUID(),
    user_id: req.user.id,
    name,
  });
  res.status(201).json(canvas);
});

// ──────────────────────────────────────────────────────
//  DELETE /api/canvases/:id
// ──────────────────────────────────────────────────────
router.delete("/:id", (req, res) => {
  const result = Canvases.delete.run(req.params.id, req.user.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Canvas não encontrado." });
  }
  res.json({ message: "Canvas excluído." });
});

// ──────────────────────────────────────────────────────
//  Middleware: garante que o canvas pertence ao usuário
// ──────────────────────────────────────────────────────
function requireCanvas(req, res, next) {
  const canvas = Canvases.findById.get(req.params.id, req.user.id);
  if (!canvas) {
    return res.status(404).json({ error: "Canvas não encontrado." });
  }
  req.canvas = canvas;
  next();
}

// ──────────────────────────────────────────────────────
//  GET /api/canvases/:id/nodes
//  Retorna todos os nós do canvas, formatados para o frontend
// ──────────────────────────────────────────────────────
router.get("/:id/nodes", requireCanvas, (req, res) => {
  const rows = Nodes.findByCanvas.all(req.canvas.id);

  // Converte formato do banco → formato do frontend
  const nodes = rows.map((row) => ({
    id:        row.id,
    title:     row.title,
    x:         row.x,
    y:         row.y,
    priority:  row.priority,
    completed: row.completed === 1,
    parentId:  row.parent_id || null,
  }));

  res.json(nodes);
});

// ──────────────────────────────────────────────────────
//  PUT /api/canvases/:id/nodes
//  Body: { nodes: Node[] }
//  Sincronização completa (replace all) com transação atômica.
//  O frontend envia o estado inteiro; o backend substitui tudo.
// ──────────────────────────────────────────────────────
router.put("/:id/nodes", requireCanvas, (req, res) => {
  const { nodes } = req.body;

  if (!Array.isArray(nodes)) {
    return res.status(400).json({ error: "nodes deve ser um array." });
  }

  // Validação básica de cada nó
  for (const n of nodes) {
    if (typeof n.id !== "string" || !n.id) {
      return res.status(400).json({ error: "Cada nó precisa de um id string." });
    }
    if (!["none","low","medium","high"].includes(n.priority)) {
      return res.status(400).json({ error: `Prioridade inválida no nó ${n.id}.` });
    }
  }

  // Substitui todos os nós em transação atômica
  Nodes.replaceAll(req.canvas.id, nodes);
  Canvases.touch.run(req.canvas.id);

  res.json({ saved: nodes.length });
});

module.exports = router;
