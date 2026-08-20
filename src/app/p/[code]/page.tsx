import ExamPlayer from "@/components/student/exam-player";

/** Rota curta da prova: /p/CODIGO (link curto de acesso). */
export default async function ShortProvaPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ExamPlayer code={code} />;
}