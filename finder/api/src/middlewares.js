import dotenv from "dotenv";
import path from "node:path";
import jwt from "jsonwebtoken";
dotenv.config({ path: path.join(import.meta.dirname, "..", ".env") });
const JWT_SECRET = process.env.JWT_SECRET;
// ---------- Middlewares ----------
export const validerCorps = (schema) => (req, res, next) => {
  const resultat = schema.safeParse(req.body);
  if (!resultat.success) {
    return res.status(400).json({
      erreur: "Corps de requete invalide",
      erreurs: resultat.error.issues,
    });
  }
  req.body = resultat.data;
  next();
};

export const validerQuery = (schema) => (req, res, next) => {
  const resultat = schema.safeParse(req.query);
  if (!resultat.success) {
    return res.status(400).json({
      erreur: "Parametres de recherche invalides",
      erreurs: resultat.error.issues,
    });
  }
  req.criteres = resultat.data;
  next();
};

export const authRequis = (req, res, next) => {
  const authorization = req.headers.authorization;
  const [type, token] = authorization?.split(" ") ?? [];

  if (type !== "Bearer" || !token || !JWT_SECRET) {
    return res.status(401).json({ erreur: "Authentification requise" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      userId: Number(payload.userId ?? payload.sub),
      hotelId: payload.hotelId ?? null,
      role: payload.role,
    };
    next();
  } catch {
    res.status(401).json({ erreur: "Jeton invalide ou expire" });
  }
};

export const exigeRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user?.userId || !roles.includes(req.user.role)) {
      return res.status(403).json({ erreur: "Role non autorise" });
    }
    next();
  };


