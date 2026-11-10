"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Bell, BellOff, CalendarDays, Check, ChevronLeft, ChevronRight, Download, Plus, Trash2, Volume2, VolumeX } from "lucide-react";
import { api, Btn, inputCls, labelCls, useToast } from "./ui";
import { NOTIFY_KEY, PLANNER_TEST_EVENT, SOUND_KEY, getPrefsSnapshot, getServerPrefsSnapshot, subscribePrefs, writePref } from "@/lib/planner-alarm";
import type { PlannerInput, PlannerItem } from "@/lib/planner";
import { cn } from "@/lib/utils";

type Item = PlannerItem & { startsAt: string; endsAt: string | null; reminderAt: string | null; createdAt: string; updatedAt: string };
type Draft = { title: string; kind: "task" | "meeting"; notes: string; startsAt: string; endsAt: string; reminderAt: string; alarmEnabled: boolean; sound: "chime" | "pulse" | "bell" };
const freshDraft = (): Draft => ({ title: "", kind: "meeting", notes: "", startsAt: localDateTime(new Date(Date.now() + 60 * 60 * 1000)), endsAt: "", reminderAt: localDateTime(new Date(Date.now() + 55 * 60 * 1000)), alarmEnabled: true, sound: "bell" });
function localDateTime(date: Date) { const d = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16); }
function asIso(value: string) { return value ? new Date(value).toISOString() : null; }
function toDraft(item: Item): Draft { return { title: item.title, kind: item.kind, notes: item.notes, startsAt: localDateTime(new Date(item.startsAt)), endsAt: item.endsAt ? localDateTime(new Date(item.endsAt)) : "", reminderAt: item.reminderAt ? localDateTime(new Date(item.reminderAt)) : "", alarmEnabled: item.alarmEnabled, sound: item.sound }; }
function dateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function mondayStart(date: Date) { const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
const subscribeNoop = () => () => {};

function niceTime(value: string) { return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function niceDate(value: Date) { return new Intl.DateTimeFormat("en-GB", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(value); }

export function PlannerManager({ canWrite }: { canWrite: boolean }) {
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState<Draft>(freshDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [week, setWeek] = useState(() => mondayStart(new Date()));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const prefs = useSyncExternalStore(subscribePrefs, getPrefsSnapshot, getServerPrefsSnapshot);
  // The planner board depends on the viewer's clock, locale and timezone. Render
  // a neutral skeleton on the server so hydration can never disagree with it.
  const hydrated = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const notificationsEnabled = prefs.notifications;
  const soundEnabled = prefs.sound;
  const permission = useSyncExternalStore<NotificationPermission | "unsupported">(
    subscribePrefs,
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission),
    () => "default",
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ data: Item[] }>("/api/admin/planner");
      setItems(result.data.map((item) => ({ ...item, startsAt: new Date(item.startsAt).toISOString(), endsAt: item.endsAt ? new Date(item.endsAt).toISOString() : null, reminderAt: item.reminderAt ? new Date(item.reminderAt).toISOString() : null })));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to load planner", "error");
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => {
    // Deferred one tick so the initial fetch never sets state during the effect itself.
    const kick = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(kick);
  }, [refresh]);
  useEffect(() => {
    // Keep alarms reliable after a sleeping laptop resumes, and check again
    // when the window becomes visible. A browser tab must remain open.
    const resync = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", resync);
    document.addEventListener("visibilitychange", resync);
    return () => {
      window.removeEventListener("focus", resync);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [refresh]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(week); d.setDate(d.getDate() + i); return d; }), [week]);
  const visibleItems = useMemo(() => items.filter((item) => { const d = new Date(item.startsAt); return d >= week && d < new Date(week.getTime() + 7 * 86_400_000); }), [items, week]);

  async function save() {
    if (!canWrite) return;
    setBusy(true);
    const input: PlannerInput = { title: draft.title, kind: draft.kind, notes: draft.notes, startsAt: asIso(draft.startsAt)!, endsAt: asIso(draft.endsAt), reminderAt: asIso(draft.reminderAt), alarmEnabled: draft.alarmEnabled, sound: draft.sound, done: false };
    try {
      if (editingId) await api(`/api/admin/planner`, { method: "PATCH", body: JSON.stringify({ id: editingId, item: input }) });
      else await api(`/api/admin/planner`, { method: "POST", body: JSON.stringify(input) });
      toast(editingId ? "Planner item updated" : "Planner item saved");
      setDraft(freshDraft()); setEditingId(null); await refresh();
    } catch (error) { toast(error instanceof Error ? error.message : "Could not save planner item", "error"); }
    finally { setBusy(false); }
  }

  async function updateItem(item: Item, patch: Partial<PlannerInput>) {
    if (!canWrite) return;
    const next: PlannerInput = { ...toDraft(item), startsAt: new Date(item.startsAt).toISOString(), endsAt: item.endsAt, reminderAt: item.reminderAt, done: item.done, ...patch };
    try { await api("/api/admin/planner", { method: "PATCH", body: JSON.stringify({ id: item.id, item: next }) }); await refresh(); }
    catch (error) { toast(error instanceof Error ? error.message : "Could not update item", "error"); }
  }

  async function remove(item: Item) {
    if (!canWrite || !window.confirm(`Delete “${item.title}”?`)) return;
    try { await api("/api/admin/planner", { method: "DELETE", body: JSON.stringify({ id: item.id }) }); await refresh(); }
    catch (error) { toast(error instanceof Error ? error.message : "Could not delete item", "error"); }
  }

  async function enableNotifications() {
    if (typeof Notification === "undefined") { toast("Desktop notifications are not supported by this browser", "error"); return; }
    const result = await Notification.requestPermission();
    if (result === "granted") { writePref(NOTIFY_KEY, true); toast("Desktop notifications enabled on this device"); }
    else toast("Notification permission was not granted", "error");
  }

  function enableSound() {
    writePref(SOUND_KEY, true);
    window.dispatchEvent(new CustomEvent(PLANNER_TEST_EVENT));
    toast("Alarm enabled — a test chime just played on this device");
  }

  /** Downloads the .ics through a real anchor so the browser keeps the file. */
  function downloadCalendar() {
    const link = document.createElement("a");
    link.href = "/api/admin/planner/ics";
    link.download = "mrh-planner.ics";
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast("Calendar file downloaded — open it to add alarms to your desktop calendar");
  }

  function changeWeek(delta: number) { const next = new Date(week); next.setDate(next.getDate() + delta * 7); setWeek(next); }
  function edit(item: Item) { setEditingId(item.id); setDraft(toDraft(item)); window.scrollTo({ top: 0, behavior: "smooth" }); }

  if (!hydrated) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-3 w-28 rounded bg-slate-200/70" />
        <div className="h-7 w-72 max-w-full rounded bg-slate-200/70" />
        <div className="h-96 rounded-2xl border border-ink/8 bg-white" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">Planning desk</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Calendar & reminders</h1><p className="mt-1 text-sm text-charcoal/70">Private to your account. An enabled alarm rings on any admin screen while this browser stays open. For a ring while it is closed, add the plan to your desktop calendar.</p></div>
        <div className="flex flex-wrap gap-2">
          {notificationsEnabled ? <Btn variant="secondary" onClick={() => writePref(NOTIFY_KEY, false)}><BellOff className="h-4 w-4" /> Notifications on</Btn> : <Btn variant="secondary" onClick={enableNotifications}><Bell className="h-4 w-4" /> Enable desktop notifications</Btn>}
          {soundEnabled ? <Btn variant="secondary" onClick={() => writePref(SOUND_KEY, false)}><VolumeX className="h-4 w-4" /> Sound on</Btn> : <Btn variant="secondary" onClick={enableSound}><Volume2 className="h-4 w-4" /> Enable & test alarm</Btn>}
          <button type="button" onClick={downloadCalendar} className="inline-flex items-center gap-2 rounded-xl border border-ink/10 bg-white px-3 py-2 text-[13px] font-medium text-ink hover:border-brand"><Download className="h-4 w-4" /> Add to desktop calendar</button>
        </div>
      </div>
      {permission === "unsupported" && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">This browser does not provide desktop notifications. In-page reminders and alarms work while this page remains open.</p>}
      <p className="rounded-lg border border-ink/8 bg-white p-3 text-xs text-charcoal/70">A browser tab cannot ring while it is closed or the computer is asleep. The calendar button downloads a standard .ics file whose built-in alarms fire in Outlook, Apple Calendar or Google Calendar even when this site is not open; importing it again updates the same entries.</p>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-2xl border border-ink/8 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-ink/8 p-4"><div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-brand" /><h2 className="text-sm font-semibold">Week of {new Intl.DateTimeFormat("en-GB", { month: "long", day: "numeric" }).format(week)}</h2></div><div className="flex gap-1"><button type="button" className="rounded-lg border border-ink/10 p-2" onClick={() => changeWeek(-1)} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button><button type="button" className="rounded-lg border border-ink/10 p-2" onClick={() => setWeek(mondayStart(new Date()))}>Today</button><button type="button" className="rounded-lg border border-ink/10 p-2" onClick={() => changeWeek(1)} aria-label="Next week"><ChevronRight className="h-4 w-4" /></button></div></div>
          <div className="grid grid-cols-7 border-b border-ink/8 bg-slate-50">{days.map((day) => <div key={dateKey(day)} className={cn("border-r border-ink/6 px-1 py-2 text-center last:border-r-0", dateKey(day) === dateKey(new Date()) && "bg-brand/5")}><div className="text-[9px] uppercase text-mist">{new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(day)}</div><div className="text-sm font-semibold">{day.getDate()}</div></div>)}</div>
          {loading ? <div className="p-12 text-center text-sm text-mist">Loading planner…</div> : <div className="grid min-h-56 grid-cols-7">{days.map((day) => { const events = visibleItems.filter((item) => dateKey(new Date(item.startsAt)) === dateKey(day)); return <div key={dateKey(day)} className="min-w-0 space-y-1 border-r border-ink/6 p-1.5 last:border-r-0">{events.map((event) => <button key={event.id} type="button" onClick={() => edit(event)} className={cn("block w-full rounded-lg border-l-2 px-1.5 py-1 text-left text-[10px]", event.done ? "border-slate-300 bg-slate-50 text-mist line-through" : event.kind === "meeting" ? "border-brand bg-emerald-50 text-emerald-900" : "border-sky-500 bg-sky-50 text-sky-900")}><span className="block font-semibold">{niceTime(event.startsAt)}</span><span className="block truncate">{event.title}</span></button>)}</div>; })}</div>}
          <div className="border-t border-ink/8 p-4"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-mist">{niceDate(new Date())}</h3>{visibleItems.length ? <ul className="space-y-2">{visibleItems.map((item) => <li key={item.id} className="flex items-center gap-2 rounded-xl border border-ink/8 p-3"><div className="min-w-0 flex-1 cursor-pointer" onClick={() => edit(item)}><div className="flex items-center gap-2"><span className={cn("h-2 w-2 rounded-full", item.done ? "bg-slate-300" : item.kind === "meeting" ? "bg-brand" : "bg-sky-500")} /><b className={cn("truncate text-xs", item.done && "line-through text-mist")}>{item.title}</b><span className="text-[10px] text-mist">{niceTime(item.startsAt)}</span></div>{item.reminderAt && <p className="mt-1 text-[10px] text-charcoal/60">Reminder {niceTime(item.reminderAt)} · {item.alarmEnabled ? `alarm ${item.sound}` : "sound off"}</p>}{item.notes && <p className="mt-1 truncate text-[11px] text-charcoal/70">{item.notes}</p>}</div>{canWrite && <><button type="button" onClick={() => void updateItem(item, { done: !item.done })} className="rounded p-1.5 text-mist hover:text-brand" aria-label={item.done ? "Mark incomplete" : "Complete task"}><Check className="h-4 w-4" /></button><button type="button" onClick={() => void remove(item)} className="rounded p-1.5 text-mist hover:text-red-600" aria-label="Delete item"><Trash2 className="h-4 w-4" /></button></>}</li>)}</ul> : <p className="text-xs text-mist">Nothing planned this week.</p>}</div>
        </section>
        <section className="h-fit rounded-2xl border border-ink/8 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center gap-2"><Plus className="h-4 w-4 text-brand" /><h2 className="text-sm font-semibold">{editingId ? "Edit planner item" : "Plan an activity"}</h2></div><div className="space-y-3"><div><label className={labelCls}>Activity</label><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputCls} placeholder="Planning meeting, call, task…" disabled={!canWrite} /></div><div><label className={labelCls}>Type</label><select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft["kind"] })} className={inputCls} disabled={!canWrite}><option value="meeting">Meeting</option><option value="task">To-do</option></select></div><div><label className={labelCls}>Start</label><input type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} className={inputCls} disabled={!canWrite} /></div><div><label className={labelCls}>End (optional)</label><input type="datetime-local" value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} className={inputCls} disabled={!canWrite} /></div><div><label className={labelCls}>Reminder at</label><input type="datetime-local" value={draft.reminderAt} onChange={(e) => setDraft({ ...draft, reminderAt: e.target.value })} className={inputCls} disabled={!canWrite} /><p className="mt-1 text-[10px] text-mist">Your chosen reminder time can be earlier than the activity.</p></div><div><label className={labelCls}>Reminder sound</label><select value={draft.sound} onChange={(e) => setDraft({ ...draft, sound: e.target.value as Draft["sound"] })} className={inputCls} disabled={!canWrite}><option value="bell">Loud bell</option><option value="pulse">Urgent pulse</option><option value="chime">Soft chime</option></select></div><div><label className={labelCls}>Notes</label><textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={cn(inputCls, "h-20 py-2")} placeholder="Details or agenda" disabled={!canWrite} /></div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.alarmEnabled} onChange={(e) => setDraft({ ...draft, alarmEnabled: e.target.checked })} disabled={!canWrite} /> Sound an alarm for this reminder</label><div className="flex gap-2"><Btn onClick={save} disabled={!canWrite || busy || !draft.title.trim()} loading={busy}><Check className="h-4 w-4" /> {editingId ? "Save changes" : "Add to calendar"}</Btn>{editingId && <Btn variant="secondary" onClick={() => { setEditingId(null); setDraft(freshDraft()); }}>Cancel</Btn>}</div></div></section>
      </div>
    </div>
  );
}
