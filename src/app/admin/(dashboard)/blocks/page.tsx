import { notFound } from "next/navigation";
import { getCurrentUser, userCan } from "@/lib/auth";
import { BlocksManager } from "@/components/admin/BlocksManager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reusable blocks" };

export default async function BlocksPage() {
  const user = await getCurrentUser();
  if (!userCan(user, "content.read")) notFound();
  return <BlocksManager canWrite={userCan(user, "content.write")} />;
}
