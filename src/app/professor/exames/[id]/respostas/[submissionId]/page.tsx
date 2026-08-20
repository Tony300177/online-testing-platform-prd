import SubmissionDetail from "@/components/submission-detail";

export default async function TeacherSubmissionPage({
  params,
}: {
  params: Promise<{ id: string; submissionId: string }>;
}) {
  const { id, submissionId } = await params;
  return (
    <SubmissionDetail submissionId={Number(submissionId)} backHref={`/professor/exames/${id}`} />
  );
}
