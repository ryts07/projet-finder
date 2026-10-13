import { Router } from "express";
import prisma from "../prisma.js";
import { validerCorps, authRequis, exigeRole } from "../middlewares.js";
import { SchemaModificationVoyageur } from "../schemas.js";

const router = Router();
// ---------- Profil voyageur ----------

/**
 * @openapi
 * /voyageurs/me:
 *   get:
 *     summary: Le profil du voyageur connecte
 *     tags: [voyageurs]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Nom prenom et telephone du voyageur }
 *       401: { description: Jeton absent ou invalide }
 *       403: { description: Reserve aux voyageurs }
 *       404: { description: Voyageur introuvable }
 */
router.get(
  "/me",
  authRequis,
  exigeRole("voyageur"),
  async (req, res, next) => {
    try {
      const compte = await prisma.compte.findUnique({
        where: { id: req.user.userId },
        select: { nom: true, prenom: true, telephone: true },
      });
      if (!compte)
        return res.status(404).json({ erreur: "Voyageur introuvable" });
      res.json(compte);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /voyageurs/me:
 *   patch:
 *     summary: Modifier le profil du voyageur connecte
 *     tags: [voyageurs]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom: { type: string, example: Morel }
 *               prenom: { type: string, example: Anais }
 *               telephone: { type: string, example: "06 99 88 77 66" }
 *     responses:
 *       200: { description: Le profil modifie }
 *       400: { description: Corps invalide }
 *       401: { description: Jeton absent ou invalide }
 *       403: { description: Reserve aux voyageurs }
 */
router.patch(
  "/me",
  authRequis,
  exigeRole("voyageur"),
  validerCorps(SchemaModificationVoyageur),
  async (req, res, next) => {
    try {
      const compte = await prisma.compte.update({
        where: { id: req.user.userId },
        data: req.body,
        select: { nom: true, prenom: true, telephone: true },
      });
      res.json(compte);
    } catch (error) {
      next(error);
    }
  },
);


export default router;
