// A lancer UNE FOIS depuis finder/api : node appliquer-etape9.mjs
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const src = path.join(root,"src");
const original = fs.readFileSync(path.join(src,"server.js"),"utf8");
if (!original.includes("// ---------- Profil voyageur ----------") || !original.includes("// ---------- Reservations ----------") || !original.includes("app.listen(")) {
  throw new Error("Le server.js ne correspond pas au depot Finder d'origine. Aucun fichier modifie.");
}
const out = path.join(root,"sauvegarde-etape9");
fs.mkdirSync(out,{recursive:true});
for(const f of ["server.js","app.js","schemas.js"]) {
 const p=path.join(src,f);
 if(fs.existsSync(p)) fs.copyFileSync(p,path.join(out,f));
}
const between=(a,b)=> {
 const start=original.indexOf(a), end=b?original.indexOf(b,start+a.length):original.length;
 if(start<0 || end<0) throw new Error(`Section introuvable : ${a}`);
 return original.slice(start,end);
};
const mid=between("// ---------- Middlewares ----------","// ---------- Sante ----------");
const transition=between("// ---------- Table des transitions de statut d'une reservation ----------","// ---------- Middlewares ----------");
const sections={
 auth:between("// ---------- Auth ----------","// ---------- Profil voyageur ----------"),
 voyageurs:between("// ---------- Profil voyageur ----------","// ---------- Hotels ----------"),
 hotels:between("// ---------- Hotels ----------","// ---------- Chambres : lectures publiques ----------"),
 chambres:between("// ---------- Chambres : lectures publiques ----------","// ---------- Reservations ----------"),
 reservations:between("// ---------- Reservations ----------").split("app.use((error, req, res, next) =>")[0]
};
const imports={
 auth:`import bcrypt from "bcrypt";\nimport jwt from "jsonwebtoken";\nimport prisma from "../prisma.js";\nimport { validerCorps, authRequis, exigeRole } from "../middlewares.js";\nimport { SchemaConnexionUtilisateur, SchemaInscriptionUtilisateur } from "../schemas.js";\nconst comptePublic = ({ motDePasse, ...compte }) => compte;\nconst JWT_SECRET = process.env.JWT_SECRET;\n`,
 voyageurs:`import prisma from "../prisma.js";\nimport { validerCorps, authRequis, exigeRole } from "../middlewares.js";\nimport { SchemaModificationVoyageur } from "../schemas.js";\n`,
 hotels:`import prisma from "../prisma.js";\n`,
 chambres:`import prisma from "../prisma.js";\nimport { validerCorps, validerQuery, authRequis, exigeRole } from "../middlewares.js";\nimport { SchemaRechercheChambre, SchemaCreationChambre, SchemaModificationChambre } from "../schemas.js";\n`,
 reservations:`import prisma from "../prisma.js";\nimport { validerCorps, authRequis, exigeRole } from "../middlewares.js";\nimport { SchemaCreationReservation, SchemaConfirmationReservation } from "../schemas.js";\n${transition}\n`
};
const prefixes={auth:"/auth",voyageurs:"/voyageurs",hotels:"/hotels",chambres:"/chambres",reservations:"/reservations"};
fs.mkdirSync(path.join(src,"routes"),{recursive:true});
for(const [name,body] of Object.entries(sections)){
 let b=body.replace(/\bapp\.(get|post|patch|delete)\(/g,"router.$1(");
 // Ne modifier QUE les chemins de route, pas les blocs @openapi.
 const pre=prefixes[name].replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
 b=b.replace(new RegExp('(router\\.(?:get|post|patch|delete)\\(\\s*["\\x27])'+pre+'(?=/|["\\x27])','g'),"$1");
 if(name==="auth") b=b.replace(/(router\.(?:get|post|patch|delete)\(\s*["'])\/(auth)(?=\/)/g,"$1"); 
 fs.writeFileSync(path.join(src,"routes",name+".js"),
   `import { Router } from "express";\n${imports[name]}\nconst router = Router();\n${b}\nexport default router;\n`);
}
fs.writeFileSync(path.join(src,"prisma.js"),`import dotenv from "dotenv";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
dotenv.config({ path: path.join(import.meta.dirname, "..", ".env") });
const prisma = new PrismaClient();
export default prisma;
`);
fs.writeFileSync(path.join(src,"middlewares.js"),`import dotenv from "dotenv";
import path from "node:path";
import jwt from "jsonwebtoken";
dotenv.config({ path: path.join(import.meta.dirname, "..", ".env") });
const JWT_SECRET = process.env.JWT_SECRET;
${mid.replace(/const (validerCorps|validerQuery|authRequis|exigeRole)/g,"export const $1")}
`);
fs.writeFileSync(path.join(src,"app.js"),`import express from "express";
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
    info: { title: "API Finder", version: "1.0.0" },
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
  },
  apis: [path.join(import.meta.dirname, "routes", "*.js"), path.join(import.meta.dirname, "app.js")],
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
`);
fs.writeFileSync(path.join(src,"server.js"),`import app from "./app.js";
const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(\`Serveur demarre sur http://localhost:\${PORT}\`));
`);
const schemasPath=path.join(src,"schemas.js");
let schemas=fs.readFileSync(schemasPath,"utf8");
const marker='export const SchemaInscriptionUtilisateur';
const at=schemas.indexOf(marker);
if(at>=0){
 const head=schemas.slice(0,at), tail=schemas.slice(at).replace('.min(6, "Mot de passe trop court")','.min(8, "Mot de passe trop court")');
 fs.writeFileSync(schemasPath,head+tail);
}
const pkgPath=path.join(root,"package.json");
const pkg=JSON.parse(fs.readFileSync(pkgPath,"utf8"));
pkg.scripts={...pkg.scripts,check:"node --check src/app.js && node --check src/server.js && node --check prisma/seed.js",test:"vitest run --no-file-parallelism","test:coverage":"vitest run --coverage --no-file-parallelism"};
fs.copyFileSync(pkgPath,path.join(out,"package.json"));
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+"\n");
console.log("Etape 9 : fichiers generes. Sauvegarde dans sauvegarde-etape9/");
console.log("Installer : npm.cmd install -D vitest supertest @vitest/coverage-v8");
console.log("Verifier : npm.cmd run check ; npm.cmd test ; npm.cmd run test:coverage");
