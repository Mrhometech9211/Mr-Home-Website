import { notFound } from "next/navigation";
import { getCurrentUser, userCan } from "@/lib/auth";
import { ContentSectionsEditor } from "@/components/admin/ContentSectionsEditor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Article page layout" };

export default async function NewsSectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!userCan(user, "news.read")) notFound();
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <ContentSectionsEditor
      kind="news"
      id={id}
      canWrite={userCan(user, "news.write")}
      canPublish={userCan(user, "news.publish")}
    />
  );
}
