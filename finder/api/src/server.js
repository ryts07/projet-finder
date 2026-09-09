import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import express from "express";

const hotels = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "..", "finder-data", "hotels.json"),
    "utf8",
  ),
);

const chambres = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, "..", "finder-data", "chambres.json"),
    "utf8",
  ),
);

const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/hotels", (req, res) => res.json(hotels));
app.get("/chambres", (req, res) => res.json(chambres));

app.get("/hotels/:id", (req, res) => {
  const id = Number(req.params.id);

  const hotel = hotels.find((h) => h.id === id);
  if (!hotel) return res.status(404).json({ erreur: "Hôtel introuvable" });

  res.json(hotel);
});

app.get("/chambres", (req, res) => {
  const { prix_max } = req.query;

  if (prix_max === undefined) {
    return res.json(chambres);
  }

  const prixMaxNum = Number(prix_max);

  if (Number.isNaN(prixMaxNum)) {
    return res
      .status(400)
      .json({ erreur: "Le critère prix_max doit être un nombre valide" });
  }

  const resultat = chambres.filter((c) => c.prix_nuit <= prixMaxNum);
  res.json(resultat);
});

app.listen(process.env.PORT ?? 3000);
