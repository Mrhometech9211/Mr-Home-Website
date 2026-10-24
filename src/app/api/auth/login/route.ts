import { z } from "zod";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, SESSION_COOKIE, sessionCookieOptions, verifyPassword } from "@/lib/auth";
import { getIp, handle, json, readJson } from "@/lib/api";
import { clearLoginFailures, loginLockStatus, recordLoginFailure } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";


const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

export const POST = handle(async (req) => {
  const ip = getIp(req);
  const data = schema.parse(await readJson(req));
  const key = `${ip}:${data.email}`;
  const lock = loginLockStatus(key);
  if (lock.locked) return json({ error: `Too many failed attempts. Try again in ${Math.ceil(lock.retryAfter / 60)} minute(s).` }, { status: 429, headers: { "Retry-After": String(lock.retryAfter) } });

  const rows = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
  const user = rows[0];
  const ok = user ? await verifyPassword(data.password, user.passwordHash) : await verifyPassword(data.password, "scrypt$00$00"); // constant-time-ish
  if (!user || !ok || !user.active) {
    recordLoginFailure(key);
    await audit({ action: "auth.login_failed", entity: "user", entityId: user?.id ?? null, metadata: { email: data.email }, ip });
    const remaining = Math.max(0, 5 - loginLockStatus(key).failures);
    return json({ error: !user || !ok ? `Invalid email or password.${remaining ? ` ${remaining} attempt(s) remaining.` : ""}` : "This account is deactivated." }, { status: 401 });
  }
  clearLoginFailures(key);
  const { token, expiresAt } = await createSession(user.id, { ip, userAgent: req.headers.get("user-agent") });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  const { passwordHash: _p, ...safe } = user;
  void _p;
  await audit({ user: safe, action: "auth.login", entity: "user", entityId: user.id, ip });
  return json({ ok: true, user: { id: safe.id, name: safe.name, email: safe.email, role: safe.role } });
});
