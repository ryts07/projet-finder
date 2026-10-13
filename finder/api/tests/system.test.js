import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers.js";
describe("Etat", () => {
  it("TA-001 : API disponible", async () => {
    const r = await request(app).get("/health");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
  });
});
