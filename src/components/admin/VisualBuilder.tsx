"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Library,
  Monitor,
  Plus,
  Redo2,
  Save,
  Search,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { api, Badge, Btn, Confirm, inputCls, labelCls, Modal, useToast } from "./ui";
import { MediaPicker, type MediaRow } from "./MediaPicker";
import {
  CONTAINER_WIDTHS,
  IMAGE_LAYOUTS,
  SECTION_GROUPS,
  SECTION_SPACING,
  SECTION_TYPES,
  sectionLabel,
  type BuilderBlock,
  type BuilderItem,
  type BuilderSection,
  type SectionStyle,
} from "@/lib/page-builder";
import { cn } from "@/lib/utils";

/**
 * Universal visual builder (Phase 11).
 *
 * Left: layers/outline. Center: the real page inside an iframe, at a real
 * device width — clicking a section in the preview selects it. Right: settings
 * for the selected section. Every change is autosaved to the draft and the
 * preview reloads from the same renderer the public site uses, so the editor
 * cannot drift from production.
 */

type Device = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTH: Record<Device, number> = { desktop: 1440, tablet: 834, mobile: 390 };

export type BuilderTarget = {
  kind: "page" | "project";
  id: number;
  title: string;
  previewSrc: string;
  saveUrl: string;
  publishUrl?: string;
  publicHref?: string | null;
  status?: string;
};

type Props = {
  target: BuilderTarget;
  initialSections: BuilderSection[];
  canWrite: boolean;
  canPublish: boolean;
  onPublished?: () => void;
};

let counter = 0;
function newId(): string {
  counter += 1;
  return `s${Date.now().toString(36)}${counter.toString(36)}`;
}

/** Deep copy for duplicate/independent-insert (sections are plain JSON data). */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function blankSection(type: BuilderSection["type"]): BuilderSection {
  const base: BuilderSection = { id: newId(), type, visible: { desktop: true, tablet: true, mobile: true } };
  switch (type) {
    case "hero":
      return { ...base, eyebrow: "Prestigious living at", title: "A headline that sells the place", subtitle: "", ctaLabel: "Explore the project", ctaHref: "/projects" };
    case "banner":
      return { ...base, eyebrow: "Dubai · Luxury · Lifestyle", title: "Headline over a photo", ctaLabel: "Enquire now", ctaHref: "/contact" };
    case "heading":
      return { ...base, eyebrow: "Section", title: "Section heading" };
    case "text":
      return { ...base, title: "A section heading", body: "Write the story here. Markdown is supported." };
    case "imageText":
      return { ...base, title: "Image and copy", body: "Describe the project.", imageLayout: "right" };
    case "columns":
      return {
        ...base,
        title: "Three columns",
        items: [
          { title: "Column one", description: "Describe this column." },
          { title: "Column two", description: "Describe this column." },
          { title: "Column three", description: "Describe this column." },
        ],
      };
    case "divider":
      return { ...base, title: "" };
    case "video":
      return { ...base, title: "Watch the film" };
    case "gallery":
      return { ...base, title: "Gallery", items: [{ image: "", title: "" }] };
    case "cards":
      return { ...base, title: "Highlights", items: [{ title: "Card one", description: "Supporting copy." }] };
    case "highlights":
      return { ...base, title: "Why this project", items: [{ title: "Prime location", description: "Minutes from the marina." }] };
    case "amenities":
      return { ...base, title: "Amenities", items: [{ title: "Infinity pool" }, { title: "Private gym" }, { title: "Concierge" }] };
    case "specs":
      return { ...base, title: "Specifications", items: [{ label: "Type", value: "1 bedroom" }, { label: "Area", value: "663 sq.ft" }] };
    case "stats":
      return { ...base, title: "By the numbers", items: [{ value: "25M", label: "Starting price" }] };
    case "steps":
      return { ...base, title: "How it works", items: [{ title: "Enquire", description: "Tell us what you need." }] };
    case "faq":
      return { ...base, title: "Frequently asked questions", items: [{ title: "Can I pay in instalments?", description: "Yes — payment plans are shown above." }] };
    case "testimonials":
      return { ...base, title: "What clients say", items: [{ title: "Client name", label: "Investor", description: "They found exactly what I needed." }] };
    case "floorPlans":
      return { ...base, title: "Floor plans", items: [{ title: "Type A", value: "663 sq.ft" }] };
    case "pricing":
      return { ...base, title: "Payment plans", items: [{ title: "Plan 1", value: "10% down", description: "55% during construction\n35% on handover" }] };
    case "brochure":
      return { ...base, eyebrow: "Brochure", title: "Download the full brochure", body: "Floor plans, payment plans and the full specification.", ctaLabel: "Download brochure", ctaHref: "#" };
    case "location":
      return { ...base, title: "Location", mapQuery: "Dubai Marina", items: [{ title: "Marina Walk", description: "5 minutes" }] };
    case "related":
      return { ...base, title: "Other projects you may like" };
    case "cta":
      return { ...base, title: "Ready to invest?", body: "Speak to an advisor today.", ctaLabel: "Contact us", ctaHref: "/contact" };
    case "form":
      return { ...base, eyebrow: "Enquire", title: "Request the full details", body: "Our team replies within one business day." };
    case "contact":
      return { ...base, title: "Get in touch" };
    case "whatsapp":
      return { ...base, title: "Chat with an advisor", ctaLabel: "Message us on WhatsApp" };
    default:
      return base;
  }
}

