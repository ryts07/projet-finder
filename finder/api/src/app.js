import express from "express";
import path from "node:path";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import prisma from "./prisma.js";
import authRouter from "./routes/auth.js";
import voyageursRouter from "./routes/voyageurs.js";
import hotelsRouter from "./routes/hotels.js";
import chambresRouter from "./routes/chambres.js";
import reservationsRouter from "./routes/reservations.js";

const app = express();
app.use(express.json()); 
const spec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "API Finder",
      version: "1.0.0",
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: [
    path.join(import.meta.dirname, "routes", "auth.js"),
    path.join(import.meta.dirname, "routes", "voyageurs.js"),
    path.join(import.meta.dirname, "routes", "hotels.js"),
    path.join(import.meta.dirname, "routes", "chambres.js"),
    path.join(import.meta.dirname, "routes", "reservations.js"),
    path.join(import.meta.dirname, "app.js"),
  ],
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(spec));
app.get("/docs/openapi.json", (req, res) => res.json(spec));
/**
 * @openapi
 * /health:
 *   get:
 *     summary: Verifier que l'API repond
 *     tags: [sante]
 *     responses:
 *       200: { description: L'API tourne }
 */
app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/auth", authRouter);
app.use("/voyageurs", voyageursRouter);
app.use("/hotels", hotelsRouter);
app.use("/chambres", chambresRouter);
app.use("/reservations", reservationsRouter);
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ erreur: "Erreur interne du serveur" });
});
export { prisma };
export default app;
