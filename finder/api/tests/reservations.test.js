import { describe, it, expect } from "vitest";
import request from "supertest";
import { app, prisma, jetons, initialiserTests } from "./helpers.js";
describe("Reservations", () => {
  initialiserTests();
  it("TA-007 : controle des droits 401 et 403", async () => {
    const sansJeton = await request(app).post("/reservations").send({});
    expect(sansJeton.status).toBe(401);
    expect(sansJeton.body).toHaveProperty("erreur");
    const hotelier = await request(app).post("/reservations")
      .set("Authorization", `Bearer ${jetons.hotelier}`).send({});
    expect(hotelier.status).toBe(403);
    expect(hotelier.body).toHaveProperty("erreur");
  });
  it("TA-009/010 : creer, retrouver, confirmer et annuler sa reservation", async () => {
    let id;
    try {
      const creation = await request(app).post("/reservations")
        .set("Authorization", `Bearer ${jetons.voyageur}`)
        .send({ chambreId: 1, dateArrivee: "2099-06-10T00:00:00.000Z",
          dateDepart: "2099-06-12T00:00:00.000Z", nbPersonnes: 1 });
      expect(creation.status).toBe(201);
      id = creation.body.id;
      expect(creation.body.statut).toBe("en_attente");
      const liste = await request(app).get("/reservations/mine")
        .set("Authorization", `Bearer ${jetons.voyageur}`);
      expect(liste.status).toBe(200);
      expect(liste.body.some(r => r.id === id)).toBe(true);
      const confirmation = await request(app).patch(`/reservations/${id}`)
        .set("Authorization", `Bearer ${jetons.hotelier}`)
        .send({ statut: "confirmee" });
      expect(confirmation.status).toBe(200);
      const annulation = await request(app).delete(`/reservations/${id}`)
        .set("Authorization", `Bearer ${jetons.voyageur}`);
      expect(annulation.status).toBe(200);
      expect(annulation.body.statut).toBe("annulee");
    } finally {
      if (id !== undefined) await prisma.reservation.deleteMany({ where: { id } });
    }
  });
});
