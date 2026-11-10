import { NextResponse } from "next/server";
import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { plannerItems } from "@/db/schema";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** RFC 5545 text escaping. */
function escapeText(value: string): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** Fold content lines at 75 octets so strict calendar clients accept them. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  let limit = 75;
  while (rest.length > limit) {
    parts.push(rest.slice(0, limit));
    rest = rest.slice(limit);
    limit = 74; // continuation lines start with a single space
  }
  parts.push(rest);
  return parts.join("\r\n ");
}

function stamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`;
}

/**
 * Calendar export for the signed-in user's own planner entries.
 *
 * The ICS carries a DISPLAY VALARM, so the operating-system calendar raises
 * the reminder even when this website is closed — the only reliable way to
 * ring on a desktop at a planned time. The UID is stable per item, so
 * re-importing updates existing entries instead of duplicating them.
 */
export const GET = handle(async () => {
  const me = await requireUser("planner.read");
  const since = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const rows = await db
    .select()
    .from(plannerItems)
    .where(and(eq(plannerItems.ownerId, me.id), gte(plannerItems.startsAt, since)))
    .orderBy(asc(plannerItems.startsAt))
    .limit(500);

  const now = new Date();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MR.HOME Real Estate//Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:MR.HOME Planner",
    "X-WR-TIMEZONE:UTC",
  ];

  for (const row of rows) {
    const start = new Date(row.startsAt);
    const end = row.endsAt ? new Date(row.endsAt) : new Date(start.getTime() + (row.kind === "meeting" ? 30 : 15) * 60_000);
    const reminder = row.reminderAt ? new Date(row.reminderAt) : start;
    const leadMinutes = Math.max(0, Math.round((start.getTime() - reminder.getTime()) / 60_000));
    const description = [row.notes, row.alarmEnabled ? `Alarm: ${row.sound}` : "No sound alarm for this entry"].filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:planner-${row.id}@mrhomerealestate.com`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeText(row.title)}`,
      `DESCRIPTION:${escapeText(description)}`,
      `CATEGORIES:${row.kind === "meeting" ? "Meeting" : "To-do"}`,
      `STATUS:${row.done ? "COMPLETED" : "CONFIRMED"}`,
    );
    if (row.alarmEnabled) {
      lines.push(
        "BEGIN:VALARM",
        `TRIGGER:-PT${leadMinutes}M`,
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeText(`MR.HOME reminder: ${row.title}`)}`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  const body = `${lines.map(fold).join("\r\n")}\r\n`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="mrh-planner.ics"',
      "cache-control": "private, no-store",
    },
  });
});