const ITEM_FIELDS: Partial<Record<BuilderSection["type"], Array<keyof BuilderItem>>> = {
  gallery: ["image", "title"],
  cards: ["image", "title", "description", "href", "label"],
  columns: ["image", "title", "description", "href", "label"],
  highlights: ["title", "description", "label"],
  amenities: ["title", "description"],
  specs: ["label", "value"],
  stats: ["value", "label"],
  steps: ["title", "description"],
  faq: ["title", "description"],
  testimonials: ["title", "label", "description"],
  floorPlans: ["image", "title", "value"],
  pricing: ["title", "value", "label", "description", "href"],
  related: [],
  location: ["title", "description"],
  contact: [],
  form: [],
  brochure: [],
  divider: [],
  heading: [],
  video: [],
};

const FIELD_LABEL: Record<keyof BuilderItem, string> = {
  title: "Title",
  description: "Description",
  value: "Value",
  label: "Label",
  image: "Image",
  href: "Link",
  icon: "Icon",
};

const TYPE_ICON: Record<string, string> = {
  hero: "◧",
  banner: "▤",
  heading: "H",
  text: "¶",
  imageText: "▣",
  columns: "⫼",
  divider: "—",
  video: "▶",
  gallery: "▦",
  cards: "▭",
  highlights: "✦",
  amenities: "◎",
  specs: "≣",
  stats: "＃",
  steps: "①",
  faq: "?",
  testimonials: "❝",
  floorPlans: "⌗",
  pricing: "₨",
  brochure: "⤓",
  location: "⌖",
  related: "⧉",
  cta: "➜",
  form: "✉",
  contact: "☎",
  whatsapp: "✆",
};

