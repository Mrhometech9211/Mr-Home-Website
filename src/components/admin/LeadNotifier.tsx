"use client";

/**
 * Desktop lead notifier (admin panel).
 *
 * CPU guardrail: this component must never run a background poll loop. It
 * fetches only when the admin opens the bell, enables notifications, or
 * returns to the tab (throttled). Hidden tabs make no requests, so an idle
 * admin session cannot consume Fluid CPU.
 *
 * OS notifications and sound still work while the tab is visible. When the tab
 * is hidden there is intentionally no polling; the next focus refresh catches
 * up on leads.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { BellOff, BellRing, RefreshCw } from "lucide-react";

export type NotifierConfig = {
  pollSeconds: number;
  sound: "chime" | "ding" | "custom";
  soundUrl: string;
  volume: number;
  titleTemplate: string;
};

type Feed = {
  allowed: boolean;
  latest: { id: number; name: string; source: string | null; page: string | null; city: string | null } | null;
  config: NotifierConfig;
};

const LAST_SEEN_KEY = "mrh-notifier-last-lead-id";
const MIN_REFRESH_MS = 60_000;

/* ------------------------------------------------------------------ */
/* Sound helpers (unlocked, reused context).                            */
/* ------------------------------------------------------------------ */

type AudioHost = typeof globalThis & {
  __mrhAudioCtx?: AudioContext;
  __mrhAudioUnlocked?: boolean;
};

function sharedAudioCtx(): AudioContext | null {
  try {
    const g = globalThis as AudioHost;
    if (!g.__mrhAudioCtx || g.__mrhAudioCtx.state === "closed") {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      g.__mrhAudioCtx = new Ctor();
    }
    if (g.__mrhAudioCtx.state === "suspended") void g.__mrhAudioCtx.resume();
    return g.__mrhAudioCtx;
  } catch {
    return null;
  }
}

export function playChime(volume: number) {
  const ctx = sharedAudioCtx();
  if (!ctx) return;
  try {
    const vol = Math.max(0, Math.min(1, volume / 100));
    const play = (freq: number, at: number, dur = 0.32) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + at);
      gain.gain.linearRampToValueAtTime(vol * 0.5, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + dur);
    };
    play(880, 0);
    play(1174.7, 0.18);
  } catch { /* ignore */ }
}

export function playDing(volume: number) {
  const ctx = sharedAudioCtx();
  if (!ctx) return;
  try {
    const vol = Math.max(0, Math.min(1, volume / 100));
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 1318.5;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol * 0.55, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
  } catch { /* ignore */ }
}

export function playCustom(volume: number, soundUrl: string) {
  try {
    const audio = new Audio(soundUrl);
    audio.volume = Math.max(0, Math.min(1, volume / 100));
    void audio.play().catch(() => { /* blocked until first gesture — ignore */ });
  } catch { /* ignore */ }
}

export function playSound(sound: NotifierConfig["sound"], soundUrl: string, volume: number) {
  if (sound === "custom" && soundUrl) playCustom(volume, soundUrl);
  else if (sound === "ding") playDing(volume);
  else playChime(volume);
}

