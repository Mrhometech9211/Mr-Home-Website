import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser, userCan } from "@/lib/auth";
import { getPublishedProjects } from "@/lib/content";
import { BrochuresManager } from "@/components/admin/BrochuresManager";

export const dynamic = "force-dynamic";

export default async function BrochuresPage() {
  const user = await getCurrentUser();
  if (!userCan(user, "brochures.read")) redirect("/admin");
  const projects = await getPublishedProjects();
  return (
    <Suspense fallback={<div className="skeleton h-96 rounded-2xl" />}>
      <BrochuresManager
        canWrite={userCan(user, "brochures.write")}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      />
    </Suspense>
  );
}
