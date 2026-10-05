import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { config } from "../config.js";

if (!config.databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const adapter = new PrismaPg({
  connectionString: config.databaseUrl,
});

export const prisma = new PrismaClient({ adapter });
