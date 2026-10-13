import { Router } from "express";
import prisma from "../prisma.js";

const router = Router();
// ---------- Hotels ----------

/**
 * @openapi
 * /hotels:
 *   get:
 *     summary: La liste des hotels
 *     tags: [hotels]
 *     responses:
 *       200: { description: Un tableau d'hotels }
 */
router.get("", async (req, res, next) => {
  try {
    res.json(await prisma.hotel.findMany());
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /hotels/{id}:
 *   get:
 *     summary: Le detail d'un hotel
 *     tags: [hotels]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: L'hotel }
 *       404: { description: Aucun hotel avec cet identifiant }
 */
router.get("/:id", async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(404).json({ erreur: "Hotel introuvable" });
  }
  try {
    const hotel = await prisma.hotel.findUnique({ where: { id } });
    if (!hotel) return res.status(404).json({ erreur: "Hotel introuvable" });
    res.json(hotel);
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /hotels/{id}/chambres:
 *   get:
 *     summary: Les chambres d'un hotel
 *     tags: [hotels]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Un tableau de chambres }
 *       404: { description: Aucun hotel avec cet identifiant }
 */
router.get("/:id/chambres", async (req, res, next) => {
  const hotelId = Number(req.params.id);
  if (!Number.isInteger(hotelId)) {
    return res.status(404).json({ erreur: "Hotel introuvable" });
  }
  try {
    const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel) return res.status(404).json({ erreur: "Hotel introuvable" });

    const chambres = await prisma.chambre.findMany({ where: { hotelId } });
    res.json(chambres);
  } catch (error) {
    next(error);
  }
});


export default router;
