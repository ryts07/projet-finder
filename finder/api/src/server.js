import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
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

const JWT_SECRET = process.env.JWT_SECRET;

const comptePublic = ({ motDePasse, ...compte }) => compte;

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

app.get("/health", (req, res) => res.json({ ok: true }));

const TRANSITIONS_AUTORISEES = {
  en_attente: ["confirmee", "refusee"],
  confirmee: ["annulée"],
  refusee: [],
  annulee: [],
};

function transitionValide(statutActuel, statutVoulu) {
  return (TRANSITIONS_AUTORISEES[statutActuel] || []).includes(statutVoulu);
}

// ---------- Auth ----------

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

app.post("/auth/logout", authRequis, (req, res) => res.status(204).end());

// ---------- Profil voyageur ----------

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

// ---------- Hôtels et chambres : lectures publiques ----------

app.get("/hotels", async (req, res, next) => {
  try {
    res.json(await prisma.hotel.findMany());
  } catch (error) {
    next(error);
  }
});

app.get("/hotels/:id", async (req, res, next) => {
  const id = Number(req.params.id);
  try {
    const hotel = await prisma.hotel.findUnique({ where: { id } });
    if (!hotel) return res.status(404).json({ erreur: "Hotel introuvable" });
    res.json(hotel);
  } catch (error) {
    next(error);
  }
});

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

app.get("/chambres/:id", async (req, res, next) => {
  const id = Number(req.params.id);
  try {
    const chambre = await prisma.chambre.findUnique({ where: { id } });
    if (!chambre)
      return res.status(404).json({ erreur: "chambre introuvable" });
    res.json(chambre);
  } catch (error) {
    next(error);
  }
});

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

// ---------- Chambres : écritures protégées ----------

app.post(
  "/chambres",
  authRequis,
  exigeRole("hotelier"),
  validerCorps(SchemaCreationChambre),
  async (req, res, next) => {
    try {
      const chambre = await prisma.chambre.create({
        data: { ...req.body, hotelId: req.user.hotelId },
      });
      res.status(201).json(chambre);
    } catch (error) {
      next(error);
    }
  },
);

app.patch(
  "/chambres/:id",
  authRequis,
  exigeRole("hotelier"),
  validerCorps(SchemaModificationChambre),
  async (req, res, next) => {
    const id = Number(req.params.id);
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

app.delete(
  "/chambres/:id",
  authRequis,
  exigeRole("hotelier"),
  async (req, res, next) => {
    const id = Number(req.params.id);
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

// ---------- Étape 7 : réservations ----------

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
          statut: "en_attente", // toujours fixé par le serveur à la création
          demandeSpeciale: demandeSpeciale ?? "",
        },
      });
      res.status(201).json(reservation);
    } catch (error) {
      next(error);
    }
  },
);

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

app.patch(
  "/reservations/:id",
  authRequis,
  exigeRole("hotelier"),
  validerCorps(SchemaConfirmationReservation),
  async (req, res, next) => {
    const id = Number(req.params.id);
    try {
      const reservation = await prisma.reservation.findUnique({
        where: { id },
        include: { chambre: true },
      });

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

app.delete(
  "/reservations/:id",
  authRequis,
  exigeRole("voyageur"),
  async (req, res, next) => {
    const id = Number(req.params.id);
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

app.get("/comptes", async (req, res, next) => {
  try {
    res.json(await prisma.compte.findMany());
  } catch (error) {
    next(error);
  }
});

app.get("/comptes/:id", async (req, res, next) => {
  const id = Number(req.params.id);
  try {
    const compte = await prisma.compte.findUnique({ where: { id } });
    if (!compte) return res.status(404).json({ erreur: "compte introuvable" });
    res.json(compte);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ erreur: "Erreur interne du serveur" });
});

const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
