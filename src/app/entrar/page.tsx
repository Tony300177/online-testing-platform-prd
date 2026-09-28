import { redirect } from "next/navigation";

/**
 * Atalho para a tela de acesso do aluno.
 *
 * Sem dominio proprio (o DNS de juina.mt.gov.br nao e nosso), o link que
 * circula em QR Code e papel fica preso ao nome do deploy no Vercel. Esta
 * rota compra um caminho que uma crianca sabe ler em voz alta, para servir
 * de link unico: professor imprime, aluno digita.
 *
 * So redireciona: a tela de login continua sendo /aluno, que e a rota
 * citada nos materiais impressos e nos QR Codes ja distribuiidos.
 */
export default function EntrarPage() {
  redirect("/aluno");
}
