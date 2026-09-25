import { config as carregarEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// O drizzle-kit nao le .env.local sozinho; sem isto o config so acha a variavel
// se ela ja estiver exportada no shell.
carregarEnv({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL nao definida. Copie .env.example para .env.local ou exporte a variavel antes de rodar o drizzle-kit."
  );
}

/**
 * A credencial fica em .env.local (ignorado pelo git), nunca no config.
 * Antes desta configuracao o arquivo JSON trazia a connection string do banco
 * de producao commitada no git.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
});
