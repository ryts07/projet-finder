import "dotenv/config";
import { readFileSync } from "node:fs";
import express from "express";
import path from "node:path";

const app = express();
app.use(express.json());

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

app.get("/hotels", (req, res) => res.json(hotels));

app.get("/hotels/:id", (req, res) => {
  const id = Number(req.params.id);
  const hotel = hotels.find((h) => h.id === id);
  if (!hotel) return res.status(404).json({ erreur: "Hotel introuvable" });
  res.json(hotel);
});

app.get("/chambres", (req, res) => {
  const prixMax = Number(req.query.prix_max);
  if (!prixMax) return res.status(404).json({ erreur: "Valeur invalide" });
  const chambre = chambres.filter((c) => c.prix_nuit <= prixMax);
  res.json(chambre);
});

app.get("/chambres/:id", (req, res) => {
  const id = Number(req.params.id);
  const chambre = chambres.find((c) => c.id === id);
  if (!chambre) return res.status(404).json({ erreur: "Hotel introuvable" });
  res.json(chambre);
});

app.listen(process.env.PORT ?? 3000);
