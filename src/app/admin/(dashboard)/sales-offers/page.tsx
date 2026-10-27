import { redirect } from "next/navigation";
import { getCurrentUser, userCan } from "@/lib/auth";
import { SalesOffersManager } from "@/components/admin/SalesOffersManager";

export const dynamic = "force-dynamic";

export default async function SalesOffersPage() {
  const user = await getCurrentUser();
  if (!userCan(user, "offers.read")) redirect("/admin");
  return <SalesOffersManager canWrite={userCan(user, "offers.write")} />;
}
