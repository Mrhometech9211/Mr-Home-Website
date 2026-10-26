"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { LYP_FIELDS, type SiteSettings, type ListYourPropertyContent, type LeadNotifications, type Automations } from "@/lib/settings-types";
import { cn } from "@/lib/utils";
import { api, Btn, inputCls, labelCls, useToast } from "./ui";
import { ImageInput } from "./FieldInput";
import { fireNotification, playSound } from "./LeadNotifier";

type Tab = { key: string; label: string };
const TABS: Tab[] = [
  { key: "general", label: "General & Brand" }, { key: "contact", label: "Contact" }, { key: "social", label: "Social" }, { key: "footer", label: "Footer" },
  { key: "seo", label: "SEO & Analytics" }, { key: "whatsapp", label: "WhatsApp" },  { key: "forms", label: "Forms & Newsletter" }, { key: "lyp", label: "List Your Property" }, { key: "notifications", label: "Notifications" }, { key: "automation", label: "Automation" }, { key: "intro", label: "Intro Video" }, { key: "legal", label: "Consent & Disclaimer" },
];

const ALL_FIELDS = ["name", "email", "phone", "whatsapp", "country", "market", "project", "budget", "interest", "message"];

type Setter = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => void;

function Text({ s, set, k, label, help, type = "text", canWrite }: { s: SiteSettings; set: Setter; k: keyof SiteSettings; label: string; help?: string; type?: string; canWrite: boolean }) {
  return (
    <div>
      <label htmlFor={String(k)} className={labelCls}>{label}</label>
      <input id={String(k)} type={type} value={String(s[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} className={inputCls} disabled={!canWrite} />
      {help && <p className="mt-1 text-[11.5px] text-mist">{help}</p>}
    </div>
  );
}

function Area({ s, set, k, label, help, canWrite }: { s: SiteSettings; set: Setter; k: keyof SiteSettings; label: string; help?: string; canWrite: boolean }) {
  return (
    <div>
      <label htmlFor={String(k)} className={labelCls}>{label}</label>
      <textarea id={String(k)} rows={3} value={String(s[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} className={cn(inputCls, "h-auto py-2")} disabled={!canWrite} />
      {help && <p className="mt-1 text-[11.5px] text-mist">{help}</p>}
    </div>
  );
}

function Toggle({ s, set, k, label, canWrite }: { s: SiteSettings; set: Setter; k: keyof SiteSettings; label: string; canWrite: boolean }) {
  const on = !!s[k];
  return (
    <label className="flex items-center gap-3">
      <button type="button" role="switch" aria-checked={on} disabled={!canWrite} onClick={() => set(k, !on as never)} className={cn("relative h-6 w-11 rounded-full transition", on ? "bg-brand" : "bg-slate-300")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", on ? "left-[22px]" : "left-0.5")} />
      </button>
      <span className="text-[13.5px]">{label}</span>
    </label>
  );
}

function Lines({ s, set, k, label, help, canWrite }: { s: SiteSettings; set: Setter; k: "budgetOptions" | "interestOptions"; label: string; help?: string; canWrite: boolean }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <textarea
        rows={6}
        value={s[k].join("\n")}
        onChange={(e) => set(k, e.target.value.split("\n"))}
        onBlur={(e) => set(k, e.target.value.split("\n").map((x) => x.trim()).filter(Boolean))}
        className={cn(inputCls, "h-auto py-2")}
        disabled={!canWrite}
      />
      <p className="mt-1 text-[11.5px] text-mist">{help ?? "One option per line."}</p>
    </div>
  );
}

type RowRecord = Record<string, string | undefined>;
type RowKey = "offices" | "socialLinks" | "footerLinks";

/** Editable title/body cards for the List Your Property page (benefits & steps). */
function LypItems({ lyp, setLyp, field, label, maxItems, canWrite }: { lyp: ListYourPropertyContent; setLyp: (l: ListYourPropertyContent) => void; field: "benefits" | "steps"; label: string; maxItems: number; canWrite: boolean }) {
  const arr = lyp[field];
  const update = (i: number, key: "title" | "body", v: string) => setLyp({ ...lyp, [field]: arr.map((r, j) => (j === i ? { ...r, [key]: v } : r)) });
  return (
    <div>
      <div className={labelCls}>{label}</div>
      <div className="space-y-2">
        {arr.map((row, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-ink/8 bg-slate-50/60 p-3">
            <div><label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-mist">Title</label><input value={row.title ?? ""} onChange={(e) => update(i, "title", e.target.value)} className={inputCls} disabled={!canWrite} /></div>
            <div><label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-mist">Description</label><textarea rows={2} value={row.body ?? ""} onChange={(e) => update(i, "body", e.target.value)} className={cn(inputCls, "h-auto py-2")} disabled={!canWrite} /></div>
            {canWrite && (
              <button type="button" onClick={() => setLyp({ ...lyp, [field]: arr.filter((_, j) => j !== i) })} className="inline-flex items-center gap-1 self-start text-[12px] text-red-600 hover:underline">
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
        ))}
        {canWrite && arr.length < maxItems && <Btn type="button" size="sm" variant="secondary" onClick={() => setLyp({ ...lyp, [field]: [...arr, {}] })}><Plus className="h-3.5 w-3.5" /> Add {label.toLowerCase().includes("benefit") ? "benefit" : "step"}</Btn>}
      </div>
    </div>
  );
}

function Rows({ s, set, k, cols, label, canWrite }: { s: SiteSettings; set: Setter; k: RowKey; cols: { key: string; label: string; placeholder?: string; image?: boolean }[]; label: string; canWrite: boolean }) {
  const arr = s[k] as unknown as RowRecord[];
  const update = (i: number, key: string, v: string) => set(k, arr.map((r, j) => (j === i ? { ...r, [key]: v } : r)) as never);
  const span = cols.length >= 4 ? "md:col-span-6" : cols.length === 3 ? "md:col-span-4" : "md:col-span-5";
  return (
    <div>
      <div className={labelCls}>{label}</div>
      <div className="space-y-2">
        {arr.map((row, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-ink/8 bg-slate-50/60 p-3 md:grid-cols-12">
            {cols.map((c) => (
              <div key={c.key} className={span}>
                {c.image ? (
                  <>
                    <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-mist">{c.label}</label>
                    <ImageInput value={row[c.key] ?? ""} onChange={(v) => update(i, c.key, v)} />
                  </>
                ) : (
                  <>
                    <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-mist">{c.label}</label>
                    <input value={row[c.key] ?? ""} placeholder={c.placeholder} onChange={(e) => update(i, c.key, e.target.value)} className={inputCls} disabled={!canWrite} />
                  </>
                )}
              </div>
            ))}
            {canWrite && (
              <div className="flex items-end md:col-span-2">
                <button type="button" onClick={() => set(k, arr.filter((_, j) => j !== i) as never)} className="inline-flex items-center gap-1 text-[12px] text-red-600 hover:underline">
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            )}
          </div>
        ))}
        {canWrite && <Btn type="button" size="sm" variant="secondary" onClick={() => set(k, [...arr, {}] as never)}><Plus className="h-3.5 w-3.5" /> Add</Btn>}
      </div>
    </div>
  );
}

export function SettingsForm({ canWrite }: { canWrite: boolean }) {
  const { toast } = useToast();
  const [s, setS] = useState<SiteSettings | null>(null);
  const [tab, setTab] = useState("general");
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<string[]>(["SUPER_ADMIN", "ADMIN", "EDITOR"]);

  useEffect(() => {
    api<{ data: SiteSettings }>("/api/admin/settings").then((d) => setS(d.data)).catch((e) => toast(e.message, "error"));
    // Custom roles extend the notifiable-roles checkboxes (best effort).
    api<{ data?: { name?: string }[] }>("/api/admin/roles").then((d) => {
      const names = (d.data ?? []).map((r) => r.name).filter((x): x is string => !!x);
      setRoles((cur) => [...new Set([...cur, ...names])]);
    }).catch(() => { /* roles tab not readable — built-ins still offerable */ });
  }, [toast]);

  if (!s) return <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>;

  const set: Setter = (k, v) => setS({ ...s, [k]: v });
  const lyp = s.listYourProperty;
  const setLyp = (l: ListYourPropertyContent) => setS({ ...s, listYourProperty: l });
  const save = async () => {
    setSaving(true);
    try { const d = await api<{ data: SiteSettings }>("/api/admin/settings", { method: "PUT", body: JSON.stringify(s) }); setS(d.data); toast("Settings saved — the public site is updated"); } catch (e) { toast((e as Error).message, "error"); } finally { setSaving(false); }
  };
  const textProps = { s, set, canWrite } as const;

  return (
    <div className="space-y-5">
      <div><h1 className="text-[22px] font-semibold tracking-tight">Settings</h1><p className="text-[13px] text-mist">Central business information. Every change propagates to the public website instantly.</p></div>
      <div className="flex flex-wrap gap-1 rounded-2xl border border-ink/8 bg-white p-1.5 shadow-sm">{TABS.map((t) => <button key={t.key} type="button" onClick={() => setTab(t.key)} className={cn("rounded-xl px-3 py-2 text-[13px] font-medium transition", tab === t.key ? "bg-brand text-white" : "text-charcoal hover:bg-slate-100")}>{t.label}</button>)}</div>

      <div className="space-y-5 rounded-2xl border border-ink/8 bg-white p-5 shadow-sm">
        {tab === "general" && (<>
          <div className="grid gap-4 md:grid-cols-2"><Text {...textProps} k="brandName" label="Brand name" /><Text {...textProps} k="tagline" label="Tagline" /></div>
          <div><label className={labelCls}>Logo (light backgrounds)</label><ImageInput value={s.logo} onChange={(v) => set("logo", v)} /><p className="mt-1 text-[11.5px] text-mist">Upload the exact MR.HOME logo file (SVG/PNG) to the Media Library and select it here.</p></div>
          <div><label className={labelCls}>Logo (dark backgrounds)</label><ImageInput value={s.logoDark} onChange={(v) => set("logoDark", v)} /></div>
          <div><label className={labelCls}>Favicon</label><ImageInput value={s.favicon} onChange={(v) => set("favicon", v)} /></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className={labelCls}>Primary green</label><div className="flex gap-2"><input type="color" value={s.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} className="h-10 w-14 rounded-lg border border-ink/10" aria-label="Primary colour" /><input value={s.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} className={inputCls} /></div></div>
            <div><label className={labelCls}>Accent green</label><div className="flex gap-2"><input type="color" value={s.accentColor} onChange={(e) => set("accentColor", e.target.value)} className="h-10 w-14 rounded-lg border border-ink/10" aria-label="Accent colour" /><input value={s.accentColor} onChange={(e) => set("accentColor", e.target.value)} className={inputCls} /></div></div>
          </div>
          <div className="grid gap-4 md:grid-cols-2"><Text {...textProps} k="announcement" label="Announcement bar text" /><div className="pt-7"><Toggle {...textProps} k="announcementEnabled" label="Show announcement bar" /></div></div>
        </>)}
        {tab === "contact" && (<>
          <div className="grid gap-4 md:grid-cols-2"><Text {...textProps} k="phone" label="Phone (displayed)" /><Text {...textProps} k="whatsapp" label="WhatsApp number" help="International format, digits only preferred e.g. +971501234567" /><Text {...textProps} k="email" label="Email" type="email" /><Text {...textProps} k="workingHours" label="Working hours" /></div>
          <Text {...textProps} k="address" label="Head office address" /><Text {...textProps} k="mapUrl" label="Map link" />
          <Rows {...{ s, set, canWrite }} k="offices" label="Office locations" cols={[{ key: "name", label: "Name" }, { key: "address", label: "Address" }, { key: "phone", label: "Phone" }, { key: "hours", label: "Hours" }, { key: "mapUrl", label: "Map URL" }]} />
        </>)}
        {tab === "social" && (<>
          <Rows {...{ s, set, canWrite }} k="socialLinks" label="Social links" cols={[{ key: "platform", label: "Platform", placeholder: "instagram / facebook / linkedin / youtube / x" }, { key: "url", label: "URL" }, { key: "icon", label: "Icon (logo image)", image: true }]} />
          <p className="text-[11.5px] text-mist">Upload each platform&apos;s logo to the Media Library and select it as the icon — the footer shows that image instead of the built-in symbol.</p>
          <div className="grid gap-4 md:grid-cols-2"><Toggle {...textProps} k="cookieConsentEnabled" label="Show cookie consent banner" /><Toggle {...textProps} k="whatsappFloatEnabled" label="Show floating WhatsApp button" /></div>
        </>)}
        {tab === "footer" && (<>
          <Area {...textProps} k="footerDescription" label="Footer description" />
          <Text {...textProps} k="copyrightText" label="Copyright text" help="The year is added automatically: © {current year} + this text." />
          <Rows {...{ s, set, canWrite }} k="footerLinks" label="Legal / footer links" cols={[{ key: "label", label: "Label" }, { key: "href", label: "URL" }]} />
        </>)}
        {tab === "seo" && (<>
          <Text {...textProps} k="siteUrl" label="Canonical site URL (reference only)" help="Canonical, Open Graph and sitemap URLs are always emitted as https://www.mrhomerealestate.com so previews and legacy domains cannot leak into search results." />
          <Text {...textProps} k="seoDefaultTitle" label="Default title" /><Area {...textProps} k="seoDefaultDescription" label="Default description" />
          <div><label className={labelCls}>Default Open Graph image</label><ImageInput value={s.seoOgImage} onChange={(v) => set("seoOgImage", v)} /></div>
          <div className="grid gap-4 md:grid-cols-2"><Text {...textProps} k="gaId" label="Google Analytics ID" help="Loaded only after cookie consent." /><Text {...textProps} k="metaPixelId" label="Meta Pixel ID" /></div>
        </>)}
        {tab === "whatsapp" && (<>
          <Text {...textProps} k="whatsapp" label="Default WhatsApp number" />
          <Area {...textProps} k="whatsappDefaultMessage" label="General message template" />
          <Area {...textProps} k="whatsappProjectMessage" label="Project inquiry template" help="Variables: {{project}}, {{market}}" />
          <Area {...textProps} k="whatsappMarketMessage" label="Market inquiry template" help="Variables: {{market}}" />
        </>)}
        {tab === "forms" && (<>
          <div><div className={labelCls}>Inquiry form fields</div><div className="flex flex-wrap gap-2">{ALL_FIELDS.map((f) => <label key={f} className={cn("cursor-pointer rounded-full border px-3 py-1.5 text-[12.5px]", s.contactFields.includes(f) ? "border-brand bg-brand/10 text-brand" : "border-ink/10")}><input type="checkbox" className="sr-only" disabled={!canWrite} checked={s.contactFields.includes(f)} onChange={(e) => set("contactFields", e.target.checked ? [...s.contactFields, f] : s.contactFields.filter((x) => x !== f))} />{f}</label>)}</div><p className="mt-1 text-[11.5px] text-mist">Name and email are always required for a valid lead.</p></div>
          <div className="grid gap-4 md:grid-cols-2"><Lines {...textProps} k="budgetOptions" label="Budget options" help="Add the exact option “Custom” to let visitors enter their own budget amount." /><Lines {...textProps} k="interestOptions" label="Property interest options" /></div>
          <div className="grid gap-4 md:grid-cols-2"><Toggle {...textProps} k="cityFieldEnabled" label="Show city dropdown on inquiry forms (options come from each market's cities)" /><Toggle {...textProps} k="customBudgetEnabled" label="Allow custom budget amounts (requires a “Custom” budget option)" /></div>
          <div className="grid gap-4 md:grid-cols-2"><Text {...textProps} k="newsletterTitle" label="Newsletter title" /><Text {...textProps} k="newsletterDescription" label="Newsletter description" /></div>
          <Toggle {...textProps} k="newsletterEnabled" label="Enable newsletter signup in footer" />
        </>)}
        {tab === "lyp" && (<>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className={labelCls}>Hero eyebrow</label><input value={lyp.eyebrow} onChange={(e) => setLyp({ ...lyp, eyebrow: e.target.value })} className={inputCls} disabled={!canWrite} /></div>
            <div><label className={labelCls}>Hero title</label><input value={lyp.title} onChange={(e) => setLyp({ ...lyp, title: e.target.value })} className={inputCls} disabled={!canWrite} /></div>
          </div>
          <div><label className={labelCls}>Hero paragraph</label><textarea rows={2} value={lyp.heroBody} onChange={(e) => setLyp({ ...lyp, heroBody: e.target.value })} className={cn(inputCls, "h-auto py-2")} disabled={!canWrite} /></div>
          <div><label className={labelCls}>Hero side image</label><ImageInput value={lyp.heroImage ?? ""} onChange={(v) => setLyp({ ...lyp, heroImage: v })} /></div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className={labelCls}>Form heading</label><input value={lyp.formTitle} onChange={(e) => setLyp({ ...lyp, formTitle: e.target.value })} className={inputCls} disabled={!canWrite} /></div>
            <div><label className={labelCls}>Form CTA label</label><input value={lyp.formCtaLabel ?? ""} onChange={(e) => setLyp({ ...lyp, formCtaLabel: e.target.value })} className={inputCls} disabled={!canWrite} placeholder="e.g. Book a free valuation" /></div>
          </div>
          <div className="grid gap-4 md:grid-cols-2"><div><label className={labelCls}>Form CTA link</label><input value={lyp.formCtaHref ?? ""} onChange={(e) => setLyp({ ...lyp, formCtaHref: e.target.value })} className={inputCls} disabled={!canWrite} placeholder="/contact or https://…" /></div></div>
          <div><label className={labelCls}>Form intro paragraph</label><textarea rows={2} value={lyp.formIntro} onChange={(e) => setLyp({ ...lyp, formIntro: e.target.value })} className={cn(inputCls, "h-auto py-2")} disabled={!canWrite} /></div>
          <div><div className={labelCls}>List Your Property form fields</div><div className="flex flex-wrap gap-2">{LYP_FIELDS.filter((f) => f !== "name").map((f) => <label key={f} className={cn("cursor-pointer rounded-full border px-3 py-1.5 text-[12.5px]", lyp.contactFields.includes(f) ? "border-brand bg-brand/10 text-brand" : "border-ink/10")}><input type="checkbox" className="sr-only" disabled={!canWrite} checked={lyp.contactFields.includes(f)} onChange={(e) => setLyp({ ...lyp, contactFields: e.target.checked ? [...lyp.contactFields, f] : lyp.contactFields.filter((x) => x !== f) })} />{f}</label>)}</div><p className="mt-1 text-[11.5px] text-mist">Full name is always required. Toggle each remaining field on/off for the public List Your Property form.</p></div>
          <Toggle {...textProps} k="showEmailCard" label="Show the email contact card below the phone card on the List Your Property page (uses the Contact tab email)" />
          <LypItems lyp={lyp} setLyp={setLyp} field="benefits" label="Benefits (why list with us)" maxItems={8} canWrite={canWrite} />
          <LypItems lyp={lyp} setLyp={setLyp} field="steps" label="Process steps" maxItems={10} canWrite={canWrite} />
          <p className="text-[11.5px] text-mist">These fields update the public /list-your-property page instantly. FAQs come from Admin → FAQs.</p>
        </>)}
        {tab === "notifications" && s && (<>
          {(() => { const n = s.notifications; const setN = (patch: Partial<LeadNotifications>) => setS({ ...s, notifications: { ...n, ...patch } }); return (<>
            <label className="flex items-center gap-3">
              <button type="button" role="switch" aria-checked={n.leadsEnabled} disabled={!canWrite} onClick={() => setN({ leadsEnabled: !n.leadsEnabled })} className={cn("relative h-6 w-11 rounded-full transition", n.leadsEnabled ? "bg-brand" : "bg-slate-300")}>
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", n.leadsEnabled ? "left-[22px]" : "left-0.5")} />
              </button>
              <span className="text-[13.5px]">Desktop notification when a new lead arrives</span>
            </label>
            <p className="text-[11.5px] text-mist">Fires as a native Windows/macOS toast in any open admin browser tab, with sound.</p>
            <div className="grid gap-4 md:grid-cols-3">
              <div><label className={labelCls}>Polling interval (seconds)</label><input type="number" min={5} max={300} value={n.pollSeconds} onChange={(e) => setN({ pollSeconds: Math.max(5, Math.min(300, Number(e.target.value) || 20)) })} className={inputCls} disabled={!canWrite} /></div>
              <div><label className={labelCls}>Sound volume ({n.volume}%)</label><input type="range" min={0} max={100} value={n.volume} onChange={(e) => setN({ volume: Number(e.target.value) })} className="mt-3 w-full accent-[var(--brand)]" disabled={!canWrite} /></div>
              <div><label className={labelCls}>Notification sound</label><select value={n.sound} onChange={(e) => setN({ sound: e.target.value as LeadNotifications["sound"] })} className={inputCls} disabled={!canWrite}><option value="chime">Chime (built-in)</option><option value="ding">Ding (built-in)</option><option value="custom">Custom sound file</option></select></div>
            </div>
            {n.sound === "custom" && (
              <div><label className={labelCls}>Custom sound URL</label><input value={n.soundUrl} onChange={(e) => setN({ soundUrl: e.target.value })} placeholder="https://…/new-lead.mp3 (mp3/wav/ogg)" className={inputCls} disabled={!canWrite} /><p className="mt-1 text-[11.5px] text-mist">Upload your own sound to the Media Library or host it anywhere — paste the direct audio file URL here.</p></div>
            )}
            <div><label className={labelCls}>Notification title</label><input value={n.titleTemplate} onChange={(e) => setN({ titleTemplate: e.target.value })} placeholder="New lead — {{source}}" className={inputCls} disabled={!canWrite} /><p className="mt-1 text-[11.5px] text-mist">Variable: {"{{source}}"} = form source (e.g. contact form, brochure download, list-your-property).</p></div>
            <div>
              <div className={labelCls}>Who gets notified (roles)</div>
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => {
                  const on = n.notifyRoles.includes(r);
                  return (
                    <label key={r} className={cn("cursor-pointer rounded-full border px-3 py-1.5 text-[12.5px]", on ? "border-brand bg-brand/10 text-brand" : "border-ink/10 text-charcoal")}>
                      <input type="checkbox" className="sr-only" disabled={!canWrite} checked={on} onChange={(e) => setN({ notifyRoles: e.target.checked ? [...n.notifyRoles, r] : n.notifyRoles.filter((x) => x !== r) })} />
                      {r === "SUPER_ADMIN" ? "Super Admin" : r === "ADMIN" ? "Admin" : r === "EDITOR" ? "Editor" : r}
                    </label>
                  );
                })}
              </div>
              <p className="mt-1 text-[11.5px] text-mist">Leave empty to notify everyone with lead access; otherwise only the selected roles receive notifications.</p>
            </div>
            <div className="flex items-center gap-3">
              <Btn type="button" size="sm" variant="secondary" onClick={async () => {
                if (typeof Notification !== "undefined" && Notification.permission === "default") await Notification.requestPermission();
                playSound(n.sound, n.soundUrl, n.volume);
                fireNotification(n.titleTemplate || "New lead — {{source}}", { name: "Test lead", source: "Test", city: "Dubai", page: null });
                toast("Test notification sent (check your browser permission if nothing appeared)");
              }}>Send test notification</Btn>
              <span className="text-[12px] text-mist">{typeof Notification !== "undefined" ? `Browser permission: ${Notification.permission}` : "Not supported in this browser"}</span>
            </div>
          </>); })()}
        </>)}
        {tab === "automation" && (() => { const a = s.automations; const setA = (patch: Partial<Automations>) => setS({ ...s, automations: { ...a, ...patch } }); return (<>
          <p className="text-[12.5px] text-charcoal/70">Rules that run automatically on every new lead — no manual triage needed. Save settings first, then they apply to the next enquiry.</p>

          <label className="flex items-start gap-3 rounded-xl border border-ink/8 p-3">
            <button type="button" role="switch" aria-checked={a.autoScore} disabled={!canWrite} onClick={() => setA({ autoScore: !a.autoScore })} className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition", a.autoScore ? "bg-brand" : "bg-slate-300")}>
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", a.autoScore ? "left-[22px]" : "left-0.5")} />
            </button>
            <span><span className="block text-[13.5px] font-medium text-ink">Auto-score every lead</span><span className="block text-[11.5px] text-mist">Rates intent 0–100 from budget, market, contact detail and source so the inbox is already prioritised.</span></span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-ink/8 p-3">
            <button type="button" role="switch" aria-checked={a.autoAssign} disabled={!canWrite} onClick={() => setA({ autoAssign: !a.autoAssign })} className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition", a.autoAssign ? "bg-brand" : "bg-slate-300")}>
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", a.autoAssign ? "left-[22px]" : "left-0.5")} />
            </button>
            <span><span className="block text-[13.5px] font-medium text-ink">Auto-assign to the least busy advisor</span><span className="block text-[11.5px] text-mist">Balances new leads across built-in team roles with lead access (Super Admin / Admin / Editor). Manual assignment always wins.</span></span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-ink/8 p-3">
            <button type="button" role="switch" aria-checked={a.autoFollowUp} disabled={!canWrite} onClick={() => setA({ autoFollowUp: !a.autoFollowUp })} className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition", a.autoFollowUp ? "bg-brand" : "bg-slate-300")}>
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", a.autoFollowUp ? "left-[22px]" : "left-0.5")} />
            </button>
            <span><span className="block text-[13.5px] font-medium text-ink">Create a first follow-up task</span><span className="block text-[11.5px] text-mist">Adds a due task to the lead so nothing sits untouched in the pipeline.</span></span>
          </label>
          {a.autoFollowUp && <div className="max-w-[220px]"><label className={labelCls}>Follow up within (hours)</label><input type="number" min={1} max={720} value={a.followUpHours} onChange={(e) => setA({ followUpHours: Math.max(1, Math.min(720, Number(e.target.value) || 24)) })} className={inputCls} disabled={!canWrite} /></div>}

          <label className="flex items-start gap-3 rounded-xl border border-ink/8 p-3">
            <button type="button" role="switch" aria-checked={a.staleArchive} disabled={!canWrite} onClick={() => setA({ staleArchive: !a.staleArchive })} className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition", a.staleArchive ? "bg-brand" : "bg-slate-300")}>
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", a.staleArchive ? "left-[22px]" : "left-0.5")} />
            </button>
            <span><span className="block text-[13.5px] font-medium text-ink">Archive stale leads automatically</span><span className="block text-[11.5px] text-mist">Moves New / Contacted leads with no activity for the window below out of the working inbox (recoverable — nothing is deleted).</span></span>
          </label>
          {a.staleArchive && <div className="max-w-[220px]"><label className={labelCls}>Stale after (days)</label><input type="number" min={3} max={365} value={a.staleArchiveDays} onChange={(e) => setA({ staleArchiveDays: Math.max(3, Math.min(365, Number(e.target.value) || 45)) })} className={inputCls} disabled={!canWrite} /></div>}

          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3">
            <Btn type="button" size="sm" variant="secondary" disabled={!canWrite} onClick={async () => {
              try {
                const res = await api<{ message?: string }>("/api/admin/automations", { method: "POST" });
                toast(res.message ?? "Automation run complete");
              } catch (e) { toast((e as Error).message, "error"); }
            }}>Run stale-lead cleanup now</Btn>
            <span className="text-[11.5px] text-mist">Safe to run any time — only archives leads past the stale window.</span>
          </div>
        </>); })()}
        {tab === "intro" && (<>
          <Toggle {...textProps} k="introVideoEnabled" label="Play intro video on homepage (once per session)" />
          <Text {...textProps} k="introVideoUrl" label="Intro video URL" help="Default is the supplied Cloudinary asset with the audio track stripped (ac_none)." />
          <div><label className={labelCls}>Poster image</label><ImageInput value={s.introVideoPoster} onChange={(v) => set("introVideoPoster", v)} /></div>
        </>)}
        {tab === "legal" && (<><Area {...textProps} k="cookieConsentText" label="Cookie consent text" /><Area {...textProps} k="disclaimer" label="Real estate disclaimer" /></>)}
      </div>
      {canWrite && <div className="sticky bottom-4 flex justify-end rounded-2xl border border-ink/8 bg-white/90 p-3 shadow-lg backdrop-blur"><Btn loading={saving} onClick={save}>Save settings</Btn></div>}
    </div>
  );
}
