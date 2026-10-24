import { PageEditor } from "@/components/admin/PageEditor";

export default function NewPageHost() {
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <PageEditor pageId={0} />
    </div>
  );
}
