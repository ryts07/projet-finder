import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app, prisma, voyageur, initialiserTests } from "./helpers.js";
describe("Authentification", () => {
  initialiserTests();
  it("TA-005 : inscription et validation 400", async () => {
    const email = `test-${randomUUID()}@example.test`;
    try {
      const r = await request(app).post("/auth/register").send({
        email, motDePasse: "mot-de-passe-test", nom: "Test", prenom: "Finder"
      });
      expect(r.status).toBe(201);
      expect(r.body.email).toBe(email);
      expect(r.body).not.toHaveProperty("motDePasse");
      const invalide = await request(app).post("/auth/register").send({
        email: "pas-un-email", motDePasse: "court", nom: "Test", prenom: "Finder"
      });
      expect(invalide.status).toBe(400);
      expect(invalide.body).toHaveProperty("erreur");
    } finally {
      await prisma.compte.deleteMany({ where: { email } });
    }
  });
  it("TA-006 : connexion JWT et profil", async () => {
    const connexion = await request(app).post("/auth/login").send({
      email: voyageur.email, motDePasse: voyageur.mot_de_passe_clair
    });
    expect(connexion.status).toBe(200);
    expect(connexion.body.token).toEqual(expect.any(String));
    const profil = await request(app).get("/voyageurs/me")
      .set("Authorization", `Bearer ${connexion.body.token}`);
    expect(profil.status).toBe(200);
    expect(profil.body.nom).toBe(voyageur.nom);
  });
});
