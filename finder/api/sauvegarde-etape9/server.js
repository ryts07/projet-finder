import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import {
  SchemaConnexionUtilisateur,
  SchemaCreationChambre,
  SchemaInscriptionUtilisateur,
  SchemaModificationChambre,
  SchemaModificationVoyageur,
  SchemaRechercheChambre,
  SchemaCreationReservation,
  SchemaConfirmationReservation,
} from "./schemas.js";

dotenv.config({ path: path.join(import.meta.dirname, "..", ".env") });

const app = express();
const prisma = new PrismaClient();
app.use(express.json());

// ---------- Documentation OpenAPI sur /docs ----------
const spec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: { title: "API Finder", version: "1.0.0" },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
  },
  apis: ["./src/**/*.js"],
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec));

const JWT_SECRET = process.env.JWT_SECRET;

const comptePublic = ({ motDePasse, ...compte }) => compte;

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

// ---------- Middlewares ----------
const validerCorps = (schema) => (req, res, next) => {
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

const validerQuery = (schema) => (req, res, next) => {
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

const authRequis = (req, res, next) => {
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

const exigeRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user?.userId || !roles.includes(req.user.role)) {
      return res.status(403).json({ erreur: "Role non autorise" });
    }
    next();
  };

// ---------- Sante ----------

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Verifier que l'API repond
 *     tags: [sante]
 *     responses:
 *       200: { description: L'API tourne }
 */
app.get("/health", (req, res) => res.json({ ok: true }));

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
app.post(
  "/auth/register",
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
app.post(
  "/auth/login",
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
app.post("/auth/logout", authRequis, (req, res) => res.status(204).end());

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
app.get(
  "/voyageurs/me",
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
app.patch(
  "/voyageurs/me",
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
app.get("/hotels", async (req, res, next) => {
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
app.get("/hotels/:id", async (req, res, next) => {
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
app.get("/hotels/:id/chambres", async (req, res, next) => {
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
app.get(
  "/chambres",
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
app.get("/chambres/:id", async (req, res, next) => {
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
app.post(
  "/chambres",
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

      // l'hotel vient du jeton, jamais du corps
      const chambre = await prisma.chambre.create({
        data: { ...req.body, hotelId: req.user.hotelId },
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
app.patch(
  "/chambres/:id",
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
app.delete(
  "/chambres/:id",
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
app.post(
  "/reservations",
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
app.get(
  "/reservations/mine",
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
app.get(
  "/reservations/received",
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
app.patch(
  "/reservations/:id",
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
app.delete(
  "/reservations/:id",
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

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ erreur: "Erreur interne du serveur" });
});

const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