export function VisualBuilder({ target, initialSections, canWrite, canPublish, onPublished }: Props) {
  const { toast } = useToast();
  const [sections, setSections] = useState<BuilderSection[]>(initialSections);
  const [selectedId, setSelectedId] = useState<string | null>(initialSections[0]?.id ?? null);
  const [device, setDevice] = useState<Device>("desktop");
  const [tab, setTab] = useState<"content" | "design" | "advanced">("content");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [past, setPast] = useState<BuilderSection[][]>([]);
  const [future, setFuture] = useState<BuilderSection[][]>([]);
  const [previewKey, setPreviewKey] = useState(0);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [blocks, setBlocks] = useState<BuilderBlock[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(true);
  const [pendingBlock, setPendingBlock] = useState<BuilderBlock | null>(null);
  const [saveBlockFor, setSaveBlockFor] = useState<BuilderSection | null>(null);
  const [blockName, setBlockName] = useState("");
  const [blockCategory, setBlockCategory] = useState("");
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<BuilderSection | null>(null);
  const [picker, setPicker] = useState<{ sectionId: string; key: "image" } | null>(null);
  const [itemPicker, setItemPicker] = useState<{ sectionId: string; index: number } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const selectedRef = useRef<string | null>(null);

  const selected = useMemo(() => sections.find((s) => s.id === selectedId) ?? null, [sections, selectedId]);
  // Keep the ref in sync outside render so message handlers can read it.
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  /* ---------------------------------------------------------------- *
   * History + persistence
   * ---------------------------------------------------------------- */

  const commit = useCallback(
    (next: BuilderSection[]) => {
      setPast((p) => [...p.slice(-49), sections]);
      setFuture([]);
      setSections(next);
      setDirty(true);
    },
    [sections],
  );

  const patchSection = useCallback(
    (id: string, patch: Partial<BuilderSection>) => {
      commit(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    },
    [commit, sections],
  );

  const patchStyle = useCallback(
    (id: string, patch: Partial<SectionStyle>) => {
      commit(
        sections.map((s) => (s.id === id ? { ...s, style: { ...(s.style ?? {}), ...patch } } : s)),
      );
    },
    [commit, sections],
  );

  const undo = useCallback(() => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([sections, ...future].slice(0, 50));
    setSections(prev);
    setDirty(true);
  }, [past, future, sections]);

  const redo = useCallback(() => {
    if (!future.length) return;
    const next = future[0];
    setFuture(future.slice(1));
    setPast([...past.slice(-49), sections]);
    setSections(next);
    setDirty(true);
  }, [future, past, sections]);

  const save = useCallback(
    async (list: BuilderSection[], silent = false) => {
      if (!canWrite) return;
      setSaving(true);
      try {
        await api(target.saveUrl, { method: "PATCH", body: JSON.stringify({ draft: list }) });
        setDirty(false);
        setSavedAt(new Date());
        setPreviewKey((k) => k + 1);
        if (!silent) toast("Draft saved", "success");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not save the draft", "error");
      } finally {
        setSaving(false);
      }
    },
    [canWrite, target.saveUrl, toast],
  );

  // Autosave: 1.2s after the last edit, then reload the preview from the real
  // renderer. Silent so typing does not spam toasts.
  useEffect(() => {
    if (!dirty || !canWrite) return;
    const t = setTimeout(() => void save(sections, true), 1200);
    return () => clearTimeout(t);
  }, [dirty, sections, save, canWrite]);

  // Unsaved-changes guard.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  /* ---------------------------------------------------------------- *
   * Canvas: click-to-select inside the same-origin preview iframe
   * ---------------------------------------------------------------- */

  const wireCanvas = useCallback(() => {
    const frame = iframeRef.current;
    const doc = frame?.contentDocument;
    if (!doc) return;
    doc.documentElement.classList.add("pb-edit");

    const onClick = (e: MouseEvent) => {
      const target_ = e.target as HTMLElement | null;
      const host = target_?.closest?.("[data-pb]") as HTMLElement | null;
      if (!host) return;
      // Editing, not navigating: links and buttons inside the canvas are inert.
      e.preventDefault();
      e.stopPropagation();
      const index = Number(host.getAttribute("data-pb"));
      const section = sections[index];
      if (section) setSelectedId(section.id);
    };
    doc.addEventListener("click", onClick, true);
    return () => doc.removeEventListener("click", onClick, true);
  }, [sections]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const frame = iframeRef.current;
    if (!frame) return;
    const run = () => {
      const c = wireCanvas();
      if (c) cleanups.push(c);
    };
    frame.addEventListener("load", run);
    run();
    return () => {
      frame.removeEventListener("load", run);
      cleanups.forEach((c) => c());
    };
  }, [wireCanvas, previewKey]);

  // Outline the selected section without reloading the frame.
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.querySelectorAll("[data-pb-selected]").forEach((el) => el.removeAttribute("data-pb-selected"));
    if (!selectedId) return;
    const index = sections.findIndex((s) => s.id === selectedId);
    const el = doc.querySelector(`[data-pb="${index}"]`);
    el?.setAttribute("data-pb-selected", "true");
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId, sections, previewKey]);

  /* ---------------------------------------------------------------- *
   * Section operations
   * ---------------------------------------------------------------- */

  const addSection = useCallback(
    (type: BuilderSection["type"]) => {
      const section = blankSection(type);
      commit([...sections, section]);
      setSelectedId(section.id);
      setLibraryOpen(false);
      setTab("content");
    },
    [commit, sections],
  );

  const duplicate = useCallback(
    (source: BuilderSection) => {
      const copy: BuilderSection = {
        ...clone(source),
        id: newId(),
        label: `${source.label || sectionLabel(source.type)} (copy)`,
        blockId: null,
        blockMode: "independent",
      };
      const at = sections.findIndex((s) => s.id === source.id);
      const next = [...sections];
      next.splice(at + 1, 0, copy);
      commit(next);
      setSelectedId(copy.id);
    },
    [commit, sections],
  );

  const remove = useCallback(
    (id: string) => {
      const next = sections.filter((s) => s.id !== id);
      commit(next);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
    },
    [commit, sections, selectedId],
  );

  const move = useCallback(
    (id: string, direction: -1 | 1) => {
      const at = sections.findIndex((s) => s.id === id);
      const to = at + direction;
      if (at < 0 || to < 0 || to >= sections.length) return;
      const next = [...sections];
      [next[at], next[to]] = [next[to], next[at]];
      commit(next);
    },
    [commit, sections],
  );

  const reorder = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= sections.length || to >= sections.length) return;
      const next = [...sections];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      commit(next);
    },
    [commit, sections],
  );

  /* ---------------------------------------------------------------- *
   * Reusable blocks
   * ---------------------------------------------------------------- */

  useEffect(() => {
    if (!blocksOpen || blocks.length) return;
    let alive = true;
    api<{ data: BuilderBlock[] }>("/api/admin/blocks")
      .then((res) => {
        if (alive) setBlocks(res.data);
      })
      .catch((e) => {
        if (alive) toast(e instanceof Error ? e.message : "Could not load reusable blocks", "error");
      })
      .finally(() => {
        if (alive) setBlocksLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [blocksOpen, blocks.length, toast]);

  const insertBlock = useCallback(
    (block: BuilderBlock, mode: "linked" | "independent") => {
      const section: BuilderSection = {
        ...clone(block.section),
        id: newId(),
        blockId: mode === "linked" ? block.id : null,
        blockMode: mode,
        label: block.name,
      };
      commit([...sections, section]);
      setSelectedId(section.id);
      setPendingBlock(null);
      setBlocksOpen(false);
      toast(mode === "linked" ? `Inserted “${block.name}” (linked)` : `Inserted a copy of “${block.name}”`, "success");
    },
    [commit, sections, toast],
  );

  const saveAsBlock = useCallback(async () => {
    if (!saveBlockFor) return;
    try {
      await api("/api/admin/blocks", {
        method: "POST",
        body: JSON.stringify({ name: blockName || saveBlockFor.title || sectionLabel(saveBlockFor.type), category: blockCategory || null, section: saveBlockFor }),
      });
      toast("Saved to the reusable block library", "success");
      setSaveBlockFor(null);
      setBlockName("");
      setBlockCategory("");
      setBlocks([]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the block", "error");
    }
  }, [saveBlockFor, blockName, blockCategory, toast]);

  const publish = useCallback(async () => {
    setConfirmPublish(false);
    if (!target.publishUrl) return;
    try {
      if (dirty) await save(sections, true);
      await api(target.publishUrl, { method: "POST", body: JSON.stringify({ action: "publish" }) });
      toast("Published", "success");
      onPublished?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not publish", "error");
    }
  }, [dirty, onPublished, save, sections, target.publishUrl, toast]);

  /* ---------------------------------------------------------------- *
   * Render
   * ---------------------------------------------------------------- */

  const grouped = SECTION_GROUPS.map((group) => ({
    group,
    items: SECTION_TYPES.filter((t) => t.group === group),
  }));

  return (
    <div className="rounded-2xl border border-ink/10 bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-3 py-2.5">
        <div className="flex items-center gap-1">
          <Btn variant="ghost" size="sm" onClick={undo} disabled={!past.length} aria-label="Undo" title="Undo">
            <Undo2 className="h-4 w-4" />
          </Btn>
          <Btn variant="ghost" size="sm" onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo">
            <Redo2 className="h-4 w-4" />
          </Btn>
          <span className="mx-1 h-5 w-px bg-ink/10" />
          {(["desktop", "tablet", "mobile"] as Device[]).map((d) => {
            const Icon = d === "desktop" ? Monitor : d === "tablet" ? Tablet : Smartphone;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDevice(d)}
                title={`${d} preview`}
                aria-label={`${d} preview`}
                aria-pressed={device === d}
                className={cn("grid h-8 w-8 place-items-center rounded-lg border text-ink/70", device === d ? "border-brand bg-brand/5 text-brand" : "border-transparent hover:bg-slate-100")}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] text-mist">
            {saving ? "Saving…" : dirty ? "Unsaved changes" : savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "All changes saved"}
          </span>
          <Btn variant="secondary" size="sm" loading={saving} disabled={!canWrite || !dirty} onClick={() => void save(sections)}>
            <Save className="h-3.5 w-3.5" /> Save draft
          </Btn>
          {target.publicHref && (
            <Link href={target.publicHref} target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink/10 px-3 text-[12.5px] font-medium text-ink hover:bg-slate-50">
              <Eye className="h-3.5 w-3.5" /> Live page
            </Link>
          )}
          {canPublish && target.publishUrl && (
            <Btn size="sm" disabled={saving} onClick={() => setConfirmPublish(true)}>
              Publish
            </Btn>
          )}
        </div>
      </div>

      <div className="grid min-h-[720px] lg:grid-cols-[230px_minmax(0,1fr)_360px]">
        {/* Layers */}
        <aside className="border-b border-ink/10 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-charcoal/70">
              <Layers className="h-3.5 w-3.5" /> Layers
            </span>
            <button type="button" onClick={() => setLibraryOpen(true)} disabled={!canWrite} className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white disabled:opacity-40" aria-label="Add section">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <ul className="max-h-[660px] space-y-0.5 overflow-y-auto px-2 pb-3">
            {sections.map((s, i) => (
              <li
                key={s.id}
                draggable={canWrite}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = Number(e.dataTransfer.getData("text/plain"));
                  reorder(from, i);
                }}
                className={cn(
                  "group flex items-center gap-1 rounded-lg px-1.5 py-1",
                  s.id === selectedId ? "bg-brand/10 ring-1 ring-brand/30" : "hover:bg-slate-50",
                )}
              >
                <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-mist" />
                <button type="button" onClick={() => setSelectedId(s.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-white text-[10px] font-bold text-brand ring-1 ring-ink/10">{TYPE_ICON[s.type] ?? "•"}</span>
                  <span className={cn("truncate text-[12.5px]", s.hidden && "text-mist line-through")}>{s.label || s.title || sectionLabel(s.type)}</span>
                  {s.blockMode === "linked" && <span className="shrink-0 rounded bg-brand/15 px-1 text-[9px] font-bold uppercase text-brand">Link</span>}
                </button>
                <button
                  type="button"
                  onClick={() => patchSection(s.id, { hidden: !s.hidden })}
                  className="shrink-0 rounded p-0.5 text-mist opacity-0 group-hover:opacity-100 hover:text-ink"
                  aria-label={s.hidden ? "Show section" : "Hide section"}
                  title={s.hidden ? "Show" : "Hide"}
                >
                  {s.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </li>
            ))}
            {!sections.length && <li className="px-2 py-6 text-center text-[12px] text-mist">No sections yet — add one.</li>}
          </ul>
          <div className="border-t border-ink/10 p-2">
            <Btn variant="secondary" size="sm" className="w-full" onClick={() => setBlocksOpen(true)} disabled={!canWrite}>
              <Library className="h-3.5 w-3.5" /> Reusable blocks
            </Btn>
          </div>
        </aside>

        {/* Canvas */}
        <div className="bg-slate-100/70 p-3">
          <div className="mx-auto overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm" style={{ width: device === "desktop" ? "100%" : DEVICE_WIDTH[device], maxWidth: "100%" }}>
            <iframe
              key={previewKey}
              ref={iframeRef}
              src={`${target.previewSrc}${target.previewSrc.includes("?") ? "&" : "?"}k=${previewKey}`}
              title={`${target.title} preview`}
              className="h-[680px] w-full border-0 bg-white"
              sandbox="allow-same-origin"
            />
          </div>
          <p className="mt-2 text-center text-[11.5px] text-mist">
            Click a section in the preview to edit it. Preview width: {DEVICE_WIDTH[device]}px — real responsive rendering.
          </p>
        </div>

        {/* Settings */}
        <aside className="border-t border-ink/10 lg:border-t-0 lg:border-l">
          {!selected ? (
            <div className="p-6 text-center text-[13px] text-mist">Select a section to edit its content and design.</div>
          ) : (
            <>
              <div className="border-b border-ink/10 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{selected.label || sectionLabel(selected.type)}</p>
                    <p className="text-[11px] uppercase tracking-wider text-mist">{sectionLabel(selected.type)}</p>
                  </div>
                  <Badge tone={selected.hidden ? "slate" : "green"}>{selected.hidden ? "hidden" : "visible"}</Badge>
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <button type="button" onClick={() => move(selected.id, -1)} className="rounded p-1 text-mist hover:text-ink" aria-label="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => move(selected.id, 1)} className="rounded p-1 text-mist hover:text-ink" aria-label="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => duplicate(selected)} className="rounded p-1 text-mist hover:text-ink" aria-label="Duplicate section"><Copy className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => setSaveBlockFor(selected)} className="ml-auto inline-flex items-center gap-1 rounded-md border border-ink/10 px-2 py-1 text-[11.5px] text-ink hover:bg-slate-50"><Library className="h-3 w-3" /> Save as block</button>
                  <button type="button" onClick={() => setConfirmDelete(selected)} className="rounded p-1 text-mist hover:text-red-600" aria-label="Delete section"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-0.5">
                  {(["content", "design", "advanced"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setTab(t)} className={cn("rounded-md py-1 text-[11.5px] font-medium capitalize", tab === t ? "bg-white text-ink shadow-sm" : "text-charcoal/65")}>{t}</button>
                  ))}
                </div>
              </div>

              <div className="max-h-[600px] space-y-3 overflow-y-auto p-3">
                {selected.blockMode === "linked" && (
                  <p className="rounded-lg bg-brand/5 p-2 text-[11.5px] leading-relaxed text-brand-deep">
                    Linked to reusable block #{selected.blockId}. Content follows the master; spacing, alignment and visibility here stay local.
                  </p>
                )}

                {tab === "content" && (
                  <ContentTab
                    section={selected}
                    canWrite={canWrite}
                    onChange={(patch) => patchSection(selected.id, patch)}
                    onPickImage={(key) => setPicker({ sectionId: selected.id, key })}
                    onPickItemImage={(index) => setItemPicker({ sectionId: selected.id, index })}
                    onPatchItem={(index, patch) => {
                      const items = [...(selected.items ?? [])];
                      items[index] = { ...items[index], ...patch };
                      patchSection(selected.id, { items });
                    }}
                    onAddItem={() => {
                      const fields = ITEM_FIELDS[selected.type] ?? ["title"];
                      const item: BuilderItem = {};
                      for (const f of fields) item[f] = "";
                      patchSection(selected.id, { items: [...(selected.items ?? []), item] });
                    }}
                    onRemoveItem={(index) => patchSection(selected.id, { items: (selected.items ?? []).filter((_, i) => i !== index) })}
                    onMoveItem={(index, dir) => {
                      const items = [...(selected.items ?? [])];
                      const to = index + dir;
                      if (to < 0 || to >= items.length) return;
                      [items[index], items[to]] = [items[to], items[index]];
                      patchSection(selected.id, { items });
                    }}
                  />
                )}

                {tab === "design" && <DesignTab section={selected} canWrite={canWrite} onStyle={(patch) => patchStyle(selected.id, patch)} />}

                {tab === "advanced" && (
                  <AdvancedTab
                    section={selected}
                    canWrite={canWrite}
                    onChange={(patch) => patchSection(selected.id, patch)}
                    onDuplicate={() => duplicate(selected)}
                    onDelete={() => setConfirmDelete(selected)}
                  />
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Section library */}
      <Modal open={libraryOpen} onClose={() => setLibraryOpen(false)} title="Add a section" wide>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist" />
          <input value={libraryQuery} onChange={(e) => setLibraryQuery(e.target.value)} placeholder="Search sections…" className={cn(inputCls, "pl-9")} />
        </div>
        <div className="max-h-[60vh] space-y-5 overflow-y-auto">
          {grouped.map(({ group, items }) => {
            const filtered = items.filter((t) => !libraryQuery || `${t.label} ${t.hint}`.toLowerCase().includes(libraryQuery.toLowerCase()));
            if (!filtered.length) return null;
            return (
              <div key={group}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-charcoal/60">{group}</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => addSection(t.value)}
                      className="rounded-xl border border-ink/10 p-3 text-left transition hover:border-brand hover:bg-brand/5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded bg-brand/10 text-[11px] font-bold text-brand">{TYPE_ICON[t.value] ?? "•"}</span>
                        <span className="text-[13px] font-semibold text-ink">{t.label}</span>
                      </div>
                      <p className="mt-1.5 text-[11.5px] leading-snug text-charcoal/70">{t.hint}</p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Reusable blocks */}
      <Modal open={blocksOpen} onClose={() => { setBlocksOpen(false); setPendingBlock(null); }} title="Reusable blocks" wide>
        {!pendingBlock ? (
          <>
            <p className="mb-3 text-[12.5px] text-charcoal/70">
              Linked blocks update everywhere when you edit the master. Independent copies are separate forever.
            </p>
            {blocksLoading && <p className="py-8 text-center text-[13px] text-mist">Loading…</p>}
            {!blocksLoading && !blocks.length && (
              <p className="py-8 text-center text-[13px] text-mist">
                No reusable blocks yet. Select a section and choose “Save as block” to create one.
              </p>
            )}
            <div className="max-h-[55vh] space-y-2 overflow-y-auto">
              {blocks.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setPendingBlock(b)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink/10 p-3 text-left hover:border-brand"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">{b.name}</span>
                    <span className="block truncate text-[11.5px] text-charcoal/65">
                      {sectionLabel(b.section.type)}
                      {b.category ? ` · ${b.category}` : ""}
                      {typeof b.usageCount === "number" ? ` · used on ${b.usageCount} item${b.usageCount === 1 ? "" : "s"}` : ""}
                    </span>
                  </span>
                  <Plus className="h-4 w-4 shrink-0 text-brand" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-ink/10 p-3">
              <p className="text-[13.5px] font-semibold text-ink">{pendingBlock.name}</p>
              <p className="text-[11.5px] text-charcoal/65">{sectionLabel(pendingBlock.section.type)}{pendingBlock.category ? ` · ${pendingBlock.category}` : ""}</p>
            </div>
            <p className="text-[12.5px] text-charcoal/70">How should this be inserted? This choice is explicit and is never switched silently later.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => insertBlock(pendingBlock, "linked")} className="rounded-xl border border-brand/40 bg-brand/5 p-3 text-left hover:border-brand">
                <p className="text-[13px] font-semibold text-brand-deep">Linked instance</p>
                <p className="mt-1 text-[11.5px] leading-snug text-charcoal/70">Follows the master. Editing the master updates every page that uses it.</p>
              </button>
              <button type="button" onClick={() => insertBlock(pendingBlock, "independent")} className="rounded-xl border border-ink/15 p-3 text-left hover:border-ink/30">
                <p className="text-[13px] font-semibold text-ink">Independent copy</p>
                <p className="mt-1 text-[11.5px] leading-snug text-charcoal/70">A detached duplicate. Later master edits never change it.</p>
              </button>
            </div>
            <Btn variant="ghost" size="sm" onClick={() => setPendingBlock(null)}>Back to library</Btn>
          </div>
        )}
      </Modal>

      {/* Save as block */}
      <Modal open={!!saveBlockFor} onClose={() => setSaveBlockFor(null)} title="Save as reusable block">
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Name</label>
            <input value={blockName} onChange={(e) => setBlockName(e.target.value)} className={inputCls} placeholder={saveBlockFor?.title || "Standard inquiry CTA"} />
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <input value={blockCategory} onChange={(e) => setBlockCategory(e.target.value)} className={inputCls} placeholder="CTAs, Project modules, Contact…" />
          </div>
          <p className="text-[11.5px] text-charcoal/60">The block stores a snapshot of this section. Pages that link it will follow this master from now on.</p>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" size="sm" onClick={() => setSaveBlockFor(null)}>Cancel</Btn>
            <Btn size="sm" onClick={() => void saveAsBlock()} disabled={!blockName.trim()}>Save block</Btn>
          </div>
        </div>
      </Modal>

      <MediaPicker
        open={!!picker}
        onClose={() => setPicker(null)}
        onSelect={(m: MediaRow) => {
          if (picker) patchSection(picker.sectionId, { image: m.url });
          setPicker(null);
        }}
      />
      <MediaPicker
        open={!!itemPicker}
        onClose={() => setItemPicker(null)}
        onSelect={(m: MediaRow) => {
          if (itemPicker) {
            const section = sections.find((s) => s.id === itemPicker.sectionId);
            const items = [...(section?.items ?? [])];
            items[itemPicker.index] = { ...items[itemPicker.index], image: m.url };
            if (section) patchSection(section.id, { items });
          }
          setItemPicker(null);
        }}
      />

      <Confirm
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        title="Publish these sections?"
        message="The saved draft becomes the live page. Visitors see it immediately at its address."
        confirmLabel="Publish"
        onConfirm={publish}
      />
      <Confirm
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this section?"
        message={`“${confirmDelete?.label || (confirmDelete ? sectionLabel(confirmDelete.type) : "")}” will be removed from the draft. Undo is available until you leave the editor.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (confirmDelete) remove(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

/**
 * Standalone content/design editor for a single section — shared by the
 * reusable-block manager so a master block is edited with the same controls.
 */
export function SectionEditor({ section, onChange }: { section: BuilderSection; onChange: (next: BuilderSection) => void }) {
  const [tab, setTab] = useState<"content" | "design">("content");
  const [picker, setPicker] = useState(false);
  const [itemPicker, setItemPicker] = useState<number | null>(null);

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-0.5">
        {(["content", "design"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={cn("rounded-md py-1 text-[11.5px] font-medium capitalize", tab === t ? "bg-white text-ink shadow-sm" : "text-charcoal/65")}>{t}</button>
        ))}
      </div>
      <div className="max-h-[55vh] overflow-y-auto pr-1">
        {tab === "content" ? (
          <ContentTab
            section={section}
            canWrite
            onChange={(patch) => onChange({ ...section, ...patch })}
            onPickImage={() => setPicker(true)}
            onPickItemImage={(index) => setItemPicker(index)}
            onPatchItem={(index, patch) => {
              const items = [...(section.items ?? [])];
              items[index] = { ...items[index], ...patch };
              onChange({ ...section, items });
            }}
            onAddItem={() => {
              const fields = ITEM_FIELDS[section.type] ?? ["title"];
              const item: BuilderItem = {};
              for (const f of fields) item[f] = "";
              onChange({ ...section, items: [...(section.items ?? []), item] });
            }}
            onRemoveItem={(index) => onChange({ ...section, items: (section.items ?? []).filter((_, i) => i !== index) })}
            onMoveItem={(index, dir) => {
              const items = [...(section.items ?? [])];
              const to = index + dir;
              if (to < 0 || to >= items.length) return;
              [items[index], items[to]] = [items[to], items[index]];
              onChange({ ...section, items });
            }}
          />
        ) : (
          <DesignTab
            section={section}
            canWrite
            onStyle={(patch) => onChange({ ...section, style: { ...(section.style ?? {}), ...patch } })}
          />
        )}
      </div>
      <MediaPicker open={picker} onClose={() => setPicker(false)} onSelect={(m: MediaRow) => { onChange({ ...section, image: m.url }); setPicker(false); }} />
      <MediaPicker
        open={itemPicker !== null}
        onClose={() => setItemPicker(null)}
        onSelect={(m: MediaRow) => {
          if (itemPicker !== null) {
            const items = [...(section.items ?? [])];
            items[itemPicker] = { ...items[itemPicker], image: m.url };
            onChange({ ...section, items });
          }
          setItemPicker(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Content tab
 * ------------------------------------------------------------------ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

function ContentTab({
  section: s,
  canWrite,
  onChange,
  onPickImage,
  onPickItemImage,
  onPatchItem,
  onAddItem,
  onRemoveItem,
  onMoveItem,
}: {
  section: BuilderSection;
  canWrite: boolean;
  onChange: (patch: Partial<BuilderSection>) => void;
  onPickImage: (key: "image") => void;
  onPickItemImage: (index: number) => void;
  onPatchItem: (index: number, patch: Partial<BuilderItem>) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onMoveItem: (index: number, dir: -1 | 1) => void;
}) {
  const itemFields = ITEM_FIELDS[s.type];
  const showEyebrow = !["divider", "form", "related", "gallery"].includes(s.type);
  const showTitle = !["divider"].includes(s.type);
  const showSubtitle = ["hero", "banner", "imageText"].includes(s.type);
  const showBody = ["hero", "text", "imageText", "cta", "form", "brochure", "location", "whatsapp", "columns", "cards"].includes(s.type);
  const showImage = ["hero", "banner", "text", "imageText", "brochure"].includes(s.type);
  const showVideo = s.type === "video";
  const showMap = s.type === "location";

  return (
    <div className="space-y-3">
      {showEyebrow && (
        <Field label="Eyebrow">
          <input value={s.eyebrow ?? ""} onChange={(e) => onChange({ eyebrow: e.target.value })} className={inputCls} disabled={!canWrite} placeholder="PRESTIGIOUS LIVING AT" />
        </Field>
      )}
      {showTitle && (
        <Field label="Title">
          <input value={s.title ?? ""} onChange={(e) => onChange({ title: e.target.value })} className={inputCls} disabled={!canWrite} />
        </Field>
      )}
      {showSubtitle && (
        <Field label="Subtitle">
          <input value={s.subtitle ?? ""} onChange={(e) => onChange({ subtitle: e.target.value })} className={inputCls} disabled={!canWrite} />
        </Field>
      )}
      {showBody && (
        <Field label={s.type === "whatsapp" ? "Prefilled message" : "Body"}>
          <textarea value={s.body ?? ""} onChange={(e) => onChange({ body: e.target.value })} className={cn(inputCls, "h-24 py-2")} disabled={!canWrite} />
        </Field>
      )}
      {showImage && (
        <div>
          <span className={labelCls}>Image</span>
          <div className="flex gap-2">
            <input value={s.image ?? ""} onChange={(e) => onChange({ image: e.target.value })} className={inputCls} disabled={!canWrite} placeholder="/media/… or https://…" />
            <Btn variant="secondary" size="sm" onClick={() => onPickImage("image")} disabled={!canWrite} aria-label="Choose image"><ImageIcon className="h-4 w-4" /></Btn>
          </div>
          {s.image && (
            <div className="relative mt-2 h-24 w-full overflow-hidden rounded-lg border border-ink/10 bg-slate-50">
              <Image src={s.image} alt="" fill className="object-cover" sizes="320px" unoptimized />
            </div>
          )}
        </div>
      )}
      {showVideo && (
        <Field label="YouTube or Vimeo link">
          <input value={s.videoUrl ?? ""} onChange={(e) => onChange({ videoUrl: e.target.value })} className={inputCls} disabled={!canWrite} placeholder="https://www.youtube.com/watch?v=…" />
        </Field>
      )}
      {showMap && (
        <Field label="Map search">
          <input value={s.mapQuery ?? ""} onChange={(e) => onChange({ mapQuery: e.target.value })} className={inputCls} disabled={!canWrite} placeholder="Dubai Marina, Dubai" />
        </Field>
      )}
      {["text", "imageText"].includes(s.type) && (
        <Field label="Image position">
          <select value={s.imageLayout ?? ""} onChange={(e) => onChange({ imageLayout: (e.target.value || null) as BuilderSection["imageLayout"] })} className={inputCls} disabled={!canWrite}>
            <option value="">Automatic</option>
            {IMAGE_LAYOUTS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Button label">
          <input value={s.ctaLabel ?? ""} onChange={(e) => onChange({ ctaLabel: e.target.value })} className={inputCls} disabled={!canWrite} />
        </Field>
        <Field label="Button link">
          <input value={s.ctaHref ?? ""} onChange={(e) => onChange({ ctaHref: e.target.value })} className={inputCls} disabled={!canWrite} placeholder="/contact" />
        </Field>
        <Field label="Second button">
          <input value={s.cta2Label ?? ""} onChange={(e) => onChange({ cta2Label: e.target.value })} className={inputCls} disabled={!canWrite} />
        </Field>
        <Field label="Second link">
          <input value={s.cta2Href ?? ""} onChange={(e) => onChange({ cta2Href: e.target.value })} className={inputCls} disabled={!canWrite} />
        </Field>
      </div>

      {itemFields && itemFields.length > 0 && (
        <div className="rounded-xl border border-ink/10 p-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider text-charcoal/70">Items ({s.items?.length ?? 0})</span>
            <Btn variant="ghost" size="sm" onClick={onAddItem} disabled={!canWrite}><Plus className="h-3.5 w-3.5" /> Add</Btn>
          </div>
          <div className="space-y-2">
            {(s.items ?? []).map((it, i) => (
              <div key={i} className="rounded-lg border border-ink/10 bg-slate-50/50 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-charcoal/60">#{i + 1}</span>
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => onMoveItem(i, -1)} className="rounded p-0.5 text-mist hover:text-ink" aria-label="Move item up"><ChevronUp className="h-3 w-3" /></button>
                    <button type="button" onClick={() => onMoveItem(i, 1)} className="rounded p-0.5 text-mist hover:text-ink" aria-label="Move item down"><ChevronDown className="h-3 w-3" /></button>
                    <button type="button" onClick={() => onRemoveItem(i)} className="rounded p-0.5 text-mist hover:text-red-600" aria-label="Remove item"><X className="h-3 w-3" /></button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {itemFields.map((f) => (
                    <div key={f}>
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-charcoal/50">{FIELD_LABEL[f]}</span>
                      {f === "description" ? (
                        <textarea value={it.description ?? ""} onChange={(e) => onPatchItem(i, { description: e.target.value })} className={cn(inputCls, "h-16 py-1.5 text-[12.5px]")} disabled={!canWrite} />
                      ) : f === "image" ? (
                        <div className="flex gap-1.5">
                          <input value={it.image ?? ""} onChange={(e) => onPatchItem(i, { image: e.target.value })} className={cn(inputCls, "h-8 text-[12px]")} disabled={!canWrite} />
                          <Btn variant="secondary" size="sm" onClick={() => onPickItemImage(i)} disabled={!canWrite} aria-label="Choose item image"><ImageIcon className="h-3.5 w-3.5" /></Btn>
                        </div>
                      ) : (
                        <input value={(it[f] as string) ?? ""} onChange={(e) => onPatchItem(i, { [f]: e.target.value } as Partial<BuilderItem>)} className={cn(inputCls, "h-8 text-[12px]")} disabled={!canWrite} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Design tab
 * ------------------------------------------------------------------ */

function DesignTab({ section: s, canWrite, onStyle }: { section: BuilderSection; canWrite: boolean; onStyle: (patch: Partial<SectionStyle>) => void }) {
  const style = s.style ?? {};
  return (
    <div className="space-y-4">
      <div>
        <span className={labelCls}>Background</span>
        <div className="flex gap-2">
          <input type="color" value={style.background ?? "#ffffff"} onChange={(e) => onStyle({ background: e.target.value })} className="h-9 w-12 rounded border border-ink/10" disabled={!canWrite} aria-label="Background colour" />
          <input value={style.background ?? ""} onChange={(e) => onStyle({ background: e.target.value })} placeholder="#ffffff or empty" className={cn(inputCls, "h-9 font-mono text-[11.5px]")} disabled={!canWrite} />
        </div>
      </div>
      <div>
        <span className={labelCls}>Text colour</span>
        <div className="flex gap-2">
          <input type="color" value={style.textColor ?? "#111111"} onChange={(e) => onStyle({ textColor: e.target.value })} className="h-9 w-12 rounded border border-ink/10" disabled={!canWrite} aria-label="Text colour" />
          <input value={style.textColor ?? ""} onChange={(e) => onStyle({ textColor: e.target.value })} placeholder="inherit" className={cn(inputCls, "h-9 font-mono text-[11.5px]")} disabled={!canWrite} />
        </div>
      </div>
      <Field label="Background image">
        <input value={style.backgroundImage ?? ""} onChange={(e) => onStyle({ backgroundImage: e.target.value })} className={inputCls} disabled={!canWrite} placeholder="/media/… or https://…" />
      </Field>
      <div>
        <span className={labelCls}>Image scrim {style.overlay ?? 45}%</span>
        <input type="range" min={0} max={90} step={5} value={style.overlay ?? 45} onChange={(e) => onStyle({ overlay: Number(e.target.value) })} className="w-full accent-[#1f8f3a]" disabled={!canWrite || !style.backgroundImage} aria-label="Scrim strength" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Width">
          <select value={style.width ?? "default"} onChange={(e) => onStyle({ width: e.target.value as SectionStyle["width"] })} className={inputCls} disabled={!canWrite}>
            {CONTAINER_WIDTHS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
        </Field>
        <Field label="Vertical spacing">
          <select value={style.padY ?? ""} onChange={(e) => onStyle({ padY: (e.target.value || null) as SectionStyle["padY"] })} className={inputCls} disabled={!canWrite}>
            <option value="">Type default</option>
            {SECTION_SPACING.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Text alignment">
          <select value={style.align ?? "left"} onChange={(e) => onStyle({ align: e.target.value as SectionStyle["align"] })} className={inputCls} disabled={!canWrite}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </Field>
        <Field label="Columns">
          <select value={String(style.columns ?? "")} onChange={(e) => onStyle({ columns: (e.target.value ? Number(e.target.value) : null) as SectionStyle["columns"] })} className={inputCls} disabled={!canWrite}>
            <option value="">Type default</option>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="Corners">
          <select value={style.radius ?? ""} onChange={(e) => onStyle({ radius: (e.target.value || null) as SectionStyle["radius"] })} className={inputCls} disabled={!canWrite}>
            <option value="">Default</option>
            <option value="none">Square</option>
            <option value="md">Soft</option>
            <option value="xl">Round</option>
          </select>
        </Field>
        <Field label="Min height (px)">
          <input type="number" min={0} max={2000} value={style.minHeight ?? ""} onChange={(e) => onStyle({ minHeight: e.target.value ? Number(e.target.value) : null })} className={inputCls} disabled={!canWrite} />
        </Field>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Advanced tab
 * ------------------------------------------------------------------ */

function AdvancedTab({
  section: s,
  canWrite,
  onChange,
  onDuplicate,
  onDelete,
}: {
  section: BuilderSection;
  canWrite: boolean;
  onChange: (patch: Partial<BuilderSection>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const vis = s.visible ?? {};
  const toggle = (device: "desktop" | "tablet" | "mobile") => onChange({ visible: { ...vis, [device]: vis[device] === false } });
  return (
    <div className="space-y-4">
      <Field label="Layer name">
        <input value={s.label ?? ""} onChange={(e) => onChange({ label: e.target.value })} className={inputCls} disabled={!canWrite} placeholder="Shown only in the editor" />
      </Field>
      <Field label="Anchor id">
        <input value={s.anchorId ?? ""} onChange={(e) => onChange({ anchorId: e.target.value })} className={inputCls} disabled={!canWrite} placeholder="pricing" />
      </Field>
      <div>
        <span className={labelCls}>Visible on</span>
        <div className="grid grid-cols-3 gap-1.5">
          {(["desktop", "tablet", "mobile"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              disabled={!canWrite}
              aria-pressed={vis[d] !== false}
              className={cn("h-9 rounded-lg border text-[12px] capitalize", vis[d] !== false ? "border-brand bg-brand/5 text-brand" : "border-ink/10 text-mist line-through")}
            >
              {d}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-charcoal/60">Hidden sections stay in the draft but never render on that device.</p>
      </div>
      <label className="flex items-center gap-2 text-[12.5px] text-ink">
        <input type="checkbox" checked={!!s.hidden} onChange={(e) => onChange({ hidden: e.target.checked })} disabled={!canWrite} />
        Hide this section entirely
      </label>
      {s.blockMode === "linked" && (
        <p className="rounded-lg bg-amber-50 p-2 text-[11.5px] leading-relaxed text-amber-800">
          Linked to block #{s.blockId}. Editing content here will not be visible while the link is active — unlink by inserting an independent copy if you need a local variant.
        </p>
      )}
      <div className="flex gap-2 border-t border-ink/10 pt-3">
        <Btn variant="secondary" size="sm" onClick={onDuplicate} disabled={!canWrite}><Copy className="h-3.5 w-3.5" /> Duplicate</Btn>
        <Btn variant="danger" size="sm" onClick={onDelete} disabled={!canWrite}><Trash2 className="h-3.5 w-3.5" /> Delete</Btn>
      </div>
    </div>
  );
}
