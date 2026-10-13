import dotenv from "dotenv";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
dotenv.config({ path: path.join(import.meta.dirname, "..", ".env") });
const prisma = new PrismaClient();
export default prisma;
