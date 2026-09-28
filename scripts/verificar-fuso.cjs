/**
 * Verifica que o fuso da plataforma esta ancorado de ponta a ponta.
 *
 *   node scripts/verificar-fuso.cjs
 *
 * Cobre:
 *   1. round-trip zonedTimeToUtc -> toLocalInputValue em APP_TZ, inclusive nas
 *      fronteiras de mes/ano e em virada de dia;
 *   2. parseLocalInput aceitando hora de parede crua e ISO com offset;
 *   3. limites de dia de dayBoundsUtc;
 *   4. sessao Postgres com o TimeZone esperado e `::date` sem deslocamento;
 *   5. ausencia dos padroes de bug (new Date(cru) e getters locais) nos
 *      arquivos que ingerem ou exibem janelas de prova.
 *
 * Nao usa framework de teste: so `node:assert`, como o resto dos scripts.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.local" });

const APP_TZ = "America/Cuiaba";
const RAIZ = path.join(__dirname, "..");

/**
 * O modulo de fuso e TypeScript, com o "@/" que o Next resolve. Para este
 * script espelhamos as funcoes em JS puro: sao ~40 linhas e evita adicionar
 * um runner de TypeScript so para isto.
 */
const C = { reset: "\u001b[0m", bold: "\u001b[1m", green: "\u001b[32m", red: "\u001b[31m", cyan: "\u001b[36m" };

let passou = 0;
const falhas = [];

function teste(nome, fn) {
  try {
    fn();
    passou++;
    console.log(`  ${C.green}ok${C.reset}   ${nome}`);
  } catch (err) {
    falhas.push({ nome, err });
    console.log(`  ${C.red}FALHA${C.reset} ${nome}\n         ${err.message}`);
  }
}

// ---------------------------------------------------------------- espelho ---
const PROBE = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function wallClock(d) {
  const o = {};
  for (const p of PROBE.formatToParts(d)) {
    if (p.type === "year") o.y = +p.value;
    else if (p.type === "month") o.mo = +p.value;
    else if (p.type === "day") o.d = +p.value;
    else if (p.type === "hour") o.h = +p.value;
    else if (p.type === "minute") o.mi = +p.value;
    else if (p.type === "second") o.s = +p.value;
  }
  return { y: o.y, mo: o.mo, d: o.d, h: (o.h ?? 0) % 24, mi: o.mi ?? 0, s: o.s ?? 0 };
}

function offsetMs(instant) {
  const w = wallClock(instant);
  return (
    Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(instant.getTime() / 1000) * 1000
  );
}

function zonedTimeToUtc(y, mo, d, h = 0, mi = 0, s = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = offsetMs(new Date(guess));
  return new Date(guess - offsetMs(new Date(guess - first)));
}

const p2 = (n) => String(n).padStart(2, "0");

function toLocalInputValue(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const w = wallClock(d);
  return `${w.y}-${p2(w.mo)}-${p2(w.d)}T${p2(w.h)}:${p2(w.mi)}`;
}

function ymdToDate(y, mo, d) {
  return zonedTimeToUtc(y, mo, d, 0, 0, 0);
}

const NAIVE_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
const NAIVE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function parseLocalInput(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  if (!HAS_OFFSET.test(s)) {
    const n = NAIVE_DATETIME.exec(s);
    if (n) return zonedTimeToUtc(+n[1], +n[2], +n[3], +n[4], +n[5], n[6] ? +n[6] : 0);
    const b = NAIVE_DATE.exec(s);
    if (b) return ymdToDate(+b[1], +b[2], +b[3]);
  }
  const p = new Date(s);
  return Number.isNaN(p.getTime()) ? null : p;
}

function dayBoundsUtc(day) {
  const m = NAIVE_DATE.exec(day.trim());
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  return { start: ymdToDate(y, mo, d), endExclusive: ymdToDate(y, mo, d + 1) };
}

// ------------------------------------------------------------------ testes ---
console.log(`\n${C.bold}${C.cyan}Fuso alvo: ${APP_TZ}${C.reset}`);

const CASOS = [
  [2026, 3, 10, 14, 30],
  [2026, 1, 1, 0, 0],
  [2026, 12, 31, 23, 59],
  [2026, 2, 28, 18, 0],
  [2026, 3, 1, 7, 5],
  [2026, 7, 15, 12, 0],
];

