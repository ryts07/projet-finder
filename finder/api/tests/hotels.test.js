import { describe, it, expect } from "vitest";
import request from "supertest";
import { app, initialiserTests } from "./helpers.js";
describe("Hotels", () => {
  initialiserTests();
  it("TA-002 : trois hotels", async () => {
    const r = await request(app).get("/hotels");
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(3);
  });
  it("TA-003 : hotel absent = 404", async () => {
    const r = await request(app).get("/hotels/999999");
    expect(r.status).toBe(404);
    expect(r.body).toHaveProperty("erreur");
  });
});
