import "dotenv/config";
import express from "express";
import { PrismaClient } from "@prisma/client";

const app = express();
app.use(express.json());

const prisma = new PrismaClient();

app.get("/hotels", async (req, res) => {
  const hotels = await prisma.hotel.findMany();
  res.json(hotels);
});

app.get("/hotels/:id", async (req, res) => {
  const id = Number(req.params.id);
  const hotel = await prisma.hotel.findUnique({ where: { id } });
  if (!hotel) return res.status(404).json({ erreur: "Hotel introuvable" });
  res.json(hotel);
});

app.get("/hotels/:id/chambres", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    return res.status(404).json({ erreur: "Hôtel introuvable" });
  }
  const hotel = await prisma.hotel.findUnique({
    where: { id },
  });
  if (!hotel) {
    return res.status(404).json({ erreur: "Hôtel introuvable" });
  }
  const chambres = await prisma.chambre.findMany({
    where: { hotelId: id },
  });
  res.json(chambres);
});

app.get("/chambres", async (req, res) => {
  const prixMax = Number(req.query.prix_max);
  if (!prixMax) return res.status(404).json({ erreur: "Valeur invalide" });
  const chambres = await prisma.chambre.findMany({
    where: { prixNuit: { lte: prixMax } },
  });
  res.json(chambres);
});

app.get("/chambres/:id", async (req, res) => {
  const id = Number(req.params.id);
  const chambre = await prisma.chambre.findUnique({ where: { id } });
  if (!chambre) return res.status(404).json({ erreur: "Hotel introuvable" });
  res.json(chambre);
});

app.listen(process.env.PORT ?? 3000);
