import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  // "session" is managed by connect-pg-simple, not Drizzle
  tablesFilter: ["!session"],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
