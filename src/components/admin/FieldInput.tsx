"use client";

import { useState } from "react";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import type { FieldDef } from "@/lib/resources";
import { ICON_NAMES } from "@/components/site/Icons";
import { cn } from "@/lib/utils";
import { inputCls, labelCls, Btn } from "./ui";
import { MediaPicker } from "./MediaPicker";

type Opt = { value: number | string; label: string };
type Props = { field: FieldDef; value: unknown; onChange: (v: unknown) => void; error?: string; relationOptions?: Record<string, Opt[]>; /** Extra options merged into a select field (e.g. dynamic page keys). */ extraOptions?: Opt[] };

const JSON_SHAPES: Record<string, { key: string; label: string; type?: "image" | "select-icon" | "text" }[]> = {
  stats: [{ key: "label", label: "Label" }, { key: "value", label: "Value" }],
  items: [{ key: "title", label: "Title" }, { key: "description", label: "Description" }, { key: "icon", label: "Icon", type: "select-icon" }, { key: "value", label: "Value" }, { key: "label", label: "Label" }, { key: "image", label: "Image", type: "image" }],
  floorplans: [{ key: "name", label: "Name" }, { key: "area", label: "Area" }, { key: "image", label: "Image", type: "image" }],
  documents: [{ key: "name", label: "Name" }, { key: "url", label: "URL (PDF from Media Library)", type: "image" }],
  raw: [{ key: "key", label: "Key" }, { key: "value", label: "Value" }],
};

export function ImageInput({ value, onChange, accept = "image" }: { value: string; onChange: (v: string) => void; accept?: "image" | "video" | "document" | "any" }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-start gap-3">
      {value && accept === "image" && <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border border-ink/10 bg-slate-50"><img src={value} alt="" className="h-full w-full object-cover" /></div>}
      <div className="flex flex-1 gap-2">
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://… or pick from library" className={inputCls} />
        <Btn type="button" variant="secondary" onClick={() => setOpen(true)} aria-label="Choose from media library"><ImagePlus className="h-4 w-4" /></Btn>
        {value && <Btn type="button" variant="ghost" onClick={() => onChange("")} aria-label="Clear"><X className="h-4 w-4" /></Btn>}
      </div>
      <MediaPicker open={open} onClose={() => setOpen(false)} onSelect={(m) => onChange(m.url)} accept={accept} />
    </div>
  );
}

