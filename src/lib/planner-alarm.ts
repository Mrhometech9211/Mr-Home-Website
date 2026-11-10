/**
 * Browser-side helpers for the planner alarm. Kept free of server imports so
 * the admin shell and the planner page share exactly one implementation.
 *
 * Honest limits: a browser tab must be open for the in-app alarm. For a ring
 * while the browser is closed, the planner exports an .ics file with VALARMs
 * that the operating-system calendar owns.
 */

export type AlarmSound = "bell" | "pulse" | "chime";

export const PLANNER_PREFS_EVENT = "mrh-planner-prefs";
export const PLANNER_TEST_EVENT = "mrh-planner-test";
export const NOTIFY_KEY = "mrh-planner-notifications";
export const SOUND_KEY = "mrh-planner-sound";
const FIRED_KEY = "mrh-planner-fired";

export function readPref(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "on";
  } catch {
    return false;
  }
}

export type PlannerPrefs = { notifications: boolean; sound: boolean };

/** Stable server/hydration snapshot; the client value replaces it after mount. */
export const EMPTY_PREFS: PlannerPrefs = { notifications: false, sound: false };

let cachedPrefs: PlannerPrefs | null = null;
const prefListeners = new Set<() => void>();

/**
 * localStorage is an external store, so components subscribe to it instead of
 * copying it into state from an effect. Toggles update every mounted control
 * and other tabs immediately, and SSR renders the safe default.
 */
export function getPrefsSnapshot(): PlannerPrefs {
  if (!cachedPrefs) cachedPrefs = { notifications: readPref(NOTIFY_KEY), sound: readPref(SOUND_KEY) };
  return cachedPrefs;
}

export function getServerPrefsSnapshot(): PlannerPrefs {
  return EMPTY_PREFS;
}

export function subscribePrefs(listener: () => void): () => void {
  prefListeners.add(listener);
  const onStorage = () => {
    cachedPrefs = null;
    listener();
  };
  try {
    window.addEventListener("storage", onStorage);
  } catch {
    /* no window: the listener is only additive */
  }
  return () => {
    prefListeners.delete(listener);
    try {
      window.removeEventListener("storage", onStorage);
    } catch {
      /* nothing to remove */
    }
  };
}

export function writePref(key: string, on: boolean) {
  try {
    window.localStorage.setItem(key, on ? "on" : "off");
  } catch {
    /* private mode: the in-memory toggle still works for this session */
  }
  cachedPrefs = null;
  prefListeners.forEach((listener) => listener());
  window.dispatchEvent(new CustomEvent(PLANNER_PREFS_EVENT));
}

/** One reminder fires once per (item, reminder timestamp) pair, across reloads. */
export function reminderKey(id: number, reminderAt: string) {
  return `${id}@${new Date(reminderAt).getTime()}`;
}

function readFired(): string[] {
  try {
    const raw = window.localStorage.getItem(FIRED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function alreadyFired(key: string): boolean {
  return readFired().includes(key);
}

export function markFired(key: string) {
  const next = [...readFired().filter((v) => v !== key), key].slice(-200);
  try {
    window.localStorage.setItem(FIRED_KEY, JSON.stringify(next));
  } catch {
    /* memory is enough while the page stays open */
  }
}

/**
 * Plays one alarm cycle. The caller repeats it while the alert is on screen;
 * each cycle is loud but never a single clipped blip.
 */
export function playAlarmTone(context: AudioContext, sound: AlarmSound) {
  const patterns: Record<AlarmSound, number[]> = {
    // Repeated high-low pairs read as an alarm rather than a phone notification.
    bell: [988, 784, 988, 784, 988, 784, 988, 784],
    pulse: [740, 990, 740, 990, 740, 990, 740, 990],
    chime: [784, 988, 1175, 1568],
  };
  const gainPeak = 0.95;
  patterns[sound].forEach((frequency, index) => {
    const at = context.currentTime + index * 0.22;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = sound === "chime" ? "sine" : "square";
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(gainPeak, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.21);
  });
  return patterns[sound].length * 0.22;
}

export function createAudioContext(): AudioContext | null {
  try {
    const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}
