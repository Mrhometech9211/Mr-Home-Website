import { notFound } from "next/navigation";
import { getCurrentUser, userCan } from "@/lib/auth";
import { ProjectSectionsEditor } from "@/components/admin/ProjectSectionsEditor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Project page sections" };

export default async function ProjectSectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!userCan(user, "projects.read")) notFound();
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <ProjectSectionsEditor
      projectId={id}
      canWrite={userCan(user, "projects.write")}
      canPublish={userCan(user, "projects.publish")}
    />
  );
}
