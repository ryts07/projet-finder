import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const app = express();
const PORT = process.env.PORT ?? 3000;
const prisma = new PrismaClient();

app.use(express.json());

function authRequis(req, res, next) {
  const entete = req.headers.authorization || "";
  const token = entete.replace("Bearer ", "");

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // contient { userId, role, hotelId }
    next();
  } catch {
    return res.status(401).json({ erreur: "jeton absent ou invalide" });
  }
}

function exigeRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ erreur: "accès refusé" });
    }
    next();
  };
}

app.get("/health", (req, res) => {
  res.json({ statut: "ok" });
});

app.get("/hotels", async (req, res) => {
  const hotels = await prisma.hotel.findMany();
  res.json(hotels);
});

app.get("/hotels/:id/chambres", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(404).json({ erreur: "Hôtel introuvable" });
  }

  const hotel = await prisma.hotel.findUnique({ where: { id } });

  if (!hotel) {
    return res.status(404).json({ erreur: "Hôtel introuvable" });
  }

  const chambres = await prisma.chambre.findMany({
    where: { hotelId: id },
  });

  res.json(chambres);
});

app.get("/hotels/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res
      .status(400)
      .json({ erreur: "L'identifiant doit être un entier" });
  }

  const hotel = await prisma.hotel.findUnique({ where: { id } });

  if (!hotel) {
    return res.status(404).json({ erreur: "Hôtel introuvable" });
  }

  res.json(hotel);
});

app.get("/chambres/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res
      .status(400)
      .json({ erreur: "L'identifiant doit être un entier" });
  }

  const chambre = await prisma.chambre.findUnique({ where: { id } });

  if (!chambre) {
    return res.status(404).json({ erreur: "Chambre introuvable" });
  }

  res.json(chambre);
});

app.get("/chambres", async (req, res) => {
  const { hotel, prixmax, categorie, capacite, date_debut, date_fin } =
    req.query;

  const filtre = {};

  if (hotel) {
    if (!Number.isNaN(Number(hotel))) {
      filtre.hotelId = Number(hotel);
    } else {
      filtre.hotel = { nom: { contains: String(hotel) } };
    }
  }
  if (prixmax)
    filtre.prixNuit = {
      lte: Number(prixmax),
    };
  if (categorie)
    filtre.categorie = {
      contains: String(categorie),
    };
  if (capacite)
    filtre.capacite = {
      equals: Number(capacite),
    };

  if (date_debut && date_fin) {
    const debut = new Date(String(date_debut));
    const fin = new Date(String(date_fin));

    if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) {
      return res.status(400).json({ erreur: "Dates invalides" });
    }

    if (debut >= fin) {
      return res.status(400).json({
        erreur: "date_debut doit être strictement avant date_fin",
      });
    }

    filtre.reservations = {
      none: {
        statut: "confirmee",
        dateArrivee: { lt: fin },
        dateDepart: { gt: debut },
      },
    };
  }

  const chambres = await prisma.chambre.findMany({
    where: filtre,
    include: {
      hotel: true,
    },
  });

  res.json(chambres);
});

app.post("/auth/register", async (req, res) => {
  const { email, motDePasse, nom, prenom, telephone } = req.body;

  if (!email || !motDePasse || !nom || !prenom) {
    return res
      .status(400)
      .json({ erreur: "email, motDePasse, nom et prenom sont requis" });
  }

  const motDePasseHache = await bcrypt.hash(motDePasse, 10);

  const compte = await prisma.compte.create({
    data: {
      email,
      motDePasse: motDePasseHache,
      nom,
      prenom,
      telephone: telephone ?? null,
      role: "voyageur",
    },
    select: {
      id: true,
      email: true,
      nom: true,
      prenom: true,
      telephone: true,
      role: true,
    },
  });

  res.status(201).json(compte);
});

app.post("/auth/login", async (req, res) => {
  const { email, motDePasse } = req.body;

  const compte = await prisma.compte.findUnique({ where: { email } });

  if (!compte || !(await bcrypt.compare(motDePasse, compte.motDePasse))) {
    return res.status(401).json({ erreur: "identifiants invalides" });
  }

  const token = jwt.sign(
    { userId: compte.id, role: compte.role, hotelId: compte.hotelId },
    process.env.JWT_SECRET,
    { expiresIn: "24h" },
  );

  res.json({ token });
});

app.post("/auth/logout", authRequis, (req, res) => {
  res.status(204).end();
});

app.get(
  "/voyageurs/me",
  authRequis,
  exigeRole("voyageur"),
  async (req, res) => {
    const moi = await prisma.compte.findUnique({
      where: { id: req.user.userId },
      select: {
        nom: true,
        prenom: true,
        telephone: true,
      },
    });

    if (!moi) {
      return res.status(404).json({ erreur: "Voyageur introuvable" });
    }

    res.json(moi);
  },
);

app.patch(
  "/voyageurs/me",
  authRequis,
  exigeRole("voyageur"),
  async (req, res) => {
    const { telephone } = req.body;

    const moi = await prisma.compte.update({
      where: { id: req.user.userId },
      data: { telephone: telephone ?? null },
      select: {
        nom: true,
        prenom: true,
        telephone: true,
      },
    });

    res.json(moi);
  },
);

app.post("/chambres", authRequis, exigeRole("hotelier"), async (req, res) => {
  const chambre = await prisma.chambre.create({
    data: {
      ...req.body,
      hotelId: req.user.hotelId,
    },
  });

  res.status(201).json(chambre);
});

app.patch(
  "/chambres/:id",
  authRequis,
  exigeRole("hotelier"),
  async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res
        .status(400)
        .json({ erreur: "L'identifiant doit être un entier" });
    }

    const chambreExiste = await prisma.chambre.findUnique({ where: { id } });

    if (!chambreExiste) {
      return res.status(404).json({ erreur: "Chambre introuvable" });
    }

    const chambre = await prisma.chambre.update({
      where: { id },
      data: req.body,
    });

    res.json(chambre);
  },
);

app.delete(
  "/chambres/:id",
  authRequis,
  exigeRole("hotelier"),
  async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res
        .status(400)
        .json({ erreur: "L'identifiant doit être un entier" });
    }

    const chambreExiste = await prisma.chambre.findUnique({ where: { id } });

    if (!chambreExiste) {
      return res.status(404).json({ erreur: "Chambre introuvable" });
    }

    await prisma.chambre.delete({ where: { id } });

    res.status(204).end();
  },
);

export { app, authRequis, exigeRole };

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  app.listen(PORT, () => console.log(`API sur http://localhost:${PORT}`));
}
