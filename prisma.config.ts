import { defineConfig } from "@prisma/config";
import { config } from "dotenv";

// Prisma 7 does not auto-load .env, so load it before reading DATABASE_URL.
config({ path: ".env" });

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
