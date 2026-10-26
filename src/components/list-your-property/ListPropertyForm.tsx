"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { LISTING_LANGUAGES, LISTING_PROPERTY_TYPES, LISTING_PURPOSES } from "@/lib/listing-options";

type Props = {
  markets: { id: number; name: string; flag: string }[];
  /** Admin-toggled visible fields; every field on by default. */
  lypFields?: string[];
  compact?: boolean;
};

type State = { status: "idle" | "loading" | "success" | "error"; message?: string; issues?: Record<string, string> };

const inputCls = "h-12 w-full rounded-xl border border-ink/10 bg-white px-4 text-[14px] text-ink outline-none transition placeholder:text-mist focus:border-brand focus:ring-4 focus:ring-brand/10";

function Field({ name, label, error, children }: { name: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={`ltp-${name}`} className="sr-only">{label}</label>
      {children}
      {error && <p className="mt-1 text-[12px] text-red-600" role="alert">{error}</p>}
    </div>
  );
}

export function ListPropertyForm({ markets, lypFields, compact = false }: Props) {
  const pathname = usePathname();
  const [state, setState] = useState<State>({ status: "idle" });
  const visible = useMemo(() => new Set(lypFields?.length ? lypFields : ["name", "email", "phone", "preferredLanguage", "propertyAddress", "propertyType", "purpose", "bedrooms", "market", "message"]), [lypFields]);
  const purposeOptions = useMemo(() => LISTING_PURPOSES, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/list-your-property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(fd.entries())),
      });
      const out = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        issues?: { path: string; message: string }[] | Record<string, string>;
      };
      if (!res.ok || out.error) {
        // The API may return field issues as an array ({path,message}) or a
        // map — normalise either into the record the form renders.
        const issues: Record<string, string> = {};
        if (Array.isArray(out.issues)) {
          for (const i of out.issues) if (i?.path) issues[i.path] = i.message;
        } else if (out.issues && typeof out.issues === "object") {
          Object.assign(issues, out.issues);
        }
        setState({
          status: "error",
          message:
            out.error === "Validation failed" && issues.propertyAddress
              ? issues.propertyAddress
              : out.error || out.message || "Something went wrong. Please try again.",
          issues,
        });
        return;
      }
      setState({ status: "success", message: out.message || "Thank you. Our listings team will contact you shortly." });
      form.reset();
    } catch {
      setState({ status: "error", message: "Network error — please check your connection and try again." });
    }
  }

  if (state.status === "success") {
    return (
      <div className="rounded-3xl border border-brand/30 bg-brand/5 p-10 text-center" role="status">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-glow"><Check className="h-6 w-6" aria-hidden /></span>
        <h3 className="mt-4 text-[20px] font-semibold text-ink">Submission received</h3>
        <p className="mt-2 max-w-md text-[14.5px] text-charcoal/80">{state.message}</p>
        <button type="button" onClick={() => setState({ status: "idle" })} className="mt-6 text-[13.5px] font-medium text-brand hover:underline">Submit another property</button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate={false} className={cn("rounded-[28px] border border-ink/8 bg-white p-6 shadow-card sm:p-8")}>
      <div className={cn("grid gap-4", compact ? "sm:grid-cols-2" : "sm:grid-cols-2")}>
        {visible.has("name") && (
          <Field name="name" label="Full name" error={state.issues?.name}>
            <input id="ltp-name" name="name" required minLength={2} maxLength={120} placeholder="Full name" className={inputCls} autoComplete="name" />
          </Field>
        )}
        {visible.has("email") && (
          <Field name="email" label="Email" error={state.issues?.email}>
            <input id="ltp-email" name="email" type="email" placeholder="Email address" className={inputCls} autoComplete="email" />
          </Field>
        )}
        {visible.has("phone") && (
          <Field name="phone" label="Phone / WhatsApp with country code" error={state.issues?.phone}>
            <input id="ltp-phone" name="phone" pattern="\\+?[0-9 ()\\-]{6,40}" title="Include your country code, e.g. +971 50 123 4567" placeholder="Phone / WhatsApp — with country code" className={inputCls} inputMode="tel" autoComplete="tel" />
          </Field>
        )}
        {visible.has("preferredLanguage") && (
          <Field name="preferredLanguage" label="Preferred language" error={state.issues?.preferredLanguage}>
            <select id="ltp-preferredLanguage" name="preferredLanguage" className={inputCls} defaultValue={LISTING_LANGUAGES[0]}>
              {LISTING_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
        )}
        {visible.has("propertyAddress") && (
          <Field name="propertyAddress" label="Property address" error={state.issues?.propertyAddress}>
            <input id="ltp-propertyAddress" name="propertyAddress" required maxLength={300} placeholder="Property address" className={cn(inputCls, "sm:col-span-2")} autoComplete="street-address" />
          </Field>
        )}
        {visible.has("propertyType") && (
          <Field name="propertyType" label="Property type" error={state.issues?.propertyType}>
            <select id="ltp-propertyType" name="propertyType" className={inputCls} defaultValue={LISTING_PROPERTY_TYPES[0]}>
              {LISTING_PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        )}
        {visible.has("purpose") && (
          <Field name="purpose" label="Purpose" error={state.issues?.purpose}>
            <select id="ltp-purpose" name="purpose" className={inputCls} defaultValue="sell">
              {purposeOptions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
        )}
        {visible.has("bedrooms") && (
          <Field name="bedrooms" label="Bedrooms" error={state.issues?.bedrooms}>
            <select id="ltp-bedrooms" name="bedrooms" className={inputCls} defaultValue="2">
              <option value="">Not specified</option>
              <option value="0">Studio</option>
              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        )}
        {visible.has("market") && (
          <Field name="marketId" label="Market (optional)" error={state.issues?.marketId}>
            <select id="ltp-marketId" name="marketId" className={inputCls} defaultValue="">
              <option value="">Market (optional)</option>
              {markets.map((m) => <option key={m.id} value={m.id}>{`${m.flag} ${m.name}`}</option>)}
            </select>
          </Field>
        )}
        {visible.has("message") && (
          <Field name="message" label="Message" error={state.issues?.message}>
            <textarea id="ltp-message" name="message" rows={4} maxLength={3000} placeholder="Anything else we should know? (optional)" className={cn(inputCls, "h-auto pt-3", "sm:col-span-2")} />
          </Field>
        )}
      </div>
      {/* Honeypot — hidden from humans, catches naive spam bots. */}
      <div className="absolute left-[-9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="ltp-website">Leave this field empty</label>
        <input id="ltp-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {state.status === "error" && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-[13.5px] text-red-700" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{state.message}</p>
      )}
      <button type="submit" disabled={state.status === "loading"} className="mt-6 h-13 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3.5 text-[15px] font-semibold text-white shadow-glow transition hover:-translate-y-0.5 disabled:opacity-60">
        {state.status === "loading" ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Submitting…</> : "List My Property"}
      </button>
      <p className="mt-3 text-center text-[11.5px] text-mist">By submitting you agree to be contacted about your listing. We treat your details confidentially.</p>
      <input type="hidden" name="page" value={pathname} />
    </form>
  );
}
