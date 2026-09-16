// api/prisma/seed.js
import { readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// le seed vit dans prisma/, le kit à la racine de l'API : '..' remonte d'un cran
const DATA_DIR = path.join(import.meta.dirname, "..", "finder-data");
const lire = (fichier) =>
  JSON.parse(readFileSync(path.join(DATA_DIR, fichier), "utf8"));

async function main() {
  const hotels = lire("hotels.json");
  const chambres = lire("chambres.json");
  const comptes = lire("comptes.json");
  const reservations = lire("reservations.json");

  // on vide dans l'ordre INVERSE des dépendances : une réservation référence une
  // chambre et un compte, une chambre référence un hôtel, un compte peut référencer un hôtel
  await prisma.reservation.deleteMany();
  await prisma.compte.deleteMany();
  await prisma.chambre.deleteMany();
  await prisma.hotel.deleteMany();

  // 1. Hôtels : aucune dépendance, en premier
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

  // 2. Chambres : dépendent des hôtels
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

  // 3. Comptes : les hôteliers dépendent de leur hôtel (hotel_id) ; les voyageurs et
  // l'admin n'en ont pas -> hotel_id est ABSENT du JSON pour eux, donc undefined,
  // que Prisma lit comme "non fourni" : ?? null l'écrit explicitement
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
  // bcrypt.hash est asynchrone : sans Promise.all, le .map() rendrait un tableau de
  // promesses et createMany recevrait des objets vides. On prépare toutes les lignes, PUIS on insère
  await prisma.compte.createMany({ data: comptesHaches });

  // 4. Réservations : dépendent d'une chambre et d'un compte (voyageur), en dernier
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