console.log(`\n${C.bold}1. round-trip hora de parede -> instante -> hora de parede${C.reset}`);
for (const [y, mo, d, h, mi] of CASOS) {
  const esperado = `${y}-${p2(mo)}-${p2(d)}T${p2(h)}:${p2(mi)}`;
  teste(`round-trip ${esperado}`, () => {
    assert.equal(toLocalInputValue(zonedTimeToUtc(y, mo, d, h, mi)), esperado);
  });
}

console.log(`\n${C.bold}2. offset real de America/Cuiaba${C.reset}`);
teste("14:30 em Cuiabá = 18:30 UTC (UTC-4, sem horario de verao)", () => {
  const d = zonedTimeToUtc(2026, 3, 10, 14, 30);
  assert.equal(d.toISOString(), "2026-03-10T18:30:00.000Z");
});
teste("Cuiaba e UTC-4 durante o horario de verao brasileiro", () => {
  assert.equal(zonedTimeToUtc(2026, 12, 15, 12, 0).toISOString(), "2026-12-15T16:00:00.000Z");
});
teste("offset unico: sem transicao ao longo do ano", () => {
  const offsets = new Set();
  for (let m = 1; m <= 12; m++) offsets.add(offsetMs(zonedTimeToUtc(2026, m, 15, 12, 0)));
  assert.equal(offsets.size, 1);
});

console.log(`\n${C.bold}3. parseLocalInput${C.reset}`);
teste("hora de parede crua vira o instante correto em APP_TZ", () => {
  assert.equal(parseLocalInput("2026-03-10T14:30").toISOString(), "2026-03-10T18:30:00.000Z");
});
teste("ISO com Z respeita o offset declarado", () => {
  assert.equal(parseLocalInput("2026-03-10T18:30:00.000Z").toISOString(), "2026-03-10T18:30:00.000Z");
});
teste("ISO com -04:00 respeita o offset declarado", () => {
  assert.equal(parseLocalInput("2026-03-10T14:30:00-04:00").toISOString(), "2026-03-10T18:30:00.000Z");
});
teste("data nua vira meia-noite em APP_TZ", () => {
  assert.equal(parseLocalInput("2026-03-10").toISOString(), "2026-03-10T04:00:00.000Z");
});
teste("lixo devolve null", () => {
  assert.equal(parseLocalInput("amanha"), null);
  assert.equal(parseLocalInput(""), null);
  assert.equal(parseLocalInput(null), null);
});
teste("os dois caminhos do wizard produzem o mesmo instante", () => {
  // Este e o bug que fazia prova e aplicacao divergirem 4 horas.
  assert.equal(
    parseLocalInput("2026-03-10T14:30").getTime(),
    parseLocalInput(new Date("2026-03-10T14:30").toISOString()).getTime()
  );
});

console.log(`\n${C.bold}4. limites de dia${C.reset}`);
teste("dia 10/03/2026 comeca as 04:00Z e termina as 04:00Z do dia 11", () => {
  const b = dayBoundsUtc("2026-03-10");
  assert.equal(b.start.toISOString(), "2026-03-10T04:00:00.000Z");
  assert.equal(b.endExclusive.toISOString(), "2026-03-11T04:00:00.000Z");
});
teste("virada de ano", () => {
  const b = dayBoundsUtc("2026-12-31");
  assert.equal(b.start.toISOString(), "2026-12-31T04:00:00.000Z");
  assert.equal(b.endExclusive.toISOString(), "2027-01-01T04:00:00.000Z");
});
teste("ultimo dia do mes", () => {
  const b = dayBoundsUtc("2026-02-28");
  assert.equal(b.endExclusive.toISOString(), "2026-03-01T04:00:00.000Z");
});

