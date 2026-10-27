import { notFound, redirect } from "next/navigation";
import { getCurrentUser, userCan } from "@/lib/auth";
import { RESOURCES } from "@/lib/resources";
import { ResourceForm } from "@/components/admin/ResourceForm";

export const dynamic = "force-dynamic";

export default async function ResourceEditPage({ params }: { params: Promise<{ resource: string; id: string }> }) {
  const { resource, id } = await params;
  const def = RESOURCES[resource];
  if (!def || def.readOnly) notFound();
  const user = await getCurrentUser();
  if (!userCan(user, def.read)) redirect("/admin");
  const numeric = id === "new" ? "new" : parseInt(id, 10);
  if (numeric !== "new" && Number.isNaN(numeric)) notFound();
  if (numeric === "new" && !userCan(user, def.write)) redirect(`/admin/${resource}`);
  return (
    <div className="mx-auto max-w-5xl space-y-3">
      {resource === "projects" && numeric !== "new" && (
        <a
          href={`/admin/projects/${numeric}/sections`}
          className="flex items-center justify-between gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-[13px] font-medium text-ink hover:border-brand"
        >
          <span>
            Visual page sections
            <span className="ml-2 text-[12px] font-normal text-mist">Reorder, restyle or replace this project&apos;s body content</span>
          </span>
          <span className="text-brand">Open →</span>
        </a>
      )}
      <ResourceForm resourceKey={resource} id={numeric} canWrite={userCan(user, def.write)} />
    </div>
  );
}
