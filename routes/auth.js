/**
 * routes/auth.js — Autenticação via Google OAuth (ID Token)
 *
 * Fluxo:
 *   1. Frontend faz login com Google usando @react-oauth/google ou GIS
 *   2. Google retorna um `credential` (ID Token JWT)
 *   3. Frontend envia esse token para POST /api/auth/google
 *   4. Backend verifica com Google, cria/atualiza usuário, retorna JWT próprio
 *   5. Frontend usa o JWT próprio em todas as chamadas seguintes
 */

const express  = require("express");
const { OAuth2Client } = require("google-auth-library");
const { randomUUID }   = require("crypto");
const { Users, Canvases } = require("../db");
const { signToken }       = require("../middleware/auth");

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ──────────────────────────────────────────────────────
//  POST /api/auth/google
//  Body: { credential: "<Google ID Token>" }
//  Response: { token, user }
// ──────────────────────────────────────────────────────
router.post("/google", async (req, res) => {
  const { credential } = req.body;

  if (!credential || typeof credential !== "string") {
    return res.status(400).json({ error: "credential obrigatório." });
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken:  credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    console.error("[Auth] Falha ao verificar Google token:", err.message);
    return res.status(401).json({ error: "Token Google inválido." });
  }

  const { sub: googleId, name, email, picture: photo } = payload;

  if (!email) {
    return res.status(400).json({ error: "Email não disponível no token." });
  }

  try {
    // Busca usuário existente ou cria um novo
    let user = Users.findByGoogleId.get(googleId);

    if (!user) {
      // Verifica se já existe com esse email (conta criada sem Google antes)
      const byEmail = Users.findByEmail.get(email);
      if (byEmail) {
        // Vincula conta Google ao usuário existente
        user = Users.update.get({ id: byEmail.id, name, photo: photo || null });
      } else {
        // Cria novo usuário
        const newId = randomUUID();
        user = Users.create.get({ id: newId, google_id: googleId, name, email, photo: photo || null });

        // Cria canvas padrão para novos usuários
        Canvases.create.get({
          id:      randomUUID(),
          user_id: user.id,
          name:    "Meu Workspace",
        });
      }
    } else {
      // Atualiza nome/foto caso tenham mudado
      user = Users.update.get({ id: user.id, name, photo: photo || null });
    }

    const token = signToken(user);

    return res.json({
      token,
      user: {
        id:    user.id,
        name:  user.name,
        email: user.email,
        photo: user.photo,
      },
    });
  } catch (err) {
    console.error("[Auth] Erro interno:", err);
    return res.status(500).json({ error: "Erro interno ao autenticar." });
  }
});

// ──────────────────────────────────────────────────────
//  GET /api/auth/me
//  Retorna dados do usuário autenticado (valida token)
// ──────────────────────────────────────────────────────
const { requireAuth } = require("../middleware/auth");

router.get("/me", requireAuth, (req, res) => {
  const { id, name, email, photo } = req.user;
  res.json({ id, name, email, photo });
});

// ──────────────────────────────────────────────────────
//  POST /api/auth/logout
//  (Stateless JWT — apenas confirmação no cliente)
//  Para invalidação real, implemente uma blacklist com Redis
// ──────────────────────────────────────────────────────
router.post("/logout", requireAuth, (req, res) => {
  // TODO (opcional): adicionar token à blacklist Redis
  // await redis.set(`bl:${token}`, "1", "EX", ttlSegundos);
  res.json({ message: "Logout realizado." });
});

module.exports = router;
