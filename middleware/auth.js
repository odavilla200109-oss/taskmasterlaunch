/**
 * middleware/auth.js — Verificação de JWT
 */

const jwt   = require("jsonwebtoken");
const { Users } = require("../db");

/**
 * Middleware: exige token JWT válido no header Authorization.
 * Injeta `req.user` com os dados do usuário autenticado.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token não fornecido." });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Valida que o usuário ainda existe no banco
    const user = Users.findById.get(payload.sub);
    if (!user) {
      return res.status(401).json({ error: "Usuário não encontrado." });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expirado." });
    }
    return res.status(401).json({ error: "Token inválido." });
  }
}

/**
 * Gera um JWT para o usuário dado.
 */
function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

module.exports = { requireAuth, signToken };
