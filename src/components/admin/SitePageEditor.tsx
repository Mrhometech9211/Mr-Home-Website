"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, Globe, Plus, RotateCcw, Save, Send, Trash2, Undo2 } from "lucide-react";
import { api, Badge, Btn, Card, Input, Skeleton, Textarea, labelCls, useToast } from "@/components/admin/ui";
import { deferInitialLoad } from "@/lib/defer-load";

type Item = { title?: string; description?: string; icon?: string; value?: string; label?: string; image?: string };
type Section = {
  id: number;
  key: string;
  eyebrow: string | null;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  secondaryCtaLabel: string | null;
  secondaryCtaHref: string | null;
  image: string | null;
  video: string | null;
  background: string | null;
  items: Item[];
  order: number;
  enabled: boolean;
  virtual?: boolean;
};
type Seo = {
  title?: string | null;
  description?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  canonical?: string | null;
  noIndex?: boolean;
};
type Patch = Partial<Section>;
type Content = { sections: Record<string, Patch>; seo: Seo };
type Normalization = {
  rows: number;
  converted: number;
  prunedFields: number;
  preserved: { page: string; key: string; reason: string }[];
};
type Data = {
  page: { key: string; title: string; path: string; content: "sections" | "settings" | "listings"; note?: string };
  liveSections: Section[];
  draft: Content;
  publishedAt: string | null;
  updatedAt: string | null;
  normalization?: Normalization;
  seoTitles: { slug: string; title: string | null }[];
  seoDescriptions: { slug: string; description: string | null }[];
};

const TEXT_FIELDS: { name: keyof Section; label: string; hint?: string; area?: boolean }[] = [
  { name: "eyebrow", label: "Eyebrow" },
  { name: "title", label: "Heading" },
  { name: "subtitle", label: "Subheading" },
  { name: "body", label: "Body text", area: true },
  { name: "ctaLabel", label: "Primary button label" },
  { name: "ctaHref", label: "Primary button link" },
  { name: "secondaryCtaLabel", label: "Secondary button label" },
  { name: "secondaryCtaHref", label: "Secondary button link" },
  { name: "image", label: "Image URL", hint: "Pick a URL from the Media library or use a site path." },
  { name: "background", label: "Background (CSS / image URL)" },
  { name: "video", label: "Video URL" },
];

type FieldName = (typeof TEXT_FIELDS)[number]["name"];

/**
 * Fields the Buy/List Your Property renderers actually paint. Keeping this
 * list next to the editor prevents controls that save but never appear on the
 * page. Pages not listed here keep the full generic field set.
 */
const PAGE_FIELDS: Record<string, Record<string, FieldName[]>> = {
  buy: {
    hero: ["eyebrow", "title", "subtitle", "body", "ctaLabel", "ctaHref", "secondaryCtaLabel", "secondaryCtaHref"],
  },
  "list-your-property": {
    hero: ["eyebrow", "title", "subtitle", "body", "ctaLabel", "ctaHref", "secondaryCtaLabel", "secondaryCtaHref", "image"],
    benefits: ["title"],
    steps: ["title"],
    form: ["title", "body", "ctaLabel", "ctaHref"],
  },
};

/** Only these sections render their item cards. */
const PAGE_ITEM_SECTIONS: Record<string, string[]> = {
  buy: [],
  "list-your-property": ["benefits", "steps"],
};

function fieldsFor(pageKey: string, sectionKey: string) {
  const pageFields = PAGE_FIELDS[pageKey];
  if (!pageFields) return TEXT_FIELDS;
  return (pageFields[sectionKey] ?? [])
    .map((name) => TEXT_FIELDS.find((f) => f.name === name))
    .filter((f): f is (typeof TEXT_FIELDS)[number] => Boolean(f));
}

