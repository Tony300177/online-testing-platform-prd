import ExamPlayer from "@/components/student/exam-player";

export default async function ProvaPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ExamPlayer code={code} />;
}
