import { z } from "zod";

const telephoneValide = z
  .string()
  .regex(
    /^(?:0[1-9](?:[ .-]?\d{2}){4}|\+?[1-9]\d{7,14})$/,
    "Telephone invalide",
  );

export const SchemaConnexionUtilisateur = z
  .object({
    email: z.string().email("Email invalide"),
    motDePasse: z.string().min(6, "Mot de passe trop court"),
  })
  .strict();

export const SchemaInscriptionUtilisateur = z
  .object({
    email: z.string().email("Email invalide"),
    motDePasse: z.string().min(6, "Mot de passe trop court"),
    nom: z.string().min(1, "Nom obligatoire"),
    prenom: z.string().min(1, "Prenom obligatoire"),
    telephone: telephoneValide.nullable().optional(),
  })
  .strict();

export const SchemaCreationChambre = z
  .object({
    numero: z.string().min(1, "Numero de chambre invalide"),
    categorie: z.enum(["simple", "double", "familiale", "suite"]),
    capacite: z.number().int().positive("Capacite invalide"),
    description: z.string().min(1, "Description obligatoire"),
    disponible: z.boolean().optional(),
    prixNuit: z.number().int().positive("Prix par nuit invalide"),
  })
  .strict();

export const SchemaModificationChambre = SchemaCreationChambre.partial()
  .strict()
  .refine((donnees) => Object.keys(donnees).length > 0, {
    message: "Au moins un champ doit etre fourni",
  });

export const SchemaModificationVoyageur = z
  .object({
    nom: z.string().min(1, "Nom obligatoire").optional(),
    prenom: z.string().min(1, "Prenom obligatoire").optional(),
    telephone: telephoneValide.nullable().optional(),
  })
  .strict()
  .refine((donnees) => Object.keys(donnees).length > 0, {
    message: "Au moins un champ doit etre fourni",
  });

export const SchemaRechercheChambre = z
  .object({
    hotel: z.coerce.number().int().positive().optional(),
    prix_max: z.coerce.number().positive("Prix maximum invalide").optional(),
    capacite: z.coerce.number().int().positive("Capacite invalide").optional(),
    categorie: z.enum(["simple", "double", "familiale", "suite"]).optional(),
    date_debut: z.string().optional(),
    date_fin: z.string().optional(),
  })
  .strict();

export const SchemaCreationReservation = z
  .object({
    chambreId: z.number().int().positive("ID de la chambre invalide"),
    dateArrivee: z.string().datetime("Date d'arrivée invalide"),
    dateDepart: z.string().datetime("Date de départ invalide"),
    nbPersonnes: z.number().int().positive("Nombre de personnes invalide"),
    demandeSpeciale: z
      .string()
      .max(200, "Demande spéciale trop longue")
      .optional(),
  })
  .strict();

export const SchemaConfirmationReservation = z
  .object({
    statut: z.enum(["confirmee", "refusee"]),
  })
  .strict();
