import { PageEditor } from "@/components/admin/PageEditor";

export default async function PageEditorHost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <PageEditor pageId={Number(id)} />
    </div>
  );
}
