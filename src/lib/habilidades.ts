export type HabilidadeCategoria = "vigente" | "sensivel" | "preditora";
export type Disciplina = "LÍNGUA PORTUGUESA" | "MATEMÁTICA";

export type Habilidade = {
  codigo: string;
  categoria: HabilidadeCategoria;
};

const LP_VIGENTE = [
  "EF35LP21","EF35LP22","EF35LP23","EF35LP24","EF35LP25","EF35LP26","EF35LP27",
  "EF35LP28","EF35LP29","EF35LP30","EF35LP31","EF05LP28","EF05LP22","EF05LP23",
  "EF35LP17","EF05LP24","EF05LP25","EF35LP18","EF35LP19","EF35LP20","EF05LP26",
  "EF05LP27","EF05LP15","EF05LP16","EF05LP17","EF35LP15","EF05LP18","EF05LP19",
  "EF35LP16","EF05LP20","EF05LP21","EF05LP10","EF05LP11","EF05LP12","EF05LP13",
  "EF05LP14","EF35LP01","EF35LP02","EF35LP03","EF35LP04","EF35LP05","EF35LP06",
  "EF35LP07","EF35LP08","EF35LP09","EF35LP10","EF35LP11","EF35LP12","EF05LP01",
  "EF35LP13","EF05LP02","EF05LP03","EF05LP04","EF05LP05","EF05LP06","EF35LP14",
  "EF05LP07","EF05LP08","EF15LP15","EF15LP16","EF15LP17","EF15LP18","EF15LP19",
  "EF15LP14","EF15LP01","EF15LP02","EF15LP03","EF15LP04","EF15LP05","EF15LP06",
  "EF15LP07","EF15LP08","EF15LP09","EF15LP10","EF15LP11","EF15LP12","EF15LP13",
];

const LP_SENSEL = [
  "EF04LP25","EF04LP26","EF04LP25","EF04LP19","EF04LP20","EF04LP21","EF04LP22",
  "EF04LP23","EF04LP24","EF04LP14","EF04LP15","EF04LP16","EF04LP17","EF04LP18",
  "EF04LP09","EF05LP09","EF04LP10","EF04LP11","EF04LP12","EF04LP13","EF04LP01",
  "EF04LP02","EF04LP03","EF04LP04","EF04LP05","EF04LP06","EF04LP07","EF04LP08",
];

const LP_PREDITORA = [
  "EF03LP27","EF03LP24","EF03LP25","EF03LP26","EF03LP18","EF03LP19","EF03LP20",
  "EF03LP21","EF03LP22","EF03LP23","EF03LP11","EF03LP12","EF03LP13","EF03LP14",
  "EF03LP15","EF03LP16","EF03LP01","EF03LP02","EF03LP03","EF03LP04","EF03LP05",
  "EF03LP06","EF03LP07","EF03LP08","EF03LP09","EF03LP10","EF03LP17",
];

const MA_VIGENTE = [
  "EF05MA01","EF05MA02","EF05MA03","EF05MA04","EF05MA05","EF05MA06","EF05MA07",
  "EF05MA08","EF05MA09","EF05MA10","EF05MA11","EF05MA12","EF05MA13","EF05MA14",
  "EF05MA15","EF05MA16","EF05MA17","EF05MA18","EF05MA19","EF05MA20","EF05MA21",
  "EF05MA22","EF05MA23","EF05MA24","EF05MA25",
];

const MA_SENSEL = [
  "EF04MA01","EF04MA02","EF04MA03","EF04MA04","EF04MA05","EF04MA06","EF04MA07",
  "EF04MA08","EF04MA09","EF04MA10","EF04MA11","EF04MA12","EF04MA13","EF04MA14",
  "EF04MA15","EF04MA16","EF04MA17","EF04MA18","EF04MA19","EF04MA20","EF04MA21",
  "EF04MA22","EF04MA23","EF04MA24","EF04MA25","EF04MA26","EF04MA27","EF04MA28",
];

const MA_PREDITORA = [
  "EF03MA01","EF03MA02","EF03MA03","EF03MA04","EF03MA05","EF03MA06","EF03MA07",
  "EF03MA08","EF03MA09","EF03MA10","EF03MA11","EF03MA12","EF03MA13","EF03MA14",
  "EF03MA15","EF03MA16","EF03MA17","EF03MA18","EF03MA19","EF03MA20","EF03MA21",
  "EF03MA22","EF03MA23","EF03MA24","EF03MA25","EF03MA26","EF03MA27","EF03MA28",
];

function build(codes: string[], categoria: HabilidadeCategoria): Habilidade[] {
  const seen = new Set<string>();
  return codes.filter((c) => {
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  }).map((codigo) => ({ codigo, categoria }));
}

export const HABILIDADES: Record<Disciplina, Habilidade[]> = {
  "LÍNGUA PORTUGUESA": [
    ...build(LP_VIGENTE, "vigente"),
    ...build(LP_SENSEL, "sensivel"),
    ...build(LP_PREDITORA, "preditora"),
  ],
  "MATEMÁTICA": [
    ...build(MA_VIGENTE, "vigente"),
    ...build(MA_SENSEL, "sensivel"),
    ...build(MA_PREDITORA, "preditora"),
  ],
};

export const CATEGORIA_LABEL: Record<HabilidadeCategoria, string> = {
  vigente: "Vigente (5º Ano)",
  sensivel: "Sensível (4º Ano)",
  preditora: "Preditora (3º Ano)",
};

export function getHabilidadesPorDisciplina(disciplina: Disciplina): Habilidade[] {
  return HABILIDADES[disciplina] ?? [];
}

export function getHabilidadesPorCategoria(disciplina: Disciplina, categoria: HabilidadeCategoria): Habilidade[] {
  return getHabilidadesPorDisciplina(disciplina).filter((h) => h.categoria === categoria);
}