export function FieldInput({ field: f, value, onChange, error, relationOptions, extraOptions }: Props) {
  const [picker, setPicker] = useState(false);
  const id = `f-${f.name}`;
  const wrap = (child: React.ReactNode, hideLabel = false) => (
    <div className={cn(f.width === "half" && "md:col-span-3", f.width === "third" && "md:col-span-2", (!f.width || f.width === "full") && "md:col-span-6")}>
      {!hideLabel && <label htmlFor={id} className={labelCls}>{f.label}{f.required && <span className="text-red-500"> *</span>}</label>}
      {child}
      {f.help && <p className="mt-1 text-[11.5px] text-mist">{f.help}</p>}
      {error && <p className="mt-1 text-[12px] text-red-600" role="alert">{error}</p>}
    </div>
  );

  switch (f.type) {
    case "textarea":
      return wrap(<textarea id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} rows={f.max && f.max > 4000 ? 14 : 5} className={cn(inputCls, "h-auto py-2 font-[inherit]")} maxLength={f.max} />);
    case "number":
      return wrap(<input id={id} type="number" step="any" value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} className={inputCls} />);
    case "boolean":
      return wrap(
        <label className="flex h-10 cursor-pointer items-center gap-3">
          <button type="button" role="switch" aria-checked={!!value} id={id} onClick={() => onChange(!value)} className={cn("relative h-6 w-11 rounded-full transition", value ? "bg-brand" : "bg-slate-300")}><span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", value ? "left-[22px]" : "left-0.5")} /></button>
          <span className="text-[13px] text-charcoal">{f.label}</span>
        </label>, true,
      );
    case "select":
      return wrap(
        <select id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">— Select —</option>
          {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          {extraOptions && extraOptions.length > 0 && (
            <optgroup label="Custom pages (from Pages)">
              {extraOptions.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
            </optgroup>
          )}
        </select>,
      );
    case "relation": {
      const opts = relationOptions?.[f.relation ?? ""] ?? [];
      return wrap(<select id={id} value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} className={inputCls}><option value="">— None —</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>);
    }
    case "image":
      return wrap(<ImageInput value={(value as string) ?? ""} onChange={onChange} />);
    case "color":
      return wrap(<div className="flex gap-2"><input type="color" value={(value as string) || "#000000"} onChange={(e) => onChange(e.target.value)} className="h-10 w-14 rounded-lg border border-ink/10" aria-label={`${f.label} colour`} /><input id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls} /></div>);
    case "password":
      return wrap(<input id={id} type="password" autoComplete="new-password" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls} />);
    case "email":
      return wrap(<input id={id} type="email" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls} />);
    case "tags": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const isMedia = /gallery|image/i.test(f.name);
      return wrap(
        <div>
          <div className="flex flex-wrap gap-2">
            {arr.map((t, i) => (
              <span key={i} className="inline-flex max-w-full items-center gap-1 rounded-full border border-ink/10 bg-slate-50 pl-1 pr-2 py-1 text-[12px]">
                {isMedia && /^(\/|https?:)/.test(t) ? <img src={t} alt="" className="h-6 w-8 rounded object-cover" /> : null}
                <span className="truncate max-w-[220px]">{t}</span>
                <button type="button" onClick={() => onChange(arr.filter((_, j) => j !== i))} aria-label="Remove"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input placeholder={isMedia ? "Paste URL and press Enter" : "Type and press Enter"} className={inputCls} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const v = (e.target as HTMLInputElement).value.trim(); if (v) { onChange([...arr, v]); (e.target as HTMLInputElement).value = ""; } } }} />
            {isMedia && <Btn type="button" variant="secondary" onClick={() => setPicker(true)}><ImagePlus className="h-4 w-4" /> Library</Btn>}
          </div>
          <MediaPicker open={picker} onClose={() => setPicker(false)} onSelect={(m) => onChange([...arr, m.url])} accept="image" />
        </div>,
      );
    }
    case "json": {
      const shape = JSON_SHAPES[f.jsonShape ?? "raw"];
      const arr = Array.isArray(value) ? (value as Record<string, string>[]) : [];
      const update = (i: number, k: string, v: string) => onChange(arr.map((row, j) => (j === i ? { ...row, [k]: v } : row)));
      return wrap(
        <div className="space-y-2">
          {arr.map((row, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-ink/8 bg-slate-50/60 p-3 md:grid-cols-12">
              {shape.map((c) => (
                <div key={c.key} className={cn(c.key === "description" ? "md:col-span-12" : c.type === "image" ? "md:col-span-12" : "md:col-span-4")}>
                  <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-mist">{c.label}</label>
                  {c.type === "image" ? <ImageInput value={row[c.key] ?? ""} onChange={(v) => update(i, c.key, v)} accept={f.jsonShape === "documents" ? "any" : "image"} />
                    : c.type === "select-icon" ? <select value={row[c.key] ?? ""} onChange={(e) => update(i, c.key, e.target.value)} className={inputCls}><option value="">— icon —</option>{ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
                    : <input value={row[c.key] ?? ""} onChange={(e) => update(i, c.key, e.target.value)} className={inputCls} />}
                </div>
              ))}
              <div className="flex justify-end md:col-span-12"><button type="button" onClick={() => onChange(arr.filter((_, j) => j !== i))} className="inline-flex items-center gap-1 text-[12px] text-red-600 hover:underline"><Trash2 className="h-3.5 w-3.5" /> Remove</button></div>
            </div>
          ))}
          <Btn type="button" variant="secondary" size="sm" onClick={() => onChange([...arr, {}])}><Plus className="h-3.5 w-3.5" /> Add row</Btn>
        </div>,
      );
    }
    default:
      return wrap(<input id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls} maxLength={f.max} readOnly={f.readOnly} />);
  }
}
