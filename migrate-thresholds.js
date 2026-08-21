const { Pool } = require("pg");
const p = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, allowExitOnIdle: true });
(async () => {
  await p.query(`
    CREATE TABLE IF NOT EXISTS desempenho_thresholds (
      id SERIAL PRIMARY KEY,
      escola_id UUID REFERENCES escolas(id) ON DELETE CASCADE,
      verde_min INTEGER NOT NULL DEFAULT 80,
      amarelo_min INTEGER NOT NULL DEFAULT 60,
      laranja_min INTEGER NOT NULL DEFAULT 40,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS thresholds_escola_unique ON desempenho_thresholds(escola_id);
    CREATE INDEX IF NOT EXISTS thresholds_escola_idx ON desempenho_thresholds(escola_id);
  `);
  console.log("OK: table desempenho_thresholds created");
  await p.end();
})().catch(e => { console.error(e.message); p.end(); });