import { Router } from "express";
import prisma from "../prisma.js";
import { validerCorps, validerQuery, authRequis, exigeRole } from "../middlewares.js";
import { SchemaRechercheChambre, SchemaCreationChambre, SchemaModificationChambre } from "../schemas.js";

const router = Router();
// ---------- Chambres : lectures publiques ----------

/**
 * @openapi
 * /chambres:
 *   get:
 *     summary: Recherche publique des chambres disponibles (criteres optionnels)
 *     tags: [chambres]
 *     parameters:
 *       - in: query
 *         name: hotel
 *         schema: { type: integer }
 *         description: Identifiant de l'hotel
 *       - in: query
 *         name: prix_max
 *         schema: { type: number }
 *         description: Prix maximum par nuit
 *       - in: query
 *         name: capacite
 *         schema: { type: integer }
 *         description: Nombre de personnes
 *       - in: query
 *         name: categorie
 *         schema: { type: string, enum: [simple, double, familiale, suite] }
 *       - in: query
 *         name: date_debut
 *         schema: { type: string, format: date }
 *         description: Arrivee souhaitee (AAAA-MM-JJ)
 *       - in: query
 *         name: date_fin
 *         schema: { type: string, format: date }
 *         description: Depart souhaite (AAAA-MM-JJ)
 *     responses:
 *       200: { description: Un tableau de chambres (vide si aucun resultat) }
 *       400: { description: Critere invalide }
 */
router.get(
  "",
  validerQuery(SchemaRechercheChambre),
  async (req, res, next) => {
    const { hotel, prix_max, capacite, categorie, date_debut, date_fin } =
      req.criteres;
    const filtre = {};

    if (hotel !== undefined) filtre.hotelId = hotel;
    if (prix_max !== undefined) filtre.prixNuit = { lte: prix_max };
    if (capacite !== undefined) filtre.capacite = { equals: capacite };
    if (categorie) filtre.categorie = categorie;

    try {
      if (date_debut && date_fin) {
        const debut = new Date(date_debut);
        const fin = new Date(date_fin);
        if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) {
          return res.status(400).json({ erreur: "Dates invalides" });
        }
        const reservations = await prisma.reservation.findMany({
          where: {
            statut: "confirmee",
            dateArrivee: { lt: fin },
            dateDepart: { gt: debut },
          },
          select: { chambreId: true },
        });
        filtre.id = { notIn: reservations.map((r) => r.chambreId) };
      }

      const chambres = await prisma.chambre.findMany({ where: filtre });
      res.json(chambres);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /chambres/{id}:
 *   get:
 *     summary: Le detail d'une chambre
 *     tags: [chambres]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: La chambre }
 *       404: { description: Aucune chambre avec cet identifiant }
 */
router.get("/:id", async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(404).json({ erreur: "Chambre introuvable" });
  }
  try {
    const chambre = await prisma.chambre.findUnique({ where: { id } });
    if (!chambre)
      return res.status(404).json({ erreur: "Chambre introuvable" });
    res.json(chambre);
  } catch (error) {
    next(error);
  }
});

// ---------- Chambres : ecritures protegees ----------

/**
 * @openapi
 * /chambres:
 *   post:
 *     summary: Creer une chambre dans son hotel (hotelier)
 *     tags: [chambres]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [numero, categorie, capacite, prixNuit, description]
 *             properties:
 *               numero: { type: string, example: "301" }
 *               categorie: { type: string, enum: [simple, double, familiale, suite], example: double }
 *               capacite: { type: integer, example: 2 }
 *               prixNuit: { type: integer, example: 99 }
 *               description: { type: string, example: Lit double }
 *               disponible: { type: boolean, example: true }
 *     responses:
 *       201: { description: La chambre creee }
 *       400: { description: Corps invalide }
 *       401: { description: Jeton absent ou invalide }
 *       403: { description: Reserve aux hoteliers }
 *       409: { description: Ce numero existe deja dans l'hotel }
 */
router.post(
  "",
  authRequis,
  exigeRole("hotelier"),
  validerCorps(SchemaCreationChambre),
  async (req, res, next) => {
    try {
      const doublon = await prisma.chambre.findFirst({
        where: { hotelId: req.user.hotelId, numero: req.body.numero },
      });
      if (doublon) {
        return res
          .status(409)
          .json({ erreur: "Ce numero existe deja dans l'hotel" });
      }

      
      // L'hôtel vient du jeton, jamais du corps
      const chambre = await prisma.chambre.create({
        data: {
          ...req.body,
          disponible: req.body.disponible ?? true,
          hotelId: req.user.hotelId,
        },
      });

      res.status(201).json(chambre);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /chambres/{id}:
 *   patch:
 *     summary: Modifier une chambre de son hotel (hotelier)
 *     tags: [chambres]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               numero: { type: string, example: "301" }
 *               categorie: { type: string, enum: [simple, double, familiale, suite] }
 *               capacite: { type: integer }
 *               prixNuit: { type: integer, example: 110 }
 *               description: { type: string }
 *               disponible: { type: boolean }
 *     responses:
 *       200: { description: La chambre modifiee }
 *       400: { description: Corps invalide }
 *       401: { description: Jeton absent ou invalide }
 *       403: { description: Cette chambre n'appartient pas a votre hotel }
 *       404: { description: Aucune chambre avec cet identifiant }
 */
router.patch(
  "/:id",
  authRequis,
  exigeRole("hotelier"),
  validerCorps(SchemaModificationChambre),
  async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(404).json({ erreur: "Chambre introuvable" });
    }
    try {
      const chambre = await prisma.chambre.findUnique({ where: { id } });
      if (!chambre)
        return res.status(404).json({ erreur: "Chambre introuvable" });
      if (chambre.hotelId !== req.user.hotelId) {
        return res.status(403).json({ erreur: "Acces refuse a cette chambre" });
      }
      res.json(await prisma.chambre.update({ where: { id }, data: req.body }));
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /chambres/{id}:
 *   delete:
 *     summary: Supprimer une chambre de son hotel (hotelier)
 *     tags: [chambres]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204: { description: Chambre supprimee }
 *       401: { description: Jeton absent ou invalide }
 *       403: { description: Cette chambre n'appartient pas a votre hotel }
 *       404: { description: Aucune chambre avec cet identifiant }
 */
router.delete(
  "/:id",
  authRequis,
  exigeRole("hotelier"),
  async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(404).json({ erreur: "Chambre introuvable" });
    }
    try {
      const chambre = await prisma.chambre.findUnique({ where: { id } });
      if (!chambre)
        return res.status(404).json({ erreur: "Chambre introuvable" });
      if (chambre.hotelId !== req.user.hotelId) {
        return res.status(403).json({ erreur: "Acces refuse a cette chambre" });
      }
      await prisma.chambre.delete({ where: { id } });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);


export default router;
