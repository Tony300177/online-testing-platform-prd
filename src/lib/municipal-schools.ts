export type MunicipalSchool = { numero: number; nome: string };

export const ESCOLAS_MUNICIPAIS: MunicipalSchool[] = [
  { numero: 1, nome: "CENTRO DE EDUCAÇÃO INFANTIL ARCO IRIS" },
  { numero: 2, nome: "CENTRO DE EDUCAÇÃO INFANTIL BRUNO LEONARDO DA COSTA CAMPOS" },
  { numero: 3, nome: "CENTRO DE EDUCAÇÃO INFANTIL CRIANÇA FELIZ" },
  { numero: 4, nome: "CENTRO DE EDUCAÇÃO INFANTIL DOM FRANCO DALLA VALLE" },
  { numero: 5, nome: "CENTRO DE EDUCAÇÃO INFANTIL LUIZ FELIPE MARTINS MARQUES LUIZ" },
  { numero: 6, nome: "CENTRO DE EDUCAÇÃO INFANTIL MENINO JESUS" },
  { numero: 7, nome: "CENTRO DE EDUCAÇÃO INFANTIL NOSSO LAR" },
  { numero: 8, nome: "CENTRO DE EDUCAÇÃO MUNICIPAL DR. GUILHERME FREITAS DE ABREU LIMA" },
  { numero: 9, nome: "CENTRO DE EDUCAÇÃO MUNICIPAL PROFESSOR ORLANDO PEREIRA" },
  { numero: 10, nome: "CENTRO DE EDUCAÇÃO MUNICIPAL SÃO CRISTÓVÃO" },
  { numero: 11, nome: "CENTRO DE EDUCAÇÃO MUNICIPAL VASCO PAPA" },
  { numero: 12, nome: "ESCOLA MUNICIPAL PADRE JOSÉ DE ANCHIETA" },
  { numero: 13, nome: "ESCOLA MUNICIPAL PAULO FREIRE" },
  { numero: 14, nome: "ESCOLA MUNICIPAL PROFESSORA MARIA HILDA PANAS" },
  { numero: 15, nome: "ESCOLA MUNICIPAL RURAL EUCLIDES DA CUNHA" },
  { numero: 16, nome: "ESCOLA MUNICIPAL VINICIUS DE MORAES" },
  { numero: 17, nome: "ESCOLA RURAL MUNICIPAL ALVARES DE AZEVEDO" },
  { numero: 18, nome: "ESCOLA RURAL MUNICIPAL CORA CORALINA" },
  { numero: 19, nome: "ESCOLA RURAL MUNICIPAL OSVALDO CRUZ" },
];

export function escolaLabel(ec: MunicipalSchool): string {
  return `${String(ec.numero).padStart(2, "0")} | ${ec.nome}`;
}