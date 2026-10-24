import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "crypto";
import { promisify } from "util";
import { and, eq, gt, lt } from "drizzle-orm";
import { db, initDb } from "@/db";
import { customRoles, sessions, users, type Role, type User } from "@/db/schema";
import { effectiveHas, hasPermission, type Permission } from "./permissions";
import { ApiError } from "./api";

const scrypt = promisify(scryptCb);
export const SESSION_COOKIE = "mrh_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const ROTATE_AFTER_MS = 1000 * 60 * 60 * 12; // rotate token every 12h of activity

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  };
}

export async function createSession(userId: number, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt, ip: meta.ip ?? null, userAgent: meta.userAgent ?? null });
  // opportunistic cleanup of expired sessions
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return { token, expiresAt };
}

export async function rotateSession(oldToken: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const row = await db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(oldToken))).limit(1);
  if (!row[0]) return null;
  if (Date.now() - new Date(row[0].lastRotatedAt).getTime() < ROTATE_AFTER_MS) return null;
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db
    .update(sessions)
    .set({ tokenHash: hashToken(token), expiresAt, lastRotatedAt: new Date(), ip: meta.ip ?? row[0].ip, userAgent: meta.userAgent ?? row[0].userAgent })
    .where(eq(sessions.id, row[0].id));
  return { token, expiresAt };
}

export async function destroySession(token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function destroyAllUserSessions(userId: number) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export type SafeUser = Omit<User, "passwordHash"> & { effectivePermissions?: string[] | null };

/**
 * Effective permission check that honours custom roles (Phase 6).
 * `user.effectivePermissions` is populated by getCurrentUser for CUSTOM-role users.
 */
function can(user: SafeUser, permission: Permission): boolean {
  const role = user.role as Role;
  return effectiveHas(role, permission, user.effectivePermissions ?? null);
}

export const getCurrentUser = cache(async (): Promise<SafeUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    await initDb(); // no-op after first call
    const rows = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
      .limit(1);
    const u = rows[0]?.user;
    if (!u || !u.active) return null;
    // Custom roles load their granular permission set from custom_roles.
    let effectivePermissions: string[] | null = null;
    if (u.role === "CUSTOM") {
      if (u.customRoleId != null) {
        const roleRows = await db.select({ permissions: customRoles.permissions }).from(customRoles).where(eq(customRoles.id, u.customRoleId)).limit(1);
        effectivePermissions = Array.isArray(roleRows[0]?.permissions) ? (roleRows[0]!.permissions as string[]) : [];
      } else {
        effectivePermissions = [];
      }
    }
    const { passwordHash: _ph, ...safe } = u;
    void _ph;
    return Object.assign(safe, { effectivePermissions });
  } catch {
    return null;
  }
});

export async function requireUser(permission?: Permission): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Authentication required");
  if (permission && !can(user, permission)) throw new ApiError(403, "You do not have permission to perform this action");
  return user;
}

export function userCan(user: SafeUser | null, permission: Permission) {
  if (!user) return false;
  const role = user.role as Role;
  if (role === "CUSTOM") return effectiveHas(role, permission, user.effectivePermissions ?? null);
  return hasPermission(role, permission);
}

export async function hasAnyUsers() {
  await initDb(); // no-op after first call
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  return rows.length > 0;
}