console.log(`\n${C.bold}5. padroes de bug ausentes no codigo${C.reset}`);
const VERIFICADOS = [
  "src/lib/exam-validation.ts",
  "src/lib/utils.ts",
  "src/lib/aluno-import.ts",
  "src/lib/habilidades-stats.ts",
  "src/lib/exports.ts",
  "src/app/api/admin/aplicacoes/route.ts",
  "src/app/api/exams/[id]/route.ts",
  "src/app/professor/exames/[id]/editar/page.tsx",
  "src/components/exam-form.tsx",
  "src/components/admin/criar-avaliacao-wizard.tsx",
  "src/components/admin/nova-aplicacao-wizard.tsx",
];
const PROIBIDOS = [
  { re: /getFullYear\(\)|getMonth\(\)|getHours\(\)|getDate\(\)/, msg: "getter local (depende do fuso do processo)" },
  { re: /new Date\((?:body|fd\.get|value|s|str)\b/, msg: "new Date(string) crua" },
  { re: /toLocaleString\("pt-BR"\)/, msg: "toLocaleString sem timeZone" },
];
for (const arq of VERIFICADOS) {
  const alvo = path.join(RAIZ, arq);
  if (!fs.existsSync(alvo)) continue;
  const src = fs.readFileSync(alvo, "utf8");
  for (const { re, msg } of PROIBIDOS) {
    teste(`${arq} sem ${msg}`, () => {
      const linha = src.split(/\r?\n/).findIndex((l) => re.test(l));
      assert.equal(
        linha,
        -1,
        `encontrado na linha ${linha + 1}: ${src.split(/\r?\n/)[linha]?.trim()}`
      );
    });
  }
}

teste("utils.ts nao formata data fora de datetime.ts", () => {
  const src = fs.readFileSync(path.join(RAIZ, "src/lib/utils.ts"), "utf8");
  assert.ok(!/Intl\.DateTimeFormat/.test(src), "utils.ts ainda cria formatter próprio");
  assert.ok(/export \{ formatDate/.test(src), "utils.ts deveria reexportar de datetime.ts");
});

teste("db/index.ts ancora a sessao Postgres", () => {
  const src = fs.readFileSync(path.join(RAIZ, "src/db/index.ts"), "utf8");
  assert.ok(/options: `-c timezone=\$\{APP_TZ\}`/.test(src), "Pool sem options de timezone");
});

teste("schema.ts usa mode string em data_nascimento", () => {
  const src = fs.readFileSync(path.join(RAIZ, "src/db/schema.ts"), "utf8");
  const l = src.split(/\r?\n/).find((l) => l.includes("data_nascimento"));
  assert.ok(l.includes('mode: "string"'), `encontrado: ${l?.trim()}`);
});

// ------------------------------------------------------------------- banco ---
console.log(`\n${C.bold}6. sessao Postgres${C.reset}`);
async function verificarBanco() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(`  ${C.cyan}pulado${C.reset} DATABASE_URL ausente`);
    return;
  }
  const client = new Client({ connectionString: databaseUrl, options: `-c timezone=${APP_TZ}` });
  try {
    await client.connect();
    const { rows: tz } = await client.query("SHOW TimeZone");
    teste("SHOW TimeZone devolve America/Cuiaba", () => {
      assert.equal(tz[0].TimeZone, APP_TZ);
    });
    const { rows: d } = await client.query(
      "SELECT '2026-03-10'::date::text AS d, ('2026-03-10T04:00:00Z'::timestamptz)::date::text AS via_ts"
    );
    teste("date civil nao sofre deslocamento de fuso", () => {
      assert.equal(d[0].d, "2026-03-10");
    });
    teste("timestamptz no inicio do dia em APP_TZ cai no dia certo", () => {
      assert.equal(d[0].via_ts, "2026-03-10");
    });
    const { rows: p } = await client.query(
      "SELECT now() > now() AT TIME ZONE 'UTC' AS ok"
    );
    teste("now() coerente", () => assert.equal(p[0].ok, true));
  } finally {
    await client.end().catch(() => {});
  }
}

// ------------------------------------------------------------------ resumo ---
(async () => {
  await verificarBanco();

  console.log(`\n${C.bold}${"=".repeat(60)}${C.reset}`);
  if (falhas.length === 0) {
    console.log(`${C.green}${C.bold}${passou} verificacao(oes) passaram.${C.reset}`);
    process.exit(0);
  }
  console.log(`${C.red}${C.bold}${falhas.length} falha(s) de ${passou + falhas.length}:${C.reset}`);
  for (const f of falhas) console.log(`  - ${f.nome}`);
  process.exit(1);
})().catch((err) => {
  console.error(`${C.red}${err.message}${C.reset}`);
  process.exit(1);
});
