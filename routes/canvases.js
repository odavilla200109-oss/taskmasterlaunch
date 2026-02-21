/**
 * routes/canvases.js v2
 * Novidades: múltiplos canvases, compartilhamento, due_date
 */

const express        = require("express");
const { randomUUID, randomBytes } = require("crypto");
const { Canvases, Nodes, Shares } = require("../db");
const { requireAuth }             = require("../middleware/auth");

const router = express.Router();

// ── Helpers ───────────────────────────────────────────
function formatNodes(rows) {
  return rows.map((r) => ({
    id:        r.id,
    title:     r.title,
    x:         r.x,
    y:         r.y,
    priority:  r.priority,
    completed: r.completed === 1,
    parentId:  r.parent_id || null,
    dueDate:   r.due_date  || null,
  }));
}

function requireCanvas(req, res, next) {
  const canvas = Canvases.findById.get(req.params.id, req.user.id);
  if (!canvas) return res.status(404).json({ error: "Canvas não encontrado." });
  req.canvas = canvas;
  next();
}

// ── Rotas autenticadas ────────────────────────────────
router.use(requireAuth);

// GET /api/canvases — lista todos os canvases do usuário
router.get("/", (req, res) => {
  const canvases = Canvases.findByUser.all(req.user.id);
  res.json(canvases);
});

// POST /api/canvases — cria novo canvas
router.post("/", (req, res) => {
  const name   = (req.body.name || "Novo Canvas").slice(0, 100);
  const canvas = Canvases.create.get({ id: randomUUID(), user_id: req.user.id, name });
  res.status(201).json(canvas);
});

// PATCH /api/canvases/:id — renomear canvas
router.patch("/:id", requireCanvas, (req, res) => {
  const name = (req.body.name || "").slice(0, 100);
  if (!name) return res.status(400).json({ error: "Nome obrigatório." });
  const updated = Canvases.rename.get({ id: req.params.id, user_id: req.user.id, name });
  res.json(updated);
});

// DELETE /api/canvases/:id — exclui canvas
router.delete("/:id", requireCanvas, (req, res) => {
  Canvases.delete.run(req.params.id, req.user.id);
  res.json({ message: "Canvas excluído." });
});

// GET /api/canvases/:id/nodes
router.get("/:id/nodes", requireCanvas, (req, res) => {
  res.json(formatNodes(Nodes.findByCanvas.all(req.canvas.id)));
});

// PUT /api/canvases/:id/nodes
router.put("/:id/nodes", requireCanvas, (req, res) => {
  const { nodes } = req.body;
  if (!Array.isArray(nodes)) return res.status(400).json({ error: "nodes deve ser array." });
  for (const n of nodes) {
    if (typeof n.id !== "string" || !n.id) return res.status(400).json({ error: "id inválido." });
    if (!["none","low","medium","high"].includes(n.priority)) return res.status(400).json({ error: "priority inválida." });
  }
  Nodes.replaceAll(req.canvas.id, nodes);
  Canvases.touch.run(req.canvas.id);
  res.json({ saved: nodes.length });
});

// ── Compartilhamento ──────────────────────────────────

// GET /api/canvases/:id/shares — lista links de compartilhamento
router.get("/:id/shares", requireCanvas, (req, res) => {
  const shares = Shares.findByCanvas.all(req.canvas.id);
  res.json(shares);
});

// POST /api/canvases/:id/shares — cria link de compartilhamento
router.post("/:id/shares", requireCanvas, (req, res) => {
  const mode  = req.body.mode === "edit" ? "edit" : "view";
  const token = randomBytes(20).toString("hex");
  const share = Shares.create.get({ id: randomUUID(), canvas_id: req.canvas.id, token, mode });
  res.status(201).json(share);
});

// DELETE /api/canvases/:id/shares/:shareId — revoga link
router.delete("/:id/shares/:shareId", requireCanvas, (req, res) => {
  Shares.delete.run(req.params.shareId, req.canvas.id);
  res.json({ message: "Link revogado." });
});

// ── Acesso público via token de compartilhamento ──────

// GET /api/shared/:token — lê canvas compartilhado (sem auth)
router.get("/shared/:token", (req, res) => {
  const share = Shares.findByToken.get(req.params.token);
  if (!share) return res.status(404).json({ error: "Link inválido ou expirado." });
  const canvas = Canvases.findByIdAny.get(share.canvas_id);
  if (!canvas) return res.status(404).json({ error: "Canvas não encontrado." });
  const nodes = formatNodes(Nodes.findByCanvas.all(canvas.id));
  res.json({ canvas, nodes, mode: share.mode });
});

// PUT /api/shared/:token/nodes — salva nós via link de edição
router.put("/shared/:token/nodes", (req, res) => {
  const share = Shares.findByToken.get(req.params.token);
  if (!share) return res.status(404).json({ error: "Link inválido." });
  if (share.mode !== "edit") return res.status(403).json({ error: "Link somente leitura." });
  const { nodes } = req.body;
  if (!Array.isArray(nodes)) return res.status(400).json({ error: "nodes deve ser array." });
  Nodes.replaceAll(share.canvas_id, nodes);
  Canvases.touch.run(share.canvas_id);
  res.json({ saved: nodes.length });
});

module.exports = router;
