import "server-only";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import type { SafeUser } from "./auth";
import { getCurrentUser as getUser } from "./auth";

/** Persist an audit log entry. Never throws: logging must not break API flows. */
export async function audit(opts: {
  user?: SafeUser | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}) {
  try {
    await db.insert(auditLogs).values({
      userId: opts.user?.id ?? null,
      userEmail: opts.user?.email ?? null,
      action: opts.action,
      entity: opts.entity,
      entityId: opts.entityId != null ? String(opts.entityId) : null,
      metadata: opts.metadata ?? null,
      ip: opts.ip ?? null,
    });
  } catch (e) {
    console.error("[audit] failed", e);
  }
}

export async function withAuditWrapper<T>(fn: (db: typeof import("@/db").db) => Promise<T>): Promise<T> {
  return fn(db);
}

/** Snapshot marker recorded on page save/restore (kept for page-builder flows). */
export async function auditPageSnapshot(pageId: number, action: "save" | "restore"): Promise<void> {
  const user = await getUser();
  await audit({
    user,
    action: `page.${action}`,
    entity: "pages",
    entityId: pageId,
    metadata: { at: new Date().toISOString() },
  });
}
