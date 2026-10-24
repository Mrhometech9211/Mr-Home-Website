"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Eye as EyeIcon, EyeOff, Plus, Trash2 } from "lucide-react";
import { Badge, Btn, Input, Textarea as UiTextarea, inputCls } from "@/components/admin/ui";
import { IMAGE_LAYOUTS, SECTION_TYPES, type BuilderItem, type BuilderSection, type ImageLayout } from "@/lib/page-builder";

/**
 * Phase 7 admin building blocks. Pages edit structured BuilderSection values;
 * rendering lives in <PageBuilder/> so editor output and live output match.
 */
export type { BuilderSection };

type MetaState = {
  title: string;
  slug: string;
  navLabel: string;
  navOrder: number;
  navVisible: boolean;
  seoTitle: string;
  seoDescription: string;
  noIndex: boolean;
  ogImage: string;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wider text-charcoal/70">{label}</span>
      {children}
    </label>
  );
}

export function PageMetaEditor({
  meta,
  onChange,
  pageSlug,
}: {
  meta: Partial<MetaState>;
  onChange: (patch: Partial<MetaState> | Record<string, unknown>) => void;
  pageSlug?: string;
}) {
  return (
    <div className="space-y-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <Input value={meta.title ?? ""} onChange={(e) => onChange({ title: e.target.value })} placeholder="Page title" maxLength={140} />
        </Field>
        <Field label="URL slug">
          <Input
            value={meta.slug ?? ""}
            onChange={(e) => onChange({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-").replace(/^-+/, "") })}
            placeholder="about-us"
            maxLength={140}
            inputMode="url"
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nav label (optional)">
          <Input value={meta.navLabel ?? ""} onChange={(e) => onChange({ navLabel: e.target.value })} placeholder="Shown in the main menu" maxLength={60} />
        </Field>
        <Field label="Nav order">
          <input
            type="number"
            min={0}
            max={99}
            className={inputCls}
            value={String(meta.navOrder ?? 0)}
            onChange={(e) => onChange({ navOrder: Math.max(0, Math.min(99, Number(e.target.value) || 0)) })}
          />
        </Field>
        <label className="flex items-end gap-2 pb-2 text-[13px] text-ink">
          <input type="checkbox" checked={meta.navVisible ?? true} onChange={(e) => onChange({ navVisible: e.target.checked })} className="h-4 w-4 rounded border-ink/20 accent-brand" />
          In main menu once published
        </label>
      </div>
      <hr className="border-ink/8" />
      <p className="text-[12px] font-semibold uppercase tracking-wider text-charcoal/70">SEO</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="SEO title">
          <Input value={meta.seoTitle ?? ""} onChange={(e) => onChange({ seoTitle: e.target.value })} placeholder="Defaults to the page title" maxLength={170} />
        </Field>
        <Field label="Open Graph image URL">
          <Input value={meta.ogImage ?? ""} onChange={(e) => onChange({ ogImage: e.target.value })} placeholder="https://…" maxLength={2000} />
        </Field>
      </div>
      <Field label="Meta description">
        <UiTextarea value={meta.seoDescription ?? ""} onChange={(e) => onChange({ seoDescription: e.target.value })} placeholder="Up to ~320 characters" maxLength={320} rows={2} />
      </Field>
      <label className="flex items-center gap-2 text-[13px] text-ink">
        <input type="checkbox" checked={meta.noIndex ?? false} onChange={(e) => onChange({ noIndex: e.target.checked })} className="h-4 w-4 rounded border-ink/20 accent-brand" />
        Hide this page from search engines and the sitemap (noindex)
      </label>
      {pageSlug && meta.slug && meta.slug !== pageSlug && (
        <p className="text-[12px] text-amber-600">Slug changes to /{meta.slug} when info is saved and content is republished.</p>
      )}
    </div>
  );
}

/* ---------------- Sections ---------------- */

const SECTION_LABELS = Object.fromEntries(SECTION_TYPES.map((t) => [t.value, t.label])) as Record<BuilderSection["type"], string>;

function blankId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 63);
}

export function SectionListEditor({
  initial,
  onSave,
  saving,
  disabled,
}: {
  initial: BuilderSection[];
  onSave: (sections: BuilderSection[]) => void;
  saving?: boolean;
  disabled?: boolean;
}) {
  const [sections, setSections] = useState<BuilderSection[]>(Array.isArray(initial) ? initial : []);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const addWrapRef = useRef<HTMLDivElement>(null);

  // Close the "Add block" dropdown on any outside click (a <details>/<summary>
  // pair does not fire toggle events reliably for clicks on inner buttons).
  useEffect(() => {
    if (!addOpen) return;
    const onDown = (e: MouseEvent) => {
      if (addWrapRef.current && !addWrapRef.current.contains(e.target as Node)) setAddOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [addOpen]);

  const update = (s: BuilderSection) => {
    setSections((prev) => prev.map((x) => (x.id === s.id ? s : x)));
    setDirty(true);
  };
  const add = (type: BuilderSection["type"]) => {
    const next: BuilderSection = { id: blankId(), type };
    setSections((prev) => [...prev, next]);
    setDirty(true);
    setOpen((o) => ({ ...o, [next.id]: true }));
  };
  const remove = (id: string) => {
    setSections((prev) => prev.filter((x) => x.id !== id));
    setDirty(true);
  };
  const move = (from: number, to: number) => {
    setSections((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDirty(true);
  };

  return (
    <div className="rounded-2xl border border-ink/8 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-ink">Sections</h2>        <div ref={addWrapRef} className="relative">
          <span className="inline-flex">
            <Btn variant="secondary" size="sm" type="button" onClick={() => setAddOpen((v) => !v)} aria-expanded={addOpen}>
              <Plus className="h-4 w-4" /> Add block
            </Btn>
          </span>
          {addOpen && (
            <div className="absolute right-0 z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-xl border border-ink/10 bg-white shadow-lg">
              {SECTION_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className="block w-full px-4 py-2 text-left text-[13px] text-ink hover:bg-slate-50"
                  onClick={() => {
                    setAddOpen(false);
                    add(t.value);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink/15 bg-slate-50/60 p-6 text-center text-[13px] text-mist">
          No sections yet — add your first block.
        </p>
      ) : (
        <ul className="space-y-2">
          {sections.map((s, idx) => (
            <li key={s.id} className="rounded-xl border border-ink/8 bg-slate-50/70">
              <div className="flex items-center gap-1.5 px-3 py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-ink/10 bg-white text-[11px] font-semibold text-charcoal">{idx + 1}</span>
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))} aria-expanded={!!open[s.id]}>
                  <span className="truncate text-[13px] font-medium text-ink">{SECTION_LABELS[s.type] ?? s.type}</span>
                  {s.hidden ? <Badge tone="slate">hidden</Badge> : null}
                  {(s.eyebrow || s.title) && <span className="truncate text-[12px] text-mist">{(s.eyebrow || s.title || "").trim()}</span>}
                </button>
                <Btn variant="ghost" size="sm" className="!px-2" title={s.hidden ? "Show section" : "Hide section"} onClick={() => update({ ...s, hidden: !s.hidden })}>
                  {s.hidden ? <EyeOff className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </Btn>
                <Btn variant="ghost" size="sm" className="!px-2" title="Move up" disabled={idx === 0} onClick={() => move(idx, idx - 1)}>
                  <ChevronUp className="h-4 w-4" />
                </Btn>
                <Btn variant="ghost" size="sm" className="!px-2" title="Move down" disabled={idx === sections.length - 1} onClick={() => move(idx, idx + 1)}>
                  <ChevronDown className="h-4 w-4" />
                </Btn>
                <Btn variant="ghost" size="sm" className="!px-2 text-red-600" title="Remove section" onClick={() => remove(s.id)}>
                  <Trash2 className="h-4 w-4" />
                </Btn>
              </div>
              {open[s.id] && (
                <div className="space-y-3 border-t border-ink/6 bg-white px-4 py-3">
                  <SectionFields section={s} onChange={(patch) => update({ ...s, ...patch })} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Btn variant="primary" size="sm" loading={saving} disabled={disabled || !dirty} onClick={() => onSave(sections)}>
          Save draft
        </Btn>
        {dirty ? <span className="text-[12px] text-amber-600">Unsaved changes</span> : <span className="text-[12px] text-mist">Saved</span>}
      </div>
    </div>
  );
}

/* -------- per-type fields (matches PageBuilder's renderer exactly) -------- */

const hasEyebrow: BuilderSection["type"][] = ["hero", "text", "imageText", "cta", "form"];
const hasSubtitle: BuilderSection["type"][] = ["hero", "imageText"];
const hasBody: BuilderSection["type"][] = ["hero", "text", "imageText", "cta", "video", "form"];
const hasImage: BuilderSection["type"][] = ["hero", "imageText", "text"];
const hasCta: BuilderSection["type"][] = ["hero", "imageText", "cta"];
const hasCta2: BuilderSection["type"][] = ["hero", "imageText"];
const hasItems: BuilderSection["type"][] = ["cards", "stats", "steps", "faq", "testimonials"];

function SectionFields({ section: s, onChange }: { section: BuilderSection; onChange: (patch: Partial<BuilderSection>) => void }) {
  const t = s.type;
  const toNull = (v: string) => (v.length ? v : null);
  return (
    <div className="space-y-3">
      {hasEyebrow.includes(t) && (
        <Field label="Eyebrow">
          <Input value={s.eyebrow ?? ""} onChange={(e) => onChange({ eyebrow: toNull(e.target.value) })} maxLength={160} />
        </Field>
      )}
      <Field label={t === "video" ? "Title (optional)" : "Title"}>
        <Input value={s.title ?? ""} onChange={(e) => onChange({ title: toNull(e.target.value) })} maxLength={300} />
      </Field>
      {hasSubtitle.includes(t) && (
        <Field label="Subtitle">
          <Input value={s.subtitle ?? ""} onChange={(e) => onChange({ subtitle: toNull(e.target.value) })} maxLength={300} />
        </Field>
      )}
      {t === "video" && (
        <Field label="Video URL (YouTube or Vimeo, https only)">
          <Input value={s.videoUrl ?? ""} onChange={(e) => onChange({ videoUrl: toNull(e.target.value) })} placeholder="https://youtu.be/…" maxLength={500} />
        </Field>
      )}
      {hasBody.includes(t) && (
        <Field label={t === "text" ? "Body (markdown paragraphs supported)" : "Body"}>
          <UiTextarea rows={4} value={s.body ?? ""} onChange={(e) => onChange({ body: toNull(e.target.value) })} />
        </Field>
      )}
      {hasImage.includes(t) && (
        <Field label="Image URL">
          <Input value={s.image ?? ""} onChange={(e) => onChange({ image: toNull(e.target.value) })} maxLength={2000} />
        </Field>
      )}
      {(t === "text" || t === "imageText") && (
        <Field label="Image position">
          <select
            className={inputCls}
            value={s.imageLayout ?? ""}
            onChange={(e) => onChange({ imageLayout: (e.target.value || null) as ImageLayout | null })}
          >
            <option value="">{t === "imageText" ? "Default — side alternates per section" : "Default — image below the text"}</option>
            {IMAGE_LAYOUTS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="mt-1 text-[11.5px] text-mist">
            Paste an image URL above, then choose where it sits: beside the text (left or right) or above/below it.
          </p>
        </Field>
      )}
      {hasCta.includes(t) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Button label">
            <Input value={s.ctaLabel ?? ""} onChange={(e) => onChange({ ctaLabel: toNull(e.target.value) })} maxLength={100} />
          </Field>
          <Field label="Button link">
            <Input value={s.ctaHref ?? ""} onChange={(e) => onChange({ ctaHref: toNull(e.target.value) })} maxLength={500} />
          </Field>
        </div>
      )}
      {hasCta2.includes(t) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Second button label">
            <Input value={s.cta2Label ?? ""} onChange={(e) => onChange({ cta2Label: toNull(e.target.value) })} maxLength={100} />
          </Field>
          <Field label="Second button link">
            <Input value={s.cta2Href ?? ""} onChange={(e) => onChange({ cta2Href: toNull(e.target.value) })} maxLength={500} />
          </Field>
        </div>
      )}
      {hasItems.includes(t) && (
        <Repeatable
          items={s.items ?? []}
          onChange={(items) => onChange({ items })}
          titleField={t !== "stats"}
          valueField={t === "stats"}
          descField={t !== "stats"}
          labelField={t === "stats" || t === "testimonials"}
          imageField={t === "cards"}
        />
      )}
    </div>
  );
}

function Repeatable({
  items,
  onChange,
  titleField,
  valueField,
  descField,
  labelField,
  imageField,
}: {
  items: BuilderItem[];
  onChange: (items: BuilderItem[]) => void;
  titleField?: boolean;
  valueField?: boolean;
  descField?: boolean;
  labelField?: boolean;
  imageField?: boolean;
}) {
  const set = (idx: number, patch: Partial<BuilderItem>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-semibold uppercase tracking-wider text-charcoal/70">Entries</span>
        <Btn variant="ghost" size="sm" onClick={() => onChange([...items, {}])}>
          <Plus className="h-3.5 w-3.5" /> Add entry
        </Btn>
      </div>
      {items.map((it, i) => (
        <div key={i} className="rounded-lg border border-ink/8 bg-slate-50/60 p-3">
          <div className={`grid gap-2 ${imageField ? "sm:grid-cols-2" : ""}`}>
            {titleField && (
              <Field label="Title">
                <Input value={it.title ?? ""} onChange={(e) => set(i, { title: e.target.value.length ? e.target.value : undefined })} maxLength={300} />
              </Field>
            )}
            {valueField && (
              <Field label="Value (e.g. 12+ or 98%)">
                <Input value={it.value ?? ""} onChange={(e) => set(i, { value: e.target.value.length ? e.target.value : undefined })} maxLength={120} />
              </Field>
            )}
            {labelField && (
              <Field label="Label">
                <Input value={it.label ?? ""} onChange={(e) => set(i, { label: e.target.value.length ? e.target.value : undefined })} maxLength={200} />
              </Field>
            )}
            {imageField && (
              <Field label="Image URL">
                <Input value={it.image ?? ""} onChange={(e) => set(i, { image: e.target.value.length ? e.target.value : undefined })} maxLength={2000} />
              </Field>
            )}
          </div>
          {descField && (
            <Field label="Description">
              <UiTextarea rows={2} value={it.description ?? ""} onChange={(e) => set(i, { description: e.target.value.length ? e.target.value : undefined })} />
            </Field>
          )}
          <div className="mt-2 flex justify-end">
            <Btn variant="ghost" size="sm" className="!px-2 text-red-600" title="Remove entry" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </Btn>
          </div>
        </div>
      ))}
    </div>
  );
}
