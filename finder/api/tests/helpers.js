import { beforeAll, afterAll, expect } from "vitest";
import request from "supertest";
import { readFileSync } from "node:fs";
import app, { prisma } from "../src/app.js";

export { app, prisma };
export const comptes = JSON.parse(readFileSync(new URL("../finder-data/comptes.json", import.meta.url), "utf8"));
export const voyageur = comptes.find(c => c.role === "voyageur");
export const hotelier = comptes.find(c => c.role === "hotelier");
export const jetons = { voyageur: "", hotelier: "" };

export function initialiserTests() {
  beforeAll(async () => {
    await prisma.$connect();
    const [h, c] = await Promise.all([prisma.hotel.count(), prisma.chambre.count()]);
    if (h !== 3 || c !== 32) throw new Error("Base de test non seedee : 3 hotels et 32 chambres attendus au depart.");
    for (const [role, compte] of [["voyageur", voyageur], ["hotelier", hotelier]]) {
      const r = await request(app).post("/auth/login").send({
        email: compte.email, motDePasse: compte.mot_de_passe_clair
      });
      expect(r.status).toBe(200);
      jetons[role] = r.body.token;
    }
  });
  afterAll(async () => { await prisma.$disconnect(); });
}
