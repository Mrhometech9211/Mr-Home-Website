import { notFound } from "next/navigation";
import { getCurrentUser, userCan } from "@/lib/auth";
import { ContentSectionsEditor } from "@/components/admin/ContentSectionsEditor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Market page layout" };

export default async function MarketSectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!userCan(user, "markets.read")) notFound();
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return (
    <ContentSectionsEditor
      kind="market"
      id={id}
      canWrite={userCan(user, "markets.write")}
      canPublish={userCan(user, "markets.publish")}
    />
  );
}
