import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../prisma.js";
import { validerCorps, authRequis, exigeRole } from "../middlewares.js";
import { SchemaConnexionUtilisateur, SchemaInscriptionUtilisateur } from "../schemas.js";
const comptePublic = ({ motDePasse, ...compte }) => compte;
const JWT_SECRET = process.env.JWT_SECRET;

const router = Router();
// ---------- Auth ----------

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Creer un compte voyageur
 *     tags: [auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, motDePasse, nom, prenom]
 *             properties:
 *               email: { type: string, example: nouveau@mail.example }
 *               motDePasse: { type: string, example: "Motdepasse-2026!" }
 *               nom: { type: string, example: Dupont }
 *               prenom: { type: string, example: Marie }
 *               telephone: { type: string, example: "06 12 34 56 78" }
 *     responses:
 *       201: { description: Le compte cree (sans mot de passe) }
 *       400: { description: Corps invalide }
 *       409: { description: Email deja utilise }
 */
router.post(
  "/register",
  validerCorps(SchemaInscriptionUtilisateur),
  async (req, res, next) => {
    const { email, motDePasse, nom, prenom, telephone } = req.body;

    try {
      const compteExistant = await prisma.compte.findUnique({
        where: { email },
      });
      if (compteExistant) {
        return res.status(409).json({ erreur: "Email deja utilise" });
      }

      const compte = await prisma.compte.create({
        data: {
          email,
          motDePasse: await bcrypt.hash(motDePasse, 12),
          role: "voyageur",
          nom,
          prenom,
          telephone: telephone ?? null,
        },
      });
      res.status(201).json(comptePublic(compte));
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Se connecter et recevoir un jeton valable 24 h
 *     tags: [auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, motDePasse]
 *             properties:
 *               email: { type: string, example: a.morel@mail.example }
 *               motDePasse: { type: string, example: "Voyage-2026!" }
 *     responses:
 *       200: { description: Le jeton JWT et le compte }
 *       400: { description: Corps invalide }
 *       401: { description: Email ou mot de passe incorrect }
 */
router.post(
  "/login",
  validerCorps(SchemaConnexionUtilisateur),
  async (req, res, next) => {
    const { email, motDePasse } = req.body;

    try {
      const compte = await prisma.compte.findUnique({ where: { email } });
      const motDePasseValide = compte
        ? await bcrypt.compare(motDePasse, compte.motDePasse)
        : false;

      if (!compte || !motDePasseValide) {
        return res
          .status(401)
          .json({ erreur: "Email ou mot de passe incorrect" });
      }

      const token = jwt.sign(
        { userId: compte.id, hotelId: compte.hotelId, role: compte.role },
        JWT_SECRET,
        { subject: String(compte.id), expiresIn: "24h" },
      );
      res.json({ token, compte: comptePublic(compte) });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Se deconnecter (le front oublie le jeton)
 *     tags: [auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Deconnecte }
 *       401: { description: Jeton absent ou invalide }
 */
router.post("/logout", authRequis, (req, res) => res.status(204).end());


export default router;
