import { getCurrentUser, userCan } from "@/lib/auth";
import { redirect } from "next/navigation";
import { RolesManager } from "@/components/admin/RolesManager";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (!userCan(user, "roles.read")) redirect("/admin");
  return (
    <div className="mx-auto max-w-5xl">
      <RolesManager canWrite={userCan(user, "roles.write")} isSuperAdmin={user.role === "SUPER_ADMIN"} myPermissions={user.effectivePermissions ?? null} />
    </div>
  );
}
