import { describe, it, expect } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app, prisma, jetons, initialiserTests } from "./helpers.js";
describe("Chambres", () => {
  initialiserTests();
  it("TA-004 : une chambre confirmee disparait pendant le chevauchement", async () => {
    const a = await request(app).get("/chambres?date_debut=2026-10-10&date_fin=2026-10-12");
    const b = await request(app).get("/chambres?date_debut=2026-10-11&date_fin=2026-10-13");
    expect(a.status).toBe(200);
    expect(a.body).toHaveLength(31);
    expect(a.body.some(c => c.id === 4)).toBe(false);
    expect(b.status).toBe(200);
    expect(b.body).toHaveLength(32);
    expect(b.body.some(c => c.id === 4)).toBe(true);
  });
  it("Complement : chambre inconnue = 404", async () => {
    const r = await request(app).get("/chambres/999999");
    expect(r.status).toBe(404);
    expect(r.body).toHaveProperty("erreur");
  });
  it("TA-008 : CRUD chambre temporaire", async () => {
    let id;
    try {
      const creation = await request(app).post("/chambres")
        .set("Authorization", `Bearer ${jetons.hotelier}`)
        .send({ numero: `T-${randomUUID().slice(0,8)}`, categorie: "simple",
          capacite: 1, prixNuit: 50, description: "Test temporaire" });
      expect(creation.status).toBe(201);
      id = creation.body.id;
      const modification = await request(app).patch(`/chambres/${id}`)
        .set("Authorization", `Bearer ${jetons.hotelier}`).send({ prixNuit: 60 });
      expect(modification.status).toBe(200);
      expect(modification.body.prixNuit).toBe(60);
      const suppression = await request(app).delete(`/chambres/${id}`)
        .set("Authorization", `Bearer ${jetons.hotelier}`);
      expect(suppression.status).toBe(204);
      id = undefined;
    } finally {
      if (id !== undefined) await prisma.chambre.deleteMany({ where: { id } });
    }
  });
});
