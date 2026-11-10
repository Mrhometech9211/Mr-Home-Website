"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Bell, CalendarDays, Check, Volume2 } from "lucide-react";
import {
  PLANNER_TEST_EVENT,
  NOTIFY_KEY,
  SOUND_KEY,
  alreadyFired,
  createAudioContext,
  getPrefsSnapshot,
  getServerPrefsSnapshot,
  markFired,
  playAlarmTone,
  readPref,
  reminderKey,
  subscribePrefs,
  type AlarmSound,
} from "@/lib/planner-alarm";

type Item = {
  id: number;
  title: string;
  kind: "task" | "meeting";
  notes: string;
  startsAt: string;
  endsAt: string | null;
  reminderAt: string | null;
  alarmEnabled: boolean;
  sound: AlarmSound;
  done: boolean;
};

/**
 * One alarm watcher for the whole admin, mounted in the shell. A reminder set
 * in the planner rings on any admin screen, not only the planner tab. Audio is
 * opt-in per device (browsers block sound before a user gesture) and honours a
 * per-item alarm switch.
 */
export function PlannerAlarmWatcher({ enabled }: { enabled: boolean }) {
  const [active, setActive] = useState<Item | null>(null);
  const prefs = useSyncExternalStore(subscribePrefs, getPrefsSnapshot, getServerPrefsSnapshot);
  const audioRef = useRef<AudioContext | null>(null);
  const ringTimer = useRef<number | null>(null);
  const itemsRef = useRef<Item[]>([]);
  const activeRef = useRef<Item | null>(null);

  const stopRinging = useCallback(() => {
    if (ringTimer.current !== null) {
      window.clearInterval(ringTimer.current);
      ringTimer.current = null;
    }
  }, []);

  const ring = useCallback(() => {
    const context = audioRef.current ?? createAudioContext();
    if (!context) return;
    audioRef.current = context;
    if (context.state === "suspended") void context.resume();
    const sound = activeRef.current?.sound ?? "bell";
    const cycle = () => {
      if (!audioRef.current) return;
      playAlarmTone(audioRef.current, sound);
    };
    cycle();
    stopRinging();
    // Repeat for up to two minutes, or until the alert is dismissed.
    let repeats = 0;
    ringTimer.current = window.setInterval(() => {
      repeats += 1;
      if (repeats > 48) return stopRinging();
      cycle();
    }, 2500);
  }, [stopRinging]);

  const fire = useCallback((item: Item) => {
    activeRef.current = item;
    setActive(item);
    if (readPref(SOUND_KEY) && item.alarmEnabled) ring();
  }, [ring]);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/admin/planner", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) return;
      const payload = (await res.json()) as { data?: Item[] };
      const items = Array.isArray(payload.data) ? payload.data : [];
      itemsRef.current = items;
      const now = Date.now();
      const notify = readPref(NOTIFY_KEY);
      const sound = readPref(SOUND_KEY);
      for (const item of items) {
        if (item.done || !item.reminderAt) continue;
        const due = new Date(item.reminderAt).getTime();
        // Catch up shortly after wake/sleep, but never ring day-old reminders.
        if (due > now || due < now - 15 * 60_000) continue;
        const key = reminderKey(item.id, item.reminderAt);
        if (alreadyFired(key)) continue;
        const canNotify = notify && typeof Notification !== "undefined" && Notification.permission === "granted";
        const canSound = sound && item.alarmEnabled;
        // Nothing was enabled: leave it unmarked so switching a channel on
        // during the catch-up window can still deliver this reminder.
        if (!canNotify && !canSound) continue;
        markFired(key);
        if (canNotify) {
          try {
            new Notification(item.kind === "meeting" ? "Meeting starting" : "Planner reminder", {
              body: item.title,
              tag: `planner-${item.id}`,
              requireInteraction: true,
            });
          } catch {
            /* OS refused the toast; the in-page alarm still shows */
          }
        }
        if (canSound) fire(item);
      }
    } catch {
      /* offline: try again on the next tick */
    }
  }, [enabled, fire]);

  useEffect(() => {
    const onTest = () => {
      const context = audioRef.current ?? createAudioContext();
      if (!context) return;
      audioRef.current = context;
      if (context.state === "suspended") void context.resume();
      playAlarmTone(context, "bell");
    };
    window.addEventListener(PLANNER_TEST_EVENT, onTest);
    return () => window.removeEventListener(PLANNER_TEST_EVENT, onTest);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Deferred so the first poll cannot set state inside the effect body.
    const kick = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [enabled, load]);

  useEffect(() => () => stopRinging(), [stopRinging]);

  if (!active) return null;
  const when = new Date(active.startsAt);
  const label = new Intl.DateTimeFormat("en-GB", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(when);
  const dismiss = () => {
    stopRinging();
    activeRef.current = null;
    setActive(null);
  };

  return (
    <div role="alertdialog" aria-modal="true" aria-label="Planner alarm" className="fixed inset-0 z-[300] flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl ring-1 ring-black/5">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-brand">
          <Bell className="h-8 w-8 animate-pulse" />
        </div>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-brand">{active.kind === "meeting" ? "Meeting now" : "Reminder"}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">{active.title}</h2>
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-charcoal/70"><CalendarDays className="h-3.5 w-3.5" /> {label}</p>
        {active.notes && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-left text-xs text-charcoal/75">{active.notes}</p>}
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={ring} className="inline-flex items-center gap-1.5 rounded-xl border border-ink/10 px-3 py-2 text-[13px] font-medium hover:border-brand"><Volume2 className="h-4 w-4" /> Play again</button>
          <button type="button" onClick={dismiss} className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-[13px] font-semibold text-white"><Check className="h-4 w-4" /> Dismiss</button>
        </div>
        <p className="mt-3 text-[10px] text-mist">
          {prefs.sound ? "Sound is on for this device." : "Sound is off — enable it in the planner."}{" "}
          {prefs.notifications ? "Desktop notifications are on." : "Desktop notifications are off."}{" "}
          <Link href="/admin/planner" className="underline" onClick={dismiss}>Open planner</Link>
        </p>
      </div>
    </div>
  );
}