export function fireNotification(
  titleTemplate: string,
  lead: { id?: number; name: string; source: string | null; city: string | null; page: string | null },
) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  const title = (titleTemplate || "New lead — {{source}}").replace("{{source}}", lead.source || lead.page || "website");
  const body = `${lead.name}${lead.city ? ` · ${lead.city}` : ""}`;
  try {
    const n = new Notification(title, { body, icon: "/brand/favicon.svg", tag: `mrh-lead-${lead.id ?? 0}` });
    n.onclick = () => { window.focus(); n.close(); };
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Notifier.                                                           */
/* ------------------------------------------------------------------ */

const fetchFeed = async (): Promise<Feed | null> => {
  try {
    // no-store: a cached "latest" response could swallow brand-new leads.
    const res = await fetch("/api/admin/notifications/recent", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Feed;
  } catch {
    return null;
  }
};

function LeadNotifierInner() {
  const router = useRouter();
  const emptySubscribe = useCallback(() => () => {}, []);
  const browserPermission = useSyncExternalStore(
    emptySubscribe,
    () => (typeof Notification === "undefined" ? ("unsupported" as const) : Notification.permission),
    () => "unsupported" as const,
  );
  const [requestedPermission, setRequestedPermission] = useState<"unsupported" | NotificationPermission | null>(null);
  const permission = requestedPermission ?? browserPermission;
  const [inPage, setInPage] = useState<{ name: string; source: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [allowed, setAllowed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const lastFetchRef = useRef(0);

  const announce = useCallback(
    (next: Feed) => {
      const latest = next.latest;
      if (!latest) return;
      const last = Number(localStorage.getItem(LAST_SEEN_KEY) ?? "0");
      if (last && latest.id > last) {
        const osShown = fireNotification(next.config.titleTemplate, latest);
        playSound(next.config.sound, next.config.soundUrl, next.config.volume);
        if (!osShown) setInPage({ name: latest.name, source: latest.source ?? latest.page });
        router.refresh(); // refresh lead badge/counts
      }
      localStorage.setItem(LAST_SEEN_KEY, String(latest.id));
    },
    [router],
  );

  const refresh = useCallback(async (force = false) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const now = Date.now();
    if (!force && now - lastFetchRef.current < MIN_REFRESH_MS) return;
    lastFetchRef.current = now;
    setLoading(true);
    setError(false);
    const next = await fetchFeed();
    setLoading(false);
    if (!next) {
      setError(true);
      return;
    }
    setFeed(next);
    setAllowed(next.allowed);
    if (next.allowed) announce(next);
  }, [announce]);

  // A single fetch when the tab becomes visible again. No timer, no hidden-tab
  // polling, and no request when notifications are not granted.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  useEffect(() => {
    const g = globalThis as AudioHost;
    if (g.__mrhAudioUnlocked) return;
    const unlock = () => {
      sharedAudioCtx();
      g.__mrhAudioUnlocked = true;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!inPage) return;
    const t = setTimeout(() => setInPage(null), 8000);
    return () => clearTimeout(t);
  }, [inPage]);

  if (permission === "unsupported") return null;

  const latest = feed?.latest ?? null;

  return (
    <>
      {inPage && (
        <div className="fixed bottom-4 right-4 z-[90] flex max-w-[340px] items-start gap-3 rounded-2xl bg-ink px-4 py-3 text-[12.5px] font-medium text-white shadow-xl" role="alert">
          <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-brand-bright" />
          <div>
            <div className="font-semibold">New lead{inPage.source ? ` — ${inPage.source}` : ""}</div>
            <div className="text-white/70">{inPage.name}</div>
          </div>
        </div>
      )}

      {permission === "granted" && (
        <div className="fixed bottom-4 right-4 z-[80] flex flex-col items-end gap-2">
          {open && (
            <div className="w-[290px] rounded-2xl border border-ink/10 bg-white p-4 text-ink shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mist">Lead notifications</p>
                <button
                  type="button"
                  onClick={() => void refresh(true)}
                  disabled={loading}
                  className="rounded-lg p-1.5 text-charcoal hover:bg-slate-100 disabled:opacity-50"
                  aria-label="Refresh lead feed"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>
              {!allowed ? (
                <p className="mt-2 text-[12.5px] text-charcoal/70">Lead notifications are disabled in Settings → Notifications.</p>
              ) : error ? (
                <p className="mt-2 text-[12.5px] text-charcoal/70">Could not reach the server. Try refresh.</p>
              ) : latest ? (
                <div className="mt-2">
                  <p className="text-[13px] font-semibold">{latest.name}</p>
                  <p className="mt-0.5 text-[11.5px] text-charcoal/60">{latest.source || latest.page || "website"}{latest.city ? ` · ${latest.city}` : ""}</p>
                </div>
              ) : (
                <p className="mt-2 text-[12.5px] text-charcoal/70">No leads yet.</p>
              )}
              <p className="mt-3 text-[10.5px] leading-relaxed text-mist">Checks on bell open and when you return to this tab. No background polling.</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              const next = !open;
              setOpen(next);
              if (next) void refresh(true);
            }}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-lg transition hover:bg-ink/85"
            aria-expanded={open}
            aria-label="Open lead notifications"
          >
            <BellRing className="h-4 w-4 text-brand-bright" /> Leads
          </button>
        </div>
      )}

      {permission === "denied" && (
        <div className="fixed bottom-4 right-4 z-[80] inline-flex max-w-[320px] items-start gap-2 rounded-full bg-ink/85 px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-lg">
          <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <span>Desktop lead notifications are blocked. Click the lock/site icon in your browser&rsquo;s address bar and allow Notifications.</span>
        </div>
      )}

      {permission === "default" && (
        <button
          type="button"
          onClick={async () => {
            if (typeof Notification === "undefined") return;
            const res = await Notification.requestPermission();
            setRequestedPermission(res);
            if (res === "granted") void refresh(true);
          }}
          className="fixed bottom-4 right-4 z-[80] inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-lg transition hover:bg-ink/85"
        >
          <BellRing className="h-4 w-4 text-brand-bright" /> Enable lead notifications
        </button>
      )}
    </>
  );
}

export function LeadNotifier({ canReadLeads = false }: { canReadLeads?: boolean }) {
  // Do not mount the notifier at all for users who cannot read leads: this
  // avoids repeated 403 requests and keeps the CPU guardrail explicit.
  if (!canReadLeads) return null;
  return <LeadNotifierInner />;
}
