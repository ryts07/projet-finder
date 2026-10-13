import { Router } from "express";
import prisma from "../prisma.js";
import { validerCorps, authRequis, exigeRole } from "../middlewares.js";
import { SchemaCreationReservation, SchemaConfirmationReservation } from "../schemas.js";
// ---------- Table des transitions de statut d'une reservation ----------
const TRANSITIONS_AUTORISEES = {
  en_attente: ["confirmee", "refusee", "annulee"],
  confirmee: ["annulee"],
  refusee: [],
  annulee: [],
};

function transitionValide(statutActuel, statutVoulu) {
  return (TRANSITIONS_AUTORISEES[statutActuel] || []).includes(statutVoulu);
}



const router = Router();
// ---------- Reservations ----------

/**
 * @openapi
 * /reservations:
 *   post:
 *     summary: Reserver une chambre (voyageur) - statut en_attente
 *     tags: [reservations]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [chambreId, dateArrivee, dateDepart, nbPersonnes]
 *             properties:
 *               chambreId: { type: integer, example: 9 }
 *               dateArrivee: { type: string, format: date-time, example: "2027-06-01T00:00:00.000Z" }
 *               dateDepart: { type: string, format: date-time, example: "2027-06-03T00:00:00.000Z" }
 *               nbPersonnes: { type: integer, example: 2 }
 *               demandeSpeciale: { type: string, example: Chambre calme }
 *     responses:
 *       201: { description: La reservation creee au statut en_attente }
 *       400: { description: Corps invalide }
 *       401: { description: Jeton absent ou invalide }
 *       403: { description: Reserve aux voyageurs }
 */
router.post(
  "",
  authRequis,
  exigeRole("voyageur"),
  validerCorps(SchemaCreationReservation),
  async (req, res, next) => {
    const { chambreId, dateArrivee, dateDepart, nbPersonnes, demandeSpeciale } =
      req.body;

    try {
      const reservation = await prisma.reservation.create({
        data: {
          chambreId,
          voyageurId: req.user.userId, // le voyageur vient du jeton, jamais du corps
          dateArrivee: new Date(dateArrivee),
          dateDepart: new Date(dateDepart),
          nbPersonnes,
          statut: "en_attente", // toujours fixe par le serveur a la creation
          demandeSpeciale: demandeSpeciale ?? "",
        },
      });
      res.status(201).json(reservation);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /reservations/mine:
 *   get:
 *     summary: Les reservations du voyageur connecte (annulees comprises)
 *     tags: [reservations]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Un tableau de reservations avec leur chambre }
 *       401: { description: Jeton absent ou invalide }
 *       403: { description: Reserve aux voyageurs }
 */
router.get(
  "/mine",
  authRequis,
  exigeRole("voyageur"),
  async (req, res, next) => {
    try {
      const reservations = await prisma.reservation.findMany({
        where: { voyageurId: req.user.userId },
        include: { chambre: true },
      });
      res.json(reservations);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /reservations/received:
 *   get:
 *     summary: Les reservations recues par l'hotel de l'hotelier connecte
 *     tags: [reservations]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Un tableau de reservations avec leur chambre }
 *       401: { description: Jeton absent ou invalide }
 *       403: { description: Reserve aux hoteliers }
 */
router.get(
  "/received",
  authRequis,
  exigeRole("hotelier"),
  async (req, res, next) => {
    try {
      const reservations = await prisma.reservation.findMany({
        where: { chambre: { hotelId: req.user.hotelId } },
        include: { chambre: true },
      });
      res.json(reservations);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /reservations/{id}:
 *   patch:
 *     summary: Confirmer ou refuser une reservation de son hotel (hotelier)
 *     tags: [reservations]
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
 *             required: [statut]
 *             properties:
 *               statut: { type: string, enum: [confirmee, refusee], example: confirmee }
 *     responses:
 *       200: { description: La reservation mise a jour }
 *       400: { description: Corps invalide }
 *       401: { description: Jeton absent ou invalide }
 *       403: { description: Cette reservation n'est pas celle de votre hotel }
 *       404: { description: Aucune reservation avec cet identifiant }
 *       409: { description: Passage de statut interdit depuis le statut actuel }
 */
router.patch(
  "/:id",
  authRequis,
  exigeRole("hotelier"),
  validerCorps(SchemaConfirmationReservation),
  async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(404).json({ erreur: "Reservation introuvable" });
    }
    try {
      const reservation = await prisma.reservation.findUnique({
        where: { id },
        include: { chambre: true },
      });

      // 404 d'abord, puis 403 (propriete), puis 409 (transition)
      if (!reservation) {
        return res.status(404).json({ erreur: "Reservation introuvable" });
      }
      if (reservation.chambre.hotelId !== req.user.hotelId) {
        return res
          .status(403)
          .json({ erreur: "Acces refuse a cette reservation" });
      }
      if (!transitionValide(reservation.statut, req.body.statut)) {
        return res.status(409).json({
          erreur: `passage de ${reservation.statut} a ${req.body.statut} interdit`,
        });
      }

      const misAJour = await prisma.reservation.update({
        where: { id },
        data: { statut: req.body.statut },
      });
      res.json(misAJour);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /reservations/{id}:
 *   delete:
 *     summary: Annuler sa reservation (le statut passe a annulee et rien n'est efface)
 *     tags: [reservations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: La reservation au statut annulee }
 *       401: { description: Jeton absent ou invalide }
 *       403: { description: Cette reservation n'est pas la votre }
 *       404: { description: Aucune reservation avec cet identifiant }
 *       409: { description: Annulation impossible depuis le statut actuel }
 */
router.delete(
  "/:id",
  authRequis,
  exigeRole("voyageur"),
  async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(404).json({ erreur: "Reservation introuvable" });
    }
    try {
      const reservation = await prisma.reservation.findUnique({
        where: { id },
      });

      if (!reservation) {
        return res.status(404).json({ erreur: "Reservation introuvable" });
      }
      if (reservation.voyageurId !== req.user.userId) {
        return res
          .status(403)
          .json({ erreur: "Acces refuse a cette reservation" });
      }
      if (!transitionValide(reservation.statut, "annulee")) {
        return res.status(409).json({
          erreur: `passage de ${reservation.statut} a annulee interdit`,
        });
      }

      // jamais de delete : un update du statut
      const annulee = await prisma.reservation.update({
        where: { id },
        data: { statut: "annulee" },
      });
      res.status(200).json(annulee);
    } catch (error) {
      next(error);
    }
  },
);


export default router;
