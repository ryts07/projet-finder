// api/prisma/seed.js
import { readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DATA_DIR = path.join(import.meta.dirname, "..", "finder-data");
const lire = (fichier) =>
  JSON.parse(readFileSync(path.join(DATA_DIR, fichier), "utf8"));

async function main() {
  const hotels = lire("hotels.json");
  const chambres = lire("chambres.json");
  const comptes = lire("comptes.json");
  const reservations = lire("reservations.json");

  await prisma.reservation.deleteMany();
  await prisma.compte.deleteMany();
  await prisma.chambre.deleteMany();
  await prisma.hotel.deleteMany();

  await prisma.hotel.createMany({
    data: hotels.map((h) => ({
      id: h.id,
      nom: h.nom,
      etoiles: h.etoiles,
      adresse: h.adresse,
      codePostal: h.code_postal,
      ville: h.ville,
      telephone: h.telephone,
      email: h.email,
      gerant: h.gerant,
      description: h.description,
    })),
  });

  await prisma.chambre.createMany({
    data: chambres.map((c) => ({
      id: c.id,
      hotelId: c.hotel_id,
      numero: c.numero,
      categorie: c.categorie,
      capacite: c.capacite,
      prixNuit: c.prix_nuit,
      description: c.description,
      disponible: c.disponible,
    })),
  });

  const comptesHaches = await Promise.all(
    comptes.map(async (c) => ({
      id: c.id,
      role: c.role,
      email: c.email,
      motDePasse: await bcrypt.hash(c.mot_de_passe_clair, 10),
      nom: c.nom,
      prenom: c.prenom,
      telephone: c.telephone ?? null,
      hotelId: c.hotel_id ?? null,
    })),
  );
  await prisma.compte.createMany({ data: comptesHaches });

  await prisma.reservation.createMany({
    data: reservations.map((r) => ({
      id: r.id,
      chambreId: r.chambre_id,
      voyageurId: r.voyageur_id,
      dateArrivee: new Date(r.date_arrivee),
      dateDepart: new Date(r.date_depart),
      nbPersonnes: r.nb_personnes,
      statut: r.statut,
      demandeSpeciale: r.demande_speciale,
    })),
  });

  console.log(
    `${hotels.length} hôtels, ${chambres.length} chambres, ${comptes.length} comptes, ${reservations.length} réservations`,
  );
}

main()
  .catch((erreur) => {
    console.error(erreur);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
