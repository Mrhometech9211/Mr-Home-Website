"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X, AlertTriangle, Info, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- Toasts ---------- */
type Toast = { id: number; message: string; type: "success" | "error" | "info" };
const ToastCtx = createContext<{ toast: (message: string, type?: Toast["type"]) => void }>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const toast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, message, type }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4200);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[200] flex flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className={cn("pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-3 text-[13px] font-medium shadow-lg", t.type === "success" && "bg-ink text-white", t.type === "error" && "bg-red-600 text-white", t.type === "info" && "bg-white text-ink ring-1 ring-ink/10")}>
              {t.type === "success" ? <Check className="h-4 w-4 text-brand-bright" /> : t.type === "error" ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Buttons ---------- */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; size?: "sm" | "md"; loading?: boolean };
export function Btn({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-[12.5px]" : "h-10 px-4 text-[13.5px]",
        variant === "primary" && "bg-brand text-white shadow-sm hover:bg-brand-deep",
        variant === "secondary" && "border border-ink/10 bg-white text-ink hover:border-ink/25 hover:bg-slate-50",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        variant === "ghost" && "text-charcoal hover:bg-slate-100",
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export const inputCls = "h-10 w-full rounded-lg border border-ink/10 bg-white px-3 text-[13.5px] text-ink outline-none transition placeholder:text-mist focus:border-brand focus:ring-4 focus:ring-brand/10 disabled:bg-slate-50";
export const labelCls = "mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-charcoal/70";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "red" | "blue" | "slate" }) {
  const tones = { neutral: "bg-slate-100 text-slate-700", green: "bg-emerald-50 text-emerald-700 ring-emerald-200", amber: "bg-amber-50 text-amber-700 ring-amber-200", red: "bg-red-50 text-red-700 ring-red-200", blue: "bg-sky-50 text-sky-700 ring-sky-200", slate: "bg-slate-800 text-white" };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ring-transparent", tones[tone])}>{children}</span>;
}

export { statusTone } from "@/lib/utils";

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[150] flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-label={title} initial={{ y: 24, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 30 }} onClick={(e) => e.stopPropagation()} className={cn("flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl", wide ? "sm:max-w-5xl" : "sm:max-w-lg")}>
            <div className="flex items-center justify-between border-b border-ink/8 px-5 py-4"><h2 className="text-[15px] font-semibold text-ink">{title}</h2><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-charcoal hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
            <div className="overflow-y-auto p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Confirm({ open, onClose, onConfirm, title, message, confirmLabel = "Confirm", danger }: { open: boolean; onClose: () => void; onConfirm: () => Promise<void> | void; title: string; message: string; confirmLabel?: string; danger?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-[14px] text-charcoal">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn variant={danger ? "danger" : "primary"} loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}>{confirmLabel}</Btn>
      </div>
    </Modal>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink/15 bg-white p-12 text-center">
      <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 text-[13.5px] text-charcoal/70">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** Loading placeholder matching the design system's .skeleton shimmer class. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton", className)} />;
}

/* ---------- Inputs ---------- */
export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputCls, "h-9 text-[13px]", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-mist focus:border-brand focus:ring-4 focus:ring-brand/10", className)} {...rest} />;
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: string; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-ink/8 bg-white shadow-sm", className)}>
      {(title || actions) && <div className="flex items-center justify-between border-b border-ink/8 px-5 py-3.5"><h2 className="text-[14px] font-semibold text-ink">{title}</h2>{actions}</div>}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Fetch helper that surfaces API error messages. */
export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) }, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issues = (data.issues as { path: string; message: string }[] | undefined)?.map((i) => `${i.path}: ${i.message}`).join("; ");
    const err = new Error(issues ? `${data.error}: ${issues}` : data.error || `Request failed (${res.status})`) as Error & { issues?: { path: string; message: string }[]; status?: number; data?: unknown };
    err.issues = data.issues; err.status = res.status; err.data = data;
    throw err;
  }
  return data as T;
}
