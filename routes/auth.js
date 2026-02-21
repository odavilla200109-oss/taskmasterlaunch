/**
 * routes/auth.js v2 — dark_mode preference
 */

const express  = require("express");
const { OAuth2Client } = require("google-auth-library");
const { randomUUID }   = require("crypto");
const { Users, Canvases } = require("../db");
const { signToken, requireAuth } = require("../middleware/auth");

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// POST /api/auth/google
router.post("/google", async (req, res) => {
  const { credential } = req.body;
  if (!credential || typeof credential !== "string")
    return res.status(400).json({ error: "credential obrigatório." });

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch (err) {
    return res.status(401).json({ error: "Token Google inválido." });
  }

  const { sub: googleId, name, email, picture: photo } = payload;
  if (!email) return res.status(400).json({ error: "Email não disponível." });

  try {
    let user = Users.findByGoogleId.get(googleId);
    if (!user) {
      const byEmail = Users.findByEmail.get(email);
      if (byEmail) {
        user = Users.update.get({ id: byEmail.id, name, photo: photo || null });
      } else {
        const newId = randomUUID();
        user = Users.create.get({ id: newId, google_id: googleId, name, email, photo: photo || null });
        Canvases.create.get({ id: randomUUID(), user_id: user.id, name: "Meu Workspace" });
      }
    } else {
      user = Users.update.get({ id: user.id, name, photo: photo || null });
    }

    return res.json({
      token: signToken(user),
      user: { id: user.id, name: user.name, email: user.email, photo: user.photo, darkMode: user.dark_mode === 1 },
    });
  } catch (err) {
    console.error("[Auth]", err);
    return res.status(500).json({ error: "Erro interno." });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  const { id, name, email, photo, dark_mode } = req.user;
  res.json({ id, name, email, photo, darkMode: dark_mode === 1 });
});

// PATCH /api/auth/me/darkmode
router.patch("/me/darkmode", requireAuth, (req, res) => {
  const dark = req.body.darkMode ? 1 : 0;
  Users.setDarkMode.run({ id: req.user.id, dark_mode: dark });
  res.json({ darkMode: dark === 1 });
});

// POST /api/auth/logout
router.post("/logout", requireAuth, (req, res) => {
  res.json({ message: "Logout realizado." });
});

module.exports = router;
