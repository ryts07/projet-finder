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
  const { categorie, hotel, capacite, prix_max } = req.query;
  const filtre = {};
  if (categorie) {
    filtre.categorie = categorie;
  }
  if (hotel) {
    filtre.hotelId = Number(hotel);
  }
  if (capacite) {
    filtre.capacite = { gte: Number(capacite) };
  }
  if (prix_max) {
    filtre.prixNuit = { lte: Number(prix_max) };
  }
  const chambres = await prisma.chambre.findMany({ where: filtre });
  res.json(chambres);
});

app.get("/chambres/:id", async (req, res) => {
  const id = Number(req.params.id);
  const chambre = await prisma.chambre.findUnique({ where: { id } });
  if (!chambre) return res.status(404).json({ erreur: "Hotel introuvable" });
  res.json(chambre);
});

app.listen(process.env.PORT ?? 3000);
