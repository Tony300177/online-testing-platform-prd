import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { APP_TZ } from "@/lib/datetime";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    max: 2,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: true,
    // Sem isto a sessao usa o TimeZone do host (Supabase = UTC) e qualquer
    // `::date`/`now()` sem fuso explicito passa a depender da maquina.
    options: `-c timezone=${APP_TZ}`,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool, { schema });
