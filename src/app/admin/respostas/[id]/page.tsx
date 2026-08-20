import SubmissionDetail from "@/components/submission-detail";

export default async function AdminSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubmissionDetail submissionId={Number(id)} backHref="/admin/respostas" />;
}