function showsItems(pageKey: string, sectionKey: string) {
  const sections = PAGE_ITEM_SECTIONS[pageKey];
  return sections ? sections.includes(sectionKey) : true;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function normalizedText(value: unknown) {
  if (value == null) return null;
  const text = String(value);
  return text === "" ? null : text;
}

export function SitePageEditor({ slug }: { slug: string }) {
  const { toast } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [content, setContent] = useState<Content>({ sections: {}, seo: {} });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ data: Data }>(`/api/admin/site-pages/${slug}`);
      setData(res.data);
      setContent({ sections: res.data.draft.sections ?? {}, seo: res.data.draft.seo ?? {} });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load this page", "error");
    } finally {
      setLoading(false);
    }
  }, [slug, toast]);

  useEffect(() => deferInitialLoad(() => load()), [load]);

  const setSeo = (field: keyof Seo, value: string | boolean) =>
    setContent((c) => ({ ...c, seo: { ...c.seo, [field]: value } }));

  const patchFor = (key: string) => content.sections[key] ?? {};

  const isOverridden = (key: string, field: string) => Object.prototype.hasOwnProperty.call(patchFor(key), field);

  const display = <K extends keyof Section>(row: Section, field: K): Section[K] => {
    const patch = patchFor(row.key);
    return (Object.prototype.hasOwnProperty.call(patch, field) ? patch[field] : row[field]) as Section[K];
  };

  const updatePatch = (key: string, next: Patch) =>
    setContent((c) => {
      const sections = { ...c.sections };
      if (Object.keys(next).length === 0) delete sections[key];
      else sections[key] = next;
      return { ...c, sections };
    });

  const setField = (row: Section, field: keyof Section, value: string) => {
    const patch = { ...patchFor(row.key) };
    if (normalizedText(value) === normalizedText(row[field])) delete patch[field];
    else patch[field] = value as never;
    updatePatch(row.key, patch);
  };

  const inheritField = (row: Section, field: keyof Section) => {
    const patch = { ...patchFor(row.key) };
    delete patch[field];
    updatePatch(row.key, patch);
  };

  const setItems = (row: Section, items: Item[]) => {
    const patch = { ...patchFor(row.key) };
    if (stable(items) === stable(row.items ?? [])) delete patch.items;
    else patch.items = items;
    updatePatch(row.key, patch);
  };

  const saveDraft = useCallback(
    async (silent = false) => {
      setBusy("save");
      try {
        const res = await api<{ content: Content }>(`/api/admin/site-pages/${slug}`, {
          method: "PUT",
          body: JSON.stringify({ content }),
        });
        // The API re-prunes against the base; adopt exactly what was stored.
        setContent({ sections: res.content.sections ?? {}, seo: res.content.seo ?? {} });
        if (!silent) toast("Draft saved — only changed fields were stored; nothing is published yet", "success");
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not save the draft", "error");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [content, slug, toast],
  );

  const publish = async () => {
    if (!(await saveDraft(true))) return;
    setBusy("publish");
    try {
      await api(`/api/admin/site-pages/${slug}`, { method: "POST", body: JSON.stringify({ action: "publish" }) });
      toast("Published. Only this page's overrides changed; Content values still flow through elsewhere.", "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not publish", "error");
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    setBusy("discard");
    try {
      await api(`/api/admin/site-pages/${slug}`, { method: "POST", body: JSON.stringify({ action: "discard" }) });
      toast("Draft reset to the published version", "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not reset the draft", "error");
    } finally {
      setBusy(null);
    }
  };

  const preview = async () => {
    if (!(await saveDraft(true))) return;
    setBusy("preview");
    try {
      const res = await api<{ url: string }>(`/api/admin/site-pages/${slug}`, {
        method: "POST",
        body: JSON.stringify({ action: "preview" }),
      });
      window.open(res.url, "_blank", "noopener,noreferrer");
      toast("Preview enabled in a new tab for 1 hour (this browser only). Public visitors are unchanged.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not start preview", "error");
    } finally {
      setBusy(null);
    }
  };

  const exitPreview = async () => {
    try {
      await api(`/api/admin/site-pages/${slug}`, { method: "POST", body: JSON.stringify({ action: "exit-preview" }) });
      toast("Preview mode off", "success");
    } catch {
      /* preview cookie is harmless; ignore */
    }
  };

  const duplicateTitle = useMemo(() => {
    const mine = (content.seo.title ?? "").trim().toLowerCase();
    if (!mine) return null;
    return data?.seoTitles.find((t) => t.slug !== slug && (t.title ?? "").trim().toLowerCase() === mine) ?? null;
  }, [content.seo.title, data?.seoTitles, slug]);

  const duplicateDescription = useMemo(() => {
    const mine = (content.seo.description ?? "").trim().toLowerCase();
    if (!mine) return null;
    return data?.seoDescriptions.find((d) => d.slug !== slug && (d.description ?? "").trim().toLowerCase() === mine) ?? null;
  }, [content.seo.description, data?.seoDescriptions, slug]);

  if (loading) return <Skeleton className="h-[520px]" />;
  if (!data) return <p className="text-[13px] text-mist">This page could not be loaded.</p>;

  const seo = content.seo;
  const titleLen = (seo.title ?? "").length;
  const descLen = (seo.description ?? "").length;
  const preserved = (data.normalization?.preserved ?? []).filter((p) => p.page === slug);
  const totalOverrides = Object.values(content.sections).reduce((n, p) => n + Object.keys(p).length, 0);

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/site-pages" className="inline-flex items-center gap-1.5 text-[12.5px] text-mist hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> All built-in pages
          </Link>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight">{data.page.title}</h1>
          <p className="mt-1 text-[13px] text-mist">
            Built-in page ·{" "}
            <a href={data.page.path} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-2">
              {data.page.path}
            </a>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={data.publishedAt ? "green" : "slate"}>
            {data.publishedAt ? `Published ${new Date(data.publishedAt).toLocaleDateString("en-GB")}` : "No published override"}
          </Badge>
          <Btn variant="ghost" size="sm" onClick={exitPreview}><EyeOff className="h-4 w-4" /> Exit preview</Btn>
          <Btn variant="secondary" size="sm" loading={busy === "preview"} onClick={preview}><Eye className="h-4 w-4" /> Preview draft</Btn>
          <Btn variant="ghost" size="sm" loading={busy === "save"} onClick={() => saveDraft()}><Save className="h-4 w-4" /> Save draft</Btn>
          <Btn variant="primary" size="sm" loading={busy === "publish"} onClick={publish}><Send className="h-4 w-4" /> Publish</Btn>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
        Saving stores a private draft of <strong>changed fields only</strong>. Unchanged fields keep following Content/Settings. Visitors see the last published result until you press <strong>Publish</strong>.
      </div>

      {data.page.note && (
        <div className="rounded-xl border border-ink/8 bg-white px-4 py-3 text-[12.5px] text-charcoal/75">
          {data.page.note}{" "}
          {data.page.key === "list-your-property" && (
            <Link href="/admin/settings" className="text-brand underline underline-offset-2">Open Settings → List Your Property</Link>
          )}
          {data.page.key === "buy" && (
            <Link href="/admin/projects" className="text-brand underline underline-offset-2">Open Projects</Link>
          )}
        </div>
      )}

      {preserved.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] text-red-800">
          Legacy fields that could not be matched safely were preserved and left untouched:{" "}
          {preserved.map((p) => `${p.key} (${p.reason})`).join("; ")}.
        </div>
      )}

      <Card title="Search appearance & social sharing">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className={labelCls}>Page URL</label>
            <div className="flex h-10 items-center rounded-lg border border-ink/10 bg-slate-50 px-3 text-[13px] text-charcoal/75">
              <Globe className="mr-2 h-3.5 w-3.5 text-mist" /> {data.page.path}
            </div>
            <p className="mt-1.5 text-[11.5px] text-mist">Set on the page itself; links and URLs do not change here.</p>
          </div>
          <div>
            <label className={labelCls}>Canonical URL</label>
            <Input value={seo.canonical ?? ""} onChange={(e) => setSeo("canonical", e.target.value)} placeholder="Leave blank to use the page URL" />
            <p className="mt-1.5 text-[11.5px] text-mist">Only change this if this page should point search engines to a different URL.</p>
          </div>
          <div>
            <label className={labelCls}>SEO title</label>
            <Input value={seo.title ?? ""} onChange={(e) => setSeo("title", e.target.value)} maxLength={120} />
            <p className={`mt-1.5 text-[11.5px] ${titleLen > 60 ? "text-amber-700" : "text-mist"}`}>{titleLen}/60 characters · wording only; rankings are never guaranteed.</p>
            {!seo.title?.trim() && <p className="mt-1 text-[11.5px] text-amber-700">Blank — the page falls back to its built-in title.</p>}
            {duplicateTitle && <p className="mt-1 text-[11.5px] text-red-600">This title is also used on another built-in page. Duplicate titles are harder to tell apart in search.</p>}
          </div>
          <div>
            <label className={labelCls}>Meta description</label>
            <Textarea rows={3} value={seo.description ?? ""} onChange={(e) => setSeo("description", e.target.value)} maxLength={320} />
            <p className={`mt-1.5 text-[11.5px] ${descLen > 160 ? "text-amber-700" : "text-mist"}`}>{descLen}/160 characters · metadata does not by itself improve rankings.</p>
            {!seo.description?.trim() && <p className="mt-1 text-[11.5px] text-amber-700">Blank — the default description is used.</p>}
            {duplicateDescription && <p className="mt-1 text-[11.5px] text-red-600">This description is also used on another built-in page.</p>}
          </div>
          <div>
            <label className={labelCls}>Open Graph title</label>
            <Input value={seo.ogTitle ?? ""} onChange={(e) => setSeo("ogTitle", e.target.value)} placeholder="Defaults to the SEO title" />
          </div>
          <div>
            <label className={labelCls}>Open Graph description</label>
            <Textarea rows={2} value={seo.ogDescription ?? ""} onChange={(e) => setSeo("ogDescription", e.target.value)} placeholder="Defaults to the meta description" />
          </div>
          <div>
            <label className={labelCls}>Social share image</label>
            <Input value={seo.ogImage ?? ""} onChange={(e) => setSeo("ogImage", e.target.value)} placeholder="/images/… or https://…" />
          </div>
          <label className="flex items-start gap-2.5 rounded-lg border border-ink/10 px-3 py-2.5">
            <input type="checkbox" className="mt-0.5 accent-[var(--brand)]" checked={!!seo.noIndex} onChange={(e) => setSeo("noIndex", e.target.checked)} />
            <span className="text-[12.5px] text-charcoal/80">Hide this page from search engines (no-index). Use sparingly.</span>
          </label>
        </div>
      </Card>

      <div className="space-y-4">
        {data.liveSections.length === 0 && (
          <div className="rounded-xl border border-ink/8 bg-white px-4 py-6 text-[13px] text-mist">
            This page has no editable sections. Add them under Content, then return here.
          </div>
        )}
        {data.liveSections.map((row) => {
          const patch = patchFor(row.key);
          const overriddenCount = Object.keys(patch).length;
          const items = (patch.items ?? row.items ?? []) as Item[];
          const fields = fieldsFor(data.page.key, row.key);
          const itemFields = showsItems(data.page.key, row.key);
          return (
            <details key={row.key} open={row.key === "hero"} className="rounded-2xl border border-ink/8 bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                <div>
                  <span className="text-[14px] font-medium text-ink">{row.title || row.key}</span>
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-mist">{row.key}</span>
                  {row.virtual && <span className="ml-1 rounded bg-brand/10 px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-brand">Stats source: Settings</span>}
                  {overriddenCount > 0 && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-800">{overriddenCount} override{overriddenCount === 1 ? "" : "s"}</span>}
                </div>
                <span className="text-[11.5px] text-mist">{row.enabled ? "visible" : "disabled"}</span>
              </summary>
              <div className="border-t border-ink/6 p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  {fields.map((f) => {
                    const overridden = isOverridden(row.key, f.name);
                    const value = (display(row, f.name) as string | null) ?? "";
                    return (
                      <div key={f.name} className={f.area || f.name === "background" ? "md:col-span-2" : ""}>
                        <div className="flex items-center justify-between gap-2">
                          <label className={labelCls}>{f.label}</label>
                          {overridden && (
                            <button type="button" onClick={() => inheritField(row, f.name)} className="mb-1.5 inline-flex items-center gap-1 text-[10.5px] font-medium text-brand hover:underline">
                              <Undo2 className="h-3 w-3" /> Use Content value
                            </button>
                          )}
                        </div>
                        {f.area ? (
                          <Textarea rows={3} value={value} onChange={(e) => setField(row, f.name, e.target.value)} />
                        ) : (
                          <Input value={value} onChange={(e) => setField(row, f.name, e.target.value)} />
                        )}
                        {overridden && <p className="mt-1 text-[10.5px] text-amber-700">Overrides Content — blank here clears the value.</p>}
                        {f.hint && <p className="mt-1 text-[11px] text-mist">{f.hint}</p>}
                      </div>
                    );
                  })}
                </div>

                {itemFields && <div className="mt-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className={labelCls}>Cards / stats / steps ({items.length})</label>
                      {isOverridden(row.key, "items") && (
                        <button type="button" onClick={() => inheritField(row, "items")} className="mb-1.5 inline-flex items-center gap-1 text-[10.5px] font-medium text-brand hover:underline">
                          <Undo2 className="h-3 w-3" /> Use Content list
                        </button>
                      )}
                    </div>
                    <Btn variant="ghost" size="sm" onClick={() => setItems(row, [...items, { title: "", description: "" }])}>
                      <Plus className="h-3.5 w-3.5" /> Add item
                    </Btn>
                  </div>
                  <div className="space-y-2">
                    {items.map((item, idx) => (
                      <div key={idx} className="grid gap-2 rounded-lg border border-ink/8 bg-slate-50/60 p-3 md:grid-cols-[1fr_1.4fr_auto]">
                        <Input
                          placeholder="Title / value"
                          value={item.title ?? item.value ?? ""}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx] = { ...item, title: e.target.value, value: item.value ? e.target.value : item.value };
                            setItems(row, next);
                          }}
                        />
                        <Input
                          placeholder="Description / label"
                          value={item.description ?? item.label ?? ""}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx] = { ...item, description: e.target.value, label: item.label ? e.target.value : item.label };
                            setItems(row, next);
                          }}
                        />
                        <Btn variant="ghost" size="sm" onClick={() => setItems(row, items.filter((_, i) => i !== idx))} aria-label="Remove item">
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Btn>
                      </div>
                    ))}
                    {items.length === 0 && <p className="text-[12px] text-mist">No items — the section renders without a card list.</p>}
                  </div>
                </div>}
              </div>
            </details>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/8 bg-white px-5 py-4">
        <p className="text-[12px] text-mist">
          {data.updatedAt ? `Draft last saved ${new Date(data.updatedAt).toLocaleString("en-GB")}` : "No draft saved yet"} · {totalOverrides} field override{totalOverrides === 1 ? "" : "s"} · Publishing is always explicit.
        </p>
        <div className="flex gap-2">
          <Btn variant="ghost" size="sm" loading={busy === "discard"} onClick={discard}><RotateCcw className="h-4 w-4" /> Reset draft</Btn>
          <Btn variant="secondary" size="sm" loading={busy === "save"} onClick={() => saveDraft()}><Save className="h-4 w-4" /> Save draft</Btn>
          <Btn variant="primary" size="sm" loading={busy === "publish"} onClick={publish}><Send className="h-4 w-4" /> Publish</Btn>
        </div>
      </div>
    </div>
  );
}
