import { redirect } from "next/navigation";
import { getCurrentUser, userCan } from "@/lib/auth";
import { PlannerManager } from "@/components/admin/PlannerManager";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const user = await getCurrentUser();
  if (!userCan(user, "planner.read")) redirect("/admin");
  return <PlannerManager canWrite={userCan(user, "planner.write")} />;
}
