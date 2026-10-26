"use client";

/**
 * Desktop lead notifier (admin panel).
 *
 * Works while the admin tab is UNFOCUSED:
 *   1. The poll loop runs inside a Web Worker. Browsers deep-throttle timers in
 *      hidden tabs, but worker timers keep firing on schedule, so fetches keep
 *      happening at the configured cadence no matter which tab is visible.
 *   2. A new lead id fires a native OS notification (Windows toast when the tab
 *      runs in Chrome/Edge) — the Notification constructor is deliberately used
 *      instead of in-page UI so the toast appears without tab focus.
 *   3. Sound: a single AudioContext is created + unlocked on the first user
 *      gesture and reused afterwards (a fresh AudioContext created while hidden
 *      would be born suspended, which is why the old version was silent).
 *
 * Admin → Settings → Notifications reuses playChime/playDing/playCustom +
 * fireNotification for its "Send test notification" button.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { BellOff, BellRing } from "lucide-react";

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

/* ------------------------------------------------------------------ */
/* Sound helpers (unlocked, reused context — works in hidden tabs).     */
/* ------------------------------------------------------------------ */

type AudioHost = typeof globalThis & {
  __mrhAudioCtx?: AudioContext;
  __mrhAudioUnlocked?: boolean;
};

/** Returns the shared AudioContext, created (and resumed) on demand. */
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

/** Built-in chime: two rising notes (no audio asset needed). */
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

/** Ding: single note. */
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

/** Plays the configured custom sound file at the configured volume. */
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

/**
 * Fires the OS notification (permission must already be granted). Uses the
 * constructor — not in-page markup — so the toast is delivered by the OS and
 * shows even when the browser tab is not focused.
 */
export function fireNotification(titleTemplate: string, lead: { id?: number; name: string; source: string | null; city: string | null; page: string | null }) {
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
/* Poller.                                                             */
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

/** Web-Worker source: a plain interval that is NOT throttled in hidden tabs. */
const TICKER_SRC = `let t=null;self.onmessage=(e)=>{const d=e.data||{};if(d.stop){if(t){clearInterval(t);t=null;}return;}if(d.intervalMs){if(t)clearInterval(t);t=setInterval(()=>self.postMessage('tick'),Math.max(3000,d.intervalMs));self.postMessage('started');}};`;

export function LeadNotifier() {
  const router = useRouter();
  // Start at a server/client-stable value and read the real browser permission
  // via useSyncExternalStore — reading Notification.permission directly during
  // hydration rendered a different first paint than the server HTML and
  // crashed hydration. Handles hydration by using the server snapshot on the
  // first client render.
  const emptySubscribe = useCallback(() => () => {}, []);
  const browserPermission = useSyncExternalStore(
    emptySubscribe,
    () => (typeof Notification === "undefined" ? ("unsupported" as const) : Notification.permission),
    () => "unsupported" as const,
  );
  // requestPermission() updates Notification.permission globally, but the
  // button's own result is applied immediately so the UI flips right away.
  const [requestedPermission, setRequestedPermission] = useState<"unsupported" | NotificationPermission | null>(null);
  const permission = requestedPermission ?? browserPermission;
  // In-page fallback: leads are still announced visibly when the OS toast
  // cannot be shown (permission not granted / API unsupported).
  const [inPage, setInPage] = useState<{ name: string; source: string | null } | null>(null);

  const announce = useCallback(
    (feed: Feed) => {
      const latest = feed.latest;
      if (!latest) return;
      const last = Number(localStorage.getItem(LAST_SEEN_KEY) ?? "0");
      if (last && latest.id > last) {
        const osShown = fireNotification(feed.config.titleTemplate, latest);
        playSound(feed.config.sound, feed.config.soundUrl, feed.config.volume);
        if (!osShown) setInPage({ name: latest.name, source: latest.source ?? latest.page });
        router.refresh(); // refresh lead badge/counts
      }
      localStorage.setItem(LAST_SEEN_KEY, String(latest.id));
    },
    [router],
  );

  const pollRef = useRef<() => void>(() => {});
  const intervalRef = useRef(20_000);
  const tickerRef = useRef<Worker | null>(null);

  const poll = useCallback(async () => {
    const feed = await fetchFeed();
    if (!feed || !feed.allowed) return;
    announce(feed);
    const ms = Math.max(5, feed.config.pollSeconds) * 1000;
    if (ms !== intervalRef.current) {
      intervalRef.current = ms;
      tickerRef.current?.postMessage({ intervalMs: ms });
    }
  }, [announce]);

  // Start the worker ticker (with a plain-interval fallback if Workers fail).
  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    type WorkerHost = typeof globalThis & { __mrhTickerUrl?: string };
    const g = globalThis as WorkerHost;
    try {
      let url = g.__mrhTickerUrl;
      if (!url) {
        url = URL.createObjectURL(new Blob([TICKER_SRC], { type: "text/javascript" }));
        g.__mrhTickerUrl = url;
      }
      const worker = new Worker(url);
      worker.onmessage = (e) => { if (e.data === "tick") void pollRef.current(); };
      worker.postMessage({ intervalMs: intervalRef.current });
      tickerRef.current = worker;
    } catch {
      // Worker unavailable — hidden-tab throttled fallback still works on focus.
      const fallback = setInterval(() => void pollRef.current(), intervalRef.current);
      return () => clearInterval(fallback);
    }
    return () => {
      tickerRef.current?.terminate();
      tickerRef.current = null;
    };
  }, []);

  // Kick a poll immediately whenever the tab becomes visible again so the UI
  // never waits out the current tick after returning to the admin panel.
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) void pollRef.current(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Unlock audio on the first user gesture, so notifications that arrive later
  // (possibly while hidden) can actually be heard.
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

  // Auto-dismiss the in-page lead card after 8 seconds.
  useEffect(() => {
    if (!inPage) return;
    const t = setTimeout(() => setInPage(null), 8000);
    return () => clearTimeout(t);
  }, [inPage]);

  if (permission === "unsupported") return null;

  // Fully granted OS notifications and no in-page fallback: render nothing.
  if (permission === "granted" && !inPage) return null;

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
            if (res === "granted") void pollRef.current();
          }}
          className="fixed bottom-4 right-4 z-[80] inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-lg transition hover:bg-ink/85"
        >
          <BellRing className="h-4 w-4 text-brand-bright" /> Enable lead notifications
        </button>
      )}
    </>
  );
}
