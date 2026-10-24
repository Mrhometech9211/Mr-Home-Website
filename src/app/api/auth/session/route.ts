import { cookies } from "next/headers";
import { getCurrentUser, rotateSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { getIp, handle, json } from "@/lib/api";
import { ROLE_PERMISSIONS } from "@/lib/permissions";

/** Session heartbeat: returns the current user and rotates the session token periodically. */
export const GET = handle(async (req) => {
  const user = await getCurrentUser();
  if (!user) return json({ user: null }, { status: 401 });
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const rotated = await rotateSession(token, { ip: getIp(req), userAgent: req.headers.get("user-agent") });
    if (rotated) store.set(SESSION_COOKIE, rotated.token, sessionCookieOptions(rotated.expiresAt));
  }
  return json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.role === "CUSTOM" ? (user.effectivePermissions ?? []) : ROLE_PERMISSIONS[user.role] } });
});
