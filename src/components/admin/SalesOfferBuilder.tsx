"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Check, ChevronRight, Download, FileSpreadsheet, FileText, Image as ImageIcon,
  Plus, Save, Sparkles, Trash2, Upload, Eye, Lock,
  Copy, Layers, Palette, ListChecks, Archive, RotateCcw, X,
} from "lucide-react";
import { api, Badge, Btn, Confirm, inputCls, labelCls, Modal, useToast } from "./ui";
import { MediaPicker, type MediaRow } from "./MediaPicker";
import { directUpload } from "@/lib/direct-upload-client";
import { calculateOffer, deriveQuestions } from "@/lib/offers/calc";
import { DEFAULT_ASSETS, DEFAULT_DESIGN, suggestedPlan, THEME_PRESETS } from "@/lib/offers/defaults";
import { formatMinor } from "@/lib/offers/money";
import { STATUS_LABELS, type OfferAssets, type OfferCalculation, type OfferDesign, type OfferPlanInput, type OfferStatus, type OfferTermsInput, type OfferUnitInput } from "@/lib/offers/types";
import { cn, formatDateTime } from "@/lib/utils";

type ProjectOption = {
  id: number; name: string; slug: string; city: string | null; country: string | null; developer: string | null;
  developerLogo: string | null; currency: string | null; price: string | null; coverImage: string | null;
  gallery: string[] | null; floorPlans: { name: string; image?: string; area?: string }[] | null;
  amenities: string[] | null; description: string | null; shortDescription: string | null; status: string; published: boolean;
};
type UnitRow = { id: number; projectId: number; unitNo: string; unitType: string | null; bedrooms: string | null; area: string | null; areaUnit: string | null; floor: string | null; view: string | null; price: string | null; currency: string; status: string; notes: string | null };
type LeadOption = { id: number; name: string; email: string | null; phone: string | null; country: string | null; projectId: number | null; budget: string | null; message: string | null; createdAt: string };
type VersionRow = { id: number; version: number; batchId: string | null; status: string; filename: string | null; size: number | null; createdAt: string; storage: "r2" | "database" };
type ConversationEntry = { role: "user" | "assistant" | "system"; content: string; at?: string };

export type SerializedOffer = {
  id: number; reference: string; title: string | null; leadId: number | null; projectId: number | null; unitId: number | null;
  status: OfferStatus; customer: Record<string, unknown> | null; unit: Record<string, unknown> | null;
  terms: Record<string, unknown> | null; options: Record<string, unknown> | null;
  conversation: { entries?: ConversationEntry[] } | null; currentVersion: number; approvedAt: string | null; updatedAt: string;
  versions: VersionRow[];
};

type Props = {
  offer: SerializedOffer | null;
  initialLead?: LeadOption | null;
  projects: ProjectOption[];
  units: UnitRow[];
  leads: LeadOption[];
  canWrite: boolean;
  canApprove: boolean;
  canImport: boolean;
  defaults: { design: OfferDesign; assets: OfferAssets };
};

type Tab = "offer" | "prompt" | "plans" | "design" | "inventory" | "review";
type AiResponse = {
  ai: { ok: boolean; data?: { summary: string; title?: string; unitNo?: string; includeMrHomeLogo?: boolean | null; theme?: OfferDesign["theme"]; selectedPlanNames?: string[]; facts: { label: string; value: string; source: string; confidence: string }[]; questions: string[]; warnings: string[] }; code?: string; error?: string; provider: string; model: string; dataShared?: boolean };
  status: { configured: boolean; provider: string; model: string; reason?: string };
  facts: { label: string; value: string; source: string; confidence: string }[];
  questions: string[];
  disclosure: { dataShared: boolean; provider: string; note: string };
};
type ImportRow = { unitNo: string; unitType?: string; bedrooms?: string; area?: number | null; areaUnit?: string; floor?: string; view?: string; price?: number | null; status?: string; warnings: string[]; duplicateInFile: boolean; exists: boolean };
type ImportPreview = { project: { id: number; name: string }; media: { id: number; name: string; size: number }; source: string; columns: string[]; mapping: Record<string, string | null>; rows: ImportRow[]; errors: string[]; warnings: string[]; extractedText?: string; summary: { rows: number; existing: number; duplicatesInFile: number; withPrice: number; withWarnings: number } };

const TONES: Record<OfferStatus, "neutral" | "green" | "amber" | "red" | "blue" | "slate"> = {
  draft: "neutral", needs_info: "amber", ready_for_review: "blue", approved: "green", archived: "slate",
};

function Toggle({ checked, onChange, label, help, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; help?: string; disabled?: boolean }) {
  return (
    <label className={cn("flex items-start gap-2.5 rounded-xl border border-ink/8 p-3", disabled && "opacity-60")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#1f8f3a]" />
      <span><span className="block text-[12.5px] font-medium">{label}</span>{help && <span className="mt-0.5 block text-[11px] text-mist">{help}</span>}</span>
    </label>
  );
}

function Section({ title, children, actions, hint }: { title: string; children: React.ReactNode; actions?: React.ReactNode; hint?: string }) {
  return (
    <section className="rounded-2xl border border-ink/8 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-[14px] font-semibold">{title}</h2>{hint && <p className="text-[11.5px] text-mist">{hint}</p>}</div>{actions}</div>
      {children}
    </section>
  );
}

function fieldValue(value: unknown): string {
  return value == null ? "" : String(value);
}

function numOrEmpty(value: string): number | "" {
  if (value.trim() === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? n : "";
}

function issueClass(severity: string) {
  return severity === "error" ? "text-red-700 bg-red-50 ring-red-200" : "text-amber-800 bg-amber-50 ring-amber-200";
}

export function SalesOfferBuilder({ offer, initialLead, projects, units, leads, canWrite, canApprove, canImport, defaults }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [offerId, setOfferId] = useState<number | null>(offer?.id ?? null);
  const [reference, setReference] = useState(offer?.reference ?? "New draft");
  const [status, setStatus] = useState<OfferStatus>(offer?.status ?? "draft");
  const [title, setTitle] = useState(offer?.title ?? (initialLead ? `${initialLead.name} — property offer` : ""));
  const [leadId, setLeadId] = useState<number | null>(offer?.leadId ?? initialLead?.id ?? null);
  const [projectId, setProjectId] = useState<number | null>(offer?.projectId ?? initialLead?.projectId ?? null);
  const [unitId, setUnitId] = useState<number | null>(offer?.unitId ?? null);
  const [customer, setCustomer] = useState({ name: offer ? fieldValue(offer.customer?.name) : initialLead?.name ?? "", email: offer ? fieldValue(offer.customer?.email) : initialLead?.email ?? "", phone: offer ? fieldValue(offer.customer?.phone) : initialLead?.phone ?? "", country: offer ? fieldValue(offer.customer?.country) : initialLead?.country ?? "" });
  const [unit, setUnit] = useState<OfferUnitInput>((offer?.unit as OfferUnitInput | null) ?? { unitNo: "", type: "", bedrooms: "", area: "", areaUnit: "sqft", floor: "", view: "", price: "" });
  const [conversation, setConversation] = useState<ConversationEntry[]>(offer?.conversation?.entries ?? []);
  const [terms, setTerms] = useState<OfferTermsInput>(() => {
    const stored = offer?.terms as OfferTermsInput | null;
    if (stored && Array.isArray(stored.plans)) return { fees: [], vatPct: null, ...stored };
    const project = projects.find((p) => p.id === (offer?.projectId ?? initialLead?.projectId));
    return { currency: project?.currency || "AED", unitPrice: project?.price ?? "", plans: [suggestedPlan(0)], fees: [], vatPct: null, paymentStartDate: "", handoverDate: "", notes: "" };
  });
  const [options, setOptions] = useState<{ assets: OfferAssets; design: OfferDesign }>(() => {
    const stored = offer?.options as { assets?: Partial<OfferAssets>; design?: Partial<OfferDesign> } | null;
    return {
      assets: { ...defaults.assets, ...(stored?.assets ?? {}) },
      design: { ...defaults.design, ...(stored?.design ?? {}) },
    };
  });
  const [unitList, setUnitList] = useState<UnitRow[]>(units);
  const [versions, setVersions] = useState<VersionRow[]>(offer?.versions ?? []);
  const [currentVersion, setCurrentVersion] = useState(offer?.currentVersion ?? 0);
  const [latestBatchId, setLatestBatchId] = useState<string | null>(offer?.versions?.[0]?.batchId ?? null);
  const [tab, setTab] = useState<Tab>("offer");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(offer?.updatedAt ?? null);
  const [previewVersion, setPreviewVersion] = useState<VersionRow | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [ai, setAi] = useState<AiResponse | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importMode, setImportMode] = useState<"skip" | "update">("skip");
  const [newUnit, setNewUnit] = useState({ unitNo: "", unitType: "", bedrooms: "", area: "", price: "", floor: "", view: "" });
  const [genMode, setGenMode] = useState<"combined" | "separate">("combined");
  const [genPlanKeys, setGenPlanKeys] = useState<string[]>(() => (offer?.terms as OfferTermsInput | null)?.plans?.map((p) => p.key) ?? ["plan-1"]);
  const [pickerFor, setPickerFor] = useState<null | "cover" | "gallery" | "floorplan" | "projectLogo" | "mrHomeLogo" | { planImage: string }>(null);
  const importRef = useRef<HTMLInputElement>(null);


  const calc: OfferCalculation = useMemo(() => calculateOffer({ terms, unit }), [terms, unit]);
  const project = projects.find((p) => p.id === projectId) ?? null;
  const projectUnits = unitList.filter((u) => u.projectId === projectId);
  const errors = calc.issues.filter((i) => i.severity === "error");
  const warnings = calc.issues.filter((i) => i.severity === "warning");
  const currency = calc.currency || "AED";
  const needsInfo = errors.length > 0;
  const localQuestions = deriveQuestions(calc, { paymentStartDate: terms.paymentStartDate, handoverDate: terms.handoverDate, customer });
  const promptQuestions = [...new Set([...localQuestions, ...(ai?.questions ?? [])])];

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function updateTerms(patch: Partial<OfferTermsInput>) {
    setTerms((t) => ({ ...t, ...patch }));
    setDirty(true);
  }

  function updatePlan(key: string, patch: Partial<OfferPlanInput>) {
    setTerms((t) => ({ ...t, plans: t.plans.map((p) => (p.key === key ? { ...p, ...patch } : p)) }));
    setDirty(true);
  }

  function updateComponent(planKey: string, componentId: string, patch: Record<string, unknown>) {
    setTerms((t) => ({
      ...t,
      plans: t.plans.map((p) => (p.key === planKey ? { ...p, components: p.components.map((c) => (c.id === componentId ? { ...c, ...patch } as typeof c : c)) } : p)),
    }));
    setDirty(true);
  }

  function addComponent(planKey: string, timing: "downPayment" | "installments" | "handover" | "construction" | "milestone") {
    const plan = terms.plans.find((p) => p.key === planKey);
    let n = (plan?.components.length ?? 0) + 1;
    let id = `${planKey}-${timing}-${n}`;
    while (plan?.components.some((c) => c.id === id)) {
      n += 1;
      id = `${planKey}-${timing}-${n}`;
    }
    const component =
      timing === "installments"
        ? { id, label: "Monthly installments", timing, type: "percent" as const, value: 1, count: 45, frequency: "monthly" as const }
        : timing === "handover"
          ? { id, label: "Handover payment", timing, type: "percent" as const, value: 10 }
          : timing === "downPayment"
            ? { id, label: "Down payment", timing, type: "percent" as const, value: 10 }
            : { id, label: timing === "milestone" ? "Milestone payment" : "During construction", timing, type: "percent" as const, value: 5 };
    setTerms((t) => ({ ...t, plans: t.plans.map((p) => (p.key === planKey ? { ...p, components: [...p.components, component] } : p)) }));
    setDirty(true);
  }

  function nextPlanKey(): string {
    let n = terms.plans.length + 1;
    while (terms.plans.some((p) => p.key === `plan-${n}`)) n += 1;
    return `plan-${n}`;
  }

  function addPlan() {
    const next = suggestedPlan(terms.plans.length);
    const key = nextPlanKey();
    setTerms((t) => ({ ...t, plans: [...t.plans, { ...next, key, name: `Plan ${t.plans.length + 1}` }] }));
    setGenPlanKeys((keys) => [...keys, key]);
    setDirty(true);
  }

  function duplicatePlan(key: string) {
    const source = terms.plans.find((p) => p.key === key);
    if (!source) return;
    const newKey = nextPlanKey();
    setTerms((t) => ({ ...t, plans: [...t.plans, { ...source, key: newKey, name: `${source.name} copy`, components: source.components.map((c) => ({ ...c, id: `${newKey}-${c.id}` })) }] }));
    setGenPlanKeys((keys) => [...keys, newKey]);
    setDirty(true);
  }

  function removePlan(key: string) {
    if (terms.plans.length <= 1) {
      toast("Keep at least one plan — an offer must show payment terms.", "error");
      return;
    }
    setTerms((t) => ({ ...t, plans: t.plans.filter((p) => p.key !== key) }));
    setGenPlanKeys((keys) => keys.filter((k) => k !== key));
    setDirty(true);
  }

  function chooseProject(value: string) {
    const id = value ? Number(value) : null;
    const p = projects.find((x) => x.id === id) ?? null;
    setProjectId(id);
    setUnitId(null);
    setUnit({ unitNo: "", type: "", bedrooms: "", area: "", areaUnit: "sqft", floor: "", view: "", price: "" });
    if (!p) return;
    setDirty(true);
    updateTerms({
      currency: (p.currency || terms.currency || "AED").toUpperCase(),
      unitPrice: terms.unitPrice === "" || terms.unitPrice === 0 ? p.price ?? "" : terms.unitPrice,
    });
    setOptions((o) => ({
      assets: {
        ...o.assets,
        coverImage: o.assets.coverImage || p.coverImage || "",
        gallery: o.assets.gallery.length ? o.assets.gallery : [p.coverImage, ...(p.gallery ?? [])].filter((u): u is string => !!u),
        floorPlans: o.assets.floorPlans.length ? o.assets.floorPlans : (p.floorPlans ?? []).filter((f): f is { name: string; image: string } => !!f.image),
        projectLogo: o.assets.projectLogo || p.developerLogo || "",
      },
      design: o.design,
    }));
  }

  function chooseUnit(value: string) {
    const id = value ? Number(value) : null;
    setUnitId(id);
    setDirty(true);
    const u = unitList.find((x) => x.id === id);
    if (!u) return;
    setUnit({ unitNo: u.unitNo, type: u.unitType ?? "", bedrooms: u.bedrooms ?? "", area: u.area ?? "", areaUnit: u.areaUnit ?? "sqft", floor: u.floor ?? "", view: u.view ?? "", price: u.price ?? "" });
    updateTerms({
      currency: (terms.currency || u.currency || "AED").toUpperCase(),
      unitPrice: terms.unitPrice === "" || terms.unitPrice === 0 ? u.price ?? "" : terms.unitPrice,
    });
  }

  function chooseLead(value: string) {
    const id = value ? Number(value) : null;
    setLeadId(id);
    setDirty(true);
    const l = leads.find((x) => x.id === id);
    if (!l) return;
    setCustomer({ name: l.name, email: l.email ?? "", phone: l.phone ?? "", country: l.country ?? "" });
    if (!title) setTitle(`${l.name} — property offer`);
    if (!projectId && l.projectId) chooseProject(String(l.projectId));
  }

  function payload() {
    return {
      title: title.trim() || undefined,
      leadId,
      projectId,
      unitId,
      customer: { ...customer },
      unit: { ...unit, area: unit.area === "" ? "" : Number(unit.area), price: unit.price === "" ? "" : Number(unit.price) },
      terms: { ...terms, currency: (terms.currency || currency).toUpperCase(), plans: terms.plans, fees: terms.fees ?? [], vatPct: terms.vatPct ?? null },
      options,
      conversation,
    };
  }

  async function persist(): Promise<number> {
    const body = JSON.stringify(payload());
    if (offerId) {
      await api(`/api/admin/sales-offers/${offerId}`, { method: "PATCH", body });
      setDirty(false);
      setSavedAt(new Date().toISOString());
      return offerId;
    }
    const res = await api<{ data: { id: number; reference: string; status: OfferStatus; currentVersion: number } }>("/api/admin/sales-offers", { method: "POST", body });
    setOfferId(res.data.id);
    setReference(res.data.reference);
    setStatus(res.data.status);
    setDirty(false);
    setSavedAt(new Date().toISOString());
    window.history.replaceState(null, "", `/admin/sales-offers/${res.data.id}`);
    return res.data.id;
  }

  async function save() {
    if (!canWrite) return;
    setBusy("save");
    try {
      await persist();
      toast(offerId ? "Draft saved" : "Draft created");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    if (!canWrite) return;
    if (needsInfo) {
      setTab("plans");
      toast("Resolve the payment-plan errors before generating a PDF.", "error");
      return;
    }
    setBusy("generate");
    try {
      const id = await persist();
      const existingKeys = terms.plans.map((p) => p.key);
      const selectedKeys = genPlanKeys.filter((k) => existingKeys.includes(k));
      const res = await api<{ data: { batchId: string; versions: VersionRow[]; mode: string } }>(`/api/admin/sales-offers/${id}/generate`, {
        method: "POST",
        body: JSON.stringify({ mode: genMode, planKeys: genMode === "separate" ? (selectedKeys.length ? selectedKeys : existingKeys) : undefined }),
      });
      setVersions((prev) => [...res.data.versions, ...prev]);
      setLatestBatchId(res.data.batchId);
      setStatus("ready_for_review");
      setCurrentVersion(Math.max(...res.data.versions.map((v) => v.version), currentVersion));
      setPreviewVersion(res.data.versions[0] ?? null);
      toast(`PDF generated${res.data.versions.length > 1 ? ` (${res.data.versions.length} files)` : ""} — review before approving`);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "PDF generation failed", "error");
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!canApprove) return;
    setBusy("approve");
    try {
      const id = await persist();
      await api(`/api/admin/sales-offers/${id}/approve`, { method: "POST", body: JSON.stringify({ batchId: latestBatchId ?? undefined }) });
      setStatus("approved");
      setVersions((prev) => prev.map((v) => (v.batchId === latestBatchId ? { ...v, status: "approved" } : v)));
      toast("Offer approved. The approved PDF is now immutable.");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Approval failed", "error");
    } finally {
      setBusy(null);
    }
  }

  async function revise() {
    if (!offerId) return;
    setBusy("revise");
    try {
      const res = await api<{ data: { id: number } }>(`/api/admin/sales-offers/${offerId}/actions`, { method: "POST", body: JSON.stringify({ action: "revise" }) });
      toast("Revision created — the approved document is untouched");
      router.push(`/admin/sales-offers/${res.data.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not revise", "error");
    } finally {
      setBusy(null);
    }
  }

  async function archive() {
    if (!offerId) return;
    setBusy("archive");
    try {
      await api(`/api/admin/sales-offers/${offerId}/actions`, { method: "POST", body: JSON.stringify({ action: status === "archived" ? "restore" : "archive" }) });
      setStatus(status === "archived" ? (offer?.approvedAt ? "approved" : "draft") : "archived");
      toast(status === "archived" ? "Offer restored" : "Offer archived — history retained");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed", "error");
    } finally {
      setBusy(null);
    }
  }

  async function interpret() {
    if (!aiPrompt.trim()) return;
    setBusy("ai");
    try {
      const id = offerId ?? undefined;
      const res = await api<{ data: AiResponse }>("/api/admin/sales-offers/ai", {
        method: "POST",
        body: JSON.stringify({ prompt: aiPrompt, offerId: id ?? null, projectId, unitId, currentSummary: `${terms.plans.length} plans; ${currency}; unit ${unit.unitNo ?? ""}` }),
      });
      setAi(res.data);
      setConversation((c) => [...c, { role: "user" as const, content: aiPrompt.slice(0, 6000), at: new Date().toISOString() }, { role: "assistant" as const, content: (res.data.ai.ok ? res.data.ai.data?.summary : res.data.ai.error) ?? "", at: new Date().toISOString() }].slice(-60));
      setDirty(true);
      if (res.data.ai.ok) toast("Prompt interpreted — review the facts and questions");
      else toast(res.data.ai.error ?? "AI assist unavailable — structured builder still works", "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "AI request failed", "error");
    } finally {
      setBusy(null);
    }
  }

  function applyAi() {
    if (!ai?.ai.ok || !ai.ai.data) return;
    const d = ai.ai.data;
    if (d.title) setTitle(d.title);
    if (d.theme) setOptions((o) => ({ ...o, design: { ...o.design, theme: d.theme! } }));
    if (d.includeMrHomeLogo != null) setOptions((o) => ({ ...o, assets: { ...o.assets, includeMrHomeLogo: !!d.includeMrHomeLogo } }));
    if (d.selectedPlanNames?.length) {
      const keys = terms.plans.filter((p) => d.selectedPlanNames!.some((n) => n.toLowerCase() === p.name.toLowerCase())).map((p) => p.key);
      if (keys.length) setGenPlanKeys(keys);
    }
    if (d.unitNo) {
      const match = projectUnits.find((u) => u.unitNo.toLowerCase() === d.unitNo!.toLowerCase());
      if (match) chooseUnit(String(match.id));
    }
    setDirty(true);
    toast("Applied the non-financial AI suggestions — verify every field");
  }

  async function runImport(file: File) {
    if (!projectId) {
      toast("Select a project before importing inventory.", "error");
      return;
    }
    setBusy("import");
    try {
      const { id } = await directUpload("media", file);
      if (!id) throw new Error("Upload did not return a file id");
      const res = await api<{ data: ImportPreview }>("/api/admin/sales-offers/import", { method: "POST", body: JSON.stringify({ mediaId: id, projectId }) });
      setImportPreview(res.data);
      setImportMode("skip");
      if (res.data.errors.length) toast(res.data.errors[0], "error");
      else toast(`${res.data.rows.length} row(s) parsed — review before importing`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import failed", "error");
    } finally {
      setBusy(null);
    }
  }

  async function commitImport() {
    if (!importPreview || !projectId) return;
    setBusy("commit");
    try {
      const res = await api<{ data: { inserted: number; updated: number; skipped: number } }>("/api/admin/sales-offers/import/commit", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          mode: importMode,
          currency: (project?.currency || currency || "AED").toUpperCase(),
          source: importPreview.media.name,
          rows: importPreview.rows.map((r) => ({ unitNo: r.unitNo, unitType: r.unitType, bedrooms: r.bedrooms, area: r.area, areaUnit: r.areaUnit, floor: r.floor, view: r.view, price: r.price, status: r.status })),
        }),
      });
      toast(`${res.data.inserted} added, ${res.data.updated} updated, ${res.data.skipped} skipped`);
      setImportPreview(null);
      const list = await api<{ data: UnitRow[] }>(`/api/admin/sales-offers/units?projectId=${projectId}`);
      setUnitList((prev) => [...prev.filter((u) => u.projectId !== projectId), ...list.data]);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import failed", "error");
    } finally {
      setBusy(null);
    }
  }

  async function addUnit() {
    if (!projectId || !newUnit.unitNo.trim()) {
      toast("A unit number is required.", "error");
      return;
    }
    setBusy("unit");
    try {
      const res = await api<{ data: UnitRow }>("/api/admin/sales-offers/units", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          unitNo: newUnit.unitNo,
          unitType: newUnit.unitType || undefined,
          bedrooms: newUnit.bedrooms || undefined,
          area: newUnit.area ? Number(newUnit.area) : undefined,
          areaUnit: newUnit.area ? "sqft" : undefined,
          floor: newUnit.floor || undefined,
          view: newUnit.view || undefined,
          price: newUnit.price ? Number(newUnit.price) : undefined,
          currency: (project?.currency || currency || "AED"),
        }),
      });
      setUnitList((prev) => [...prev, res.data]);
      setNewUnit({ unitNo: "", unitType: "", bedrooms: "", area: "", price: "", floor: "", view: "" });
      toast("Unit added to inventory");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not add the unit", "error");
    } finally {
      setBusy(null);
    }
  }

  async function deleteUnit(id: number) {
    setBusy(`unit-${id}`);
    try {
      await api(`/api/admin/sales-offers/units?id=${id}`, { method: "DELETE" });
      setUnitList((prev) => prev.filter((u) => u.id !== id));
      if (unitId === id) setUnitId(null);
      toast("Unit removed");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not remove the unit", "error");
    } finally {
      setBusy(null);
    }
  }

  function onPicked(m: MediaRow) {
    if (pickerFor && typeof pickerFor === "object") {
      const key = pickerFor.planImage;
      setOptions((o) => ({
        ...o,
        assets: {
          ...o.assets,
          planImages: [...(o.assets.planImages ?? []).filter((p) => p.planKey !== key), { planKey: key, image: m.url }].slice(0, 8),
        },
      }));
    }
    if (pickerFor === "cover") setOptions((o) => ({ ...o, assets: { ...o.assets, coverImage: m.url } }));
    if (pickerFor === "gallery") setOptions((o) => ({ ...o, assets: { ...o.assets, gallery: [...new Set([...o.assets.gallery, m.url])].slice(0, 12) } }));
    if (pickerFor === "floorplan") setOptions((o) => ({ ...o, assets: { ...o.assets, floorPlans: [...o.assets.floorPlans, { name: m.originalName.replace(/\.[^.]+$/, ""), image: m.url }].slice(0, 8) } }));
    if (pickerFor === "projectLogo") setOptions((o) => ({ ...o, assets: { ...o.assets, projectLogo: m.url } }));
    if (pickerFor === "mrHomeLogo") setOptions((o) => ({ ...o, assets: { ...o.assets, mrHomeLogo: m.url } }));
    setPickerFor(null);
    setDirty(true);
  }

  function setDesign(patch: Partial<OfferDesign>) {
    setOptions((o) => ({ ...o, design: { ...o.design, ...patch } }));
    setDirty(true);
  }

  function setAssets(patch: Partial<OfferAssets>) {
    setOptions((o) => ({ ...o, assets: { ...o.assets, ...patch } }));
    setDirty(true);
  }

  const tabList: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "offer", label: "Offer", icon: <FileText className="h-3.5 w-3.5" /> },
    { key: "prompt", label: "AI prompt", icon: <Sparkles className="h-3.5 w-3.5" /> },
    { key: "plans", label: "Payment plans", icon: <Layers className="h-3.5 w-3.5" />, badge: errors.filter((e) => e.path?.startsWith("plans") || e.path === "unitPrice").length || undefined },
    { key: "design", label: "Design & assets", icon: <Palette className="h-3.5 w-3.5" /> },
    { key: "inventory", label: "Inventory", icon: <ListChecks className="h-3.5 w-3.5" /> },
    { key: "review", label: "Preview & approve", icon: <Eye className="h-3.5 w-3.5" />, badge: versions.length || undefined },
  ];

  const disabled = !canWrite || status === "approved" || status === "archived";

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/admin/sales-offers" className="mt-1 rounded-lg border border-ink/10 bg-white p-2 hover:border-ink/25" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[20px] font-semibold tracking-tight">{title || "Untitled sales offer"}</h1>
              <Badge tone={TONES[status]}>{STATUS_LABELS[status]}</Badge>
              {dirty && <span className="text-[11px] font-medium text-amber-700">Unsaved changes</span>}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-mist">
              <span className="font-mono">{reference}</span>
              {project && <span>· {project.name}</span>}
              {unit.unitNo && <span>· Unit {unit.unitNo}</span>}
              {savedAt && <span>· Saved {formatDateTime(savedAt)}</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && status !== "approved" && status !== "archived" && (
            <Btn variant="secondary" onClick={save} loading={busy === "save"} disabled={!!busy}><Save className="h-4 w-4" /> Save draft</Btn>
          )}
          {canWrite && status !== "approved" && status !== "archived" && (
            <Btn onClick={generate} loading={busy === "generate"} disabled={!!busy || needsInfo} title={needsInfo ? "Resolve validation errors first" : undefined}><FileText className="h-4 w-4" /> Generate PDF</Btn>
          )}
          {canApprove && status === "ready_for_review" && (
            <Btn onClick={approve} loading={busy === "approve"} disabled={!!busy}><Check className="h-4 w-4" /> Approve</Btn>
          )}
          {(status === "approved" || status === "archived") && canWrite && (
            <Btn onClick={revise} loading={busy === "revise"} disabled={!!busy}><Copy className="h-4 w-4" /> Revise</Btn>
          )}
          {canWrite && offerId && status !== "archived" && (
            <Btn variant="secondary" onClick={() => setConfirmArchive(true)} disabled={!!busy}><Archive className="h-4 w-4" /> Archive</Btn>
          )}
          {canWrite && offerId && status === "archived" && (
            <Btn variant="secondary" onClick={archive} loading={busy === "archive"}><RotateCcw className="h-4 w-4" /> Restore</Btn>
          )}
        </div>
      </div>

      {status === "approved" && (
        <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[12.5px] text-emerald-900 ring-1 ring-emerald-200">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>This offer is approved and immutable. Its generated PDF cannot be replaced. Use <b>Revise</b> to create a new draft while preserving this version.</p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-4">
          <div className="flex gap-1 overflow-x-auto rounded-xl border border-ink/8 bg-white p-1 shadow-sm">
            {tabList.map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)} className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-medium transition", tab === t.key ? "bg-brand text-white" : "text-charcoal hover:bg-slate-100")}>
                {t.icon} {t.label}
                {t.badge ? <span className={cn("rounded-full px-1.5 text-[10px]", tab === t.key ? "bg-white/25" : "bg-slate-100 text-charcoal")}>{t.badge}</span> : null}
              </button>
            ))}
          </div>

          {tab === "offer" && (
            <div className="space-y-4">
              <Section title="Customer & project" hint="Customer details are stored with the offer and never sent to the AI provider.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls} htmlFor="offer-lead">Link to a lead</label>
                    <select id="offer-lead" value={leadId ?? ""} onChange={(e) => chooseLead(e.target.value)} className={inputCls} disabled={disabled}>
                      <option value="">No lead — standalone offer</option>
                      {leads.map((l) => <option key={l.id} value={l.id}>{l.name}{l.email ? ` · ${l.email}` : l.phone ? ` · ${l.phone}` : ""}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="offer-project">Project</label>
                    <select id="offer-project" value={projectId ?? ""} onChange={(e) => chooseProject(e.target.value)} className={inputCls} disabled={disabled}>
                      <option value="">Select a project</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.city ? ` · ${p.city}` : ""}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="offer-unit">Unit</label>
                    <select id="offer-unit" value={unitId ?? ""} onChange={(e) => chooseUnit(e.target.value)} className={inputCls} disabled={disabled || !projectId}>
                      <option value="">{projectUnits.length ? "Select a unit" : "No units imported yet"}</option>
                      {projectUnits.map((u) => <option key={u.id} value={u.id}>{u.unitNo}{u.unitType ? ` · ${u.unitType}` : ""}{u.price ? ` · ${formatMinor(Number(u.price), u.currency)} ${u.currency}` : ""}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="offer-title">Offer title (internal)</label>
                    <input id="offer-title" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className={inputCls} disabled={disabled} placeholder="e.g. Reportage Residences — Unit 1007" />
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {([["name", "Customer name"], ["email", "Email"], ["phone", "Phone"], ["country", "Country"]] as const).map(([key, label]) => (
                    <div key={key}>
                      <label className={labelCls} htmlFor={`customer-${key}`}>{label}</label>
                      <input id={`customer-${key}`} value={customer[key]} onChange={(e) => { setCustomer({ ...customer, [key]: e.target.value }); setDirty(true); }} className={inputCls} disabled={disabled} />
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Unit details" hint="Pre-filled from the project inventory; edit only when the offer genuinely differs.">
                <div className="grid gap-3 sm:grid-cols-3">
                  {([["unitNo", "Unit no."], ["type", "Unit type"], ["bedrooms", "Bedrooms"], ["floor", "Floor"], ["view", "View"], ["area", "Area"]] as const).map(([key, label]) => (
                    <div key={key}>
                      <label className={labelCls} htmlFor={`unit-${key}`}>{label}</label>
                      <input id={`unit-${key}`} value={fieldValue(unit[key])} onChange={(e) => { setUnit({ ...unit, [key]: e.target.value }); setDirty(true); }} className={inputCls} disabled={disabled} />
                    </div>
                  ))}
                  <div>
                    <label className={labelCls} htmlFor="unit-areaUnit">Area unit</label>
                    <select id="unit-areaUnit" value={fieldValue(unit.areaUnit) || "sqft"} onChange={(e) => { setUnit({ ...unit, areaUnit: e.target.value }); setDirty(true); }} className={inputCls} disabled={disabled}>
                      {["sqft", "sqmt", "marla", "kanal"].map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              </Section>

              <Section title="Pricing & dates" hint="Figures are validated deterministically. Nothing is inferred from an absent value.">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className={labelCls} htmlFor="terms-currency">Currency</label>
                    <input id="terms-currency" value={terms.currency} onChange={(e) => updateTerms({ currency: e.target.value.toUpperCase().slice(0, 3) })} className={inputCls} disabled={disabled} maxLength={3} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="terms-price">Unit price</label>
                    <input id="terms-price" value={fieldValue(terms.unitPrice)} onChange={(e) => updateTerms({ unitPrice: numOrEmpty(e.target.value) })} className={inputCls} disabled={disabled} inputMode="decimal" placeholder="0" />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="terms-vat">VAT % (only if applicable)</label>
                    <input id="terms-vat" value={terms.vatPct == null ? "" : String(terms.vatPct)} onChange={(e) => updateTerms({ vatPct: e.target.value === "" ? null : Number(e.target.value) })} className={inputCls} disabled={disabled} inputMode="decimal" placeholder="Leave blank if not applicable" />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="terms-start">First installment date</label>
                    <input id="terms-start" type="date" value={terms.paymentStartDate ?? ""} onChange={(e) => updateTerms({ paymentStartDate: e.target.value || null })} className={inputCls} disabled={disabled} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="terms-handover">Handover date</label>
                    <input id="terms-handover" type="date" value={terms.handoverDate ?? ""} onChange={(e) => updateTerms({ handoverDate: e.target.value || null })} className={inputCls} disabled={disabled} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="terms-rounding">Installment rounding</label>
                    <select id="terms-rounding" value={terms.rounding ?? "currency"} onChange={(e) => updateTerms({ rounding: e.target.value as OfferTermsInput["rounding"] })} className={inputCls} disabled={disabled}>
                      <option value="currency">Currency precision (exact totals)</option>
                      <option value="nearest100">Round each installment to 100</option>
                    </select>
                  </div>
                </div>
                <div className="mt-3">
                  <label className={labelCls} htmlFor="terms-notes">Internal notes</label>
                  <textarea id="terms-notes" value={terms.notes ?? ""} onChange={(e) => updateTerms({ notes: e.target.value })} className={cn(inputCls, "h-20 py-2")} disabled={disabled} />
                </div>
              </Section>
            </div>
          )}

          {tab === "prompt" && (
            <Section title="Describe the offer" hint="The AI interprets your instruction and points at records. It never calculates a price.">
              <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} className={cn(inputCls, "h-28 py-2")} placeholder="Prepare an offer for Unit 2703 in Reportage Residences. Show Plans 1 and 3. Use the project logo and building images, exclude the Mr Home logo, highlight the initial payment and handover, and use the green, black and white premium design." />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  "Use the green, black and white premium design.",
                  "Exclude the Mr Home logo from this offer.",
                  "Include the Mr Home logo small on the cover.",
                  "Show all payment plans in one PDF.",
                ].map((p) => <button key={p} type="button" onClick={() => setAiPrompt((v) => (v ? `${v} ${p}` : p))} className="rounded-full border border-ink/10 px-2.5 py-1 text-[11px] text-charcoal hover:border-brand hover:text-brand">{p}</button>)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Btn onClick={interpret} loading={busy === "ai"} disabled={!canWrite || !aiPrompt.trim()}><Sparkles className="h-4 w-4" /> Interpret prompt</Btn>
                {ai?.status.configured ? <span className="text-[11px] text-mist">{ai.status.provider} · {ai.status.model}</span> : <span className="text-[11px] text-amber-700">AI not configured — structured builder is fully usable.</span>}
              </div>

              {promptQuestions.length > 0 && (
                <div className="mt-3 rounded-xl bg-sky-50 p-3 ring-1 ring-sky-200">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-sky-800">Answer before generating</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-[12px] text-sky-900">{promptQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                </div>
              )}

              {ai && (
                <div className="mt-4 space-y-3">
                  {!ai.ai.ok && <div className="rounded-xl bg-amber-50 p-3 text-[12px] text-amber-900 ring-1 ring-amber-200">{ai.ai.error}</div>}
                  {ai.ai.ok && ai.ai.data && (
                    <>
                      <div className="rounded-xl bg-slate-50 p-3 text-[12.5px]"><b>Summary:</b> {ai.ai.data.summary || "—"}</div>
                      {ai.ai.data.facts.length > 0 && (
                        <div>
                          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-mist">Facts & sources</h3>
                          <ul className="divide-y divide-ink/6 rounded-xl border border-ink/8">
                            {ai.ai.data.facts.map((f, i) => (
                              <li key={i} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-[12px]">
                                <div><div className="font-medium">{f.label}</div><div className="text-charcoal/75">{f.value}</div></div>
                                <div className="text-right text-[10.5px] text-mist"><Badge tone={f.confidence === "high" ? "green" : f.confidence === "low" ? "amber" : "neutral"}>{f.confidence}</Badge><div className="mt-1">{f.source}</div></div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {ai.ai.data.warnings.length > 0 && (
                        <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200"><h3 className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">AI warnings</h3><ul className="mt-1 list-disc space-y-1 pl-4 text-[12px] text-amber-900">{ai.ai.data.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Btn variant="secondary" size="sm" onClick={applyAi} disabled={!canWrite}>Apply title / logo / theme</Btn>
                      </div>
                    </>
                  )}
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-[10.5px] text-charcoal/70 ring-1 ring-ink/8">
                    {ai.disclosure.dataShared ? `Prompt and project/unit records were sent to ${ai.disclosure.provider}. ` : ""}{ai.disclosure.note} Free-tier limits and terms can change; no paid fallback is enabled.
                  </p>
                </div>
              )}

              {conversation.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-mist">Prompt history</h3>
                  <ul className="space-y-1.5">
                    {conversation.slice(-6).map((c, i) => <li key={i} className={cn("rounded-lg px-3 py-2 text-[12px]", c.role === "user" ? "bg-slate-50" : "bg-brand/5")}><b className="capitalize">{c.role}:</b> {c.content}</li>)}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {tab === "plans" && (
            <div className="space-y-4">
              <Section title="Payment plans" hint="Each plan must allocate exactly 100% of its contract price. Installment percentages are per payment (1% × 45 = 45%)." actions={canWrite && !disabled ? <Btn size="sm" variant="secondary" onClick={addPlan}><Plus className="h-3.5 w-3.5" /> Add plan</Btn> : undefined}>
                <div className="space-y-3">
                  {terms.plans.map((plan, planIndex) => {
                    const pc = calc.plans.find((p) => p.key === plan.key);
                    const planErrors = calc.issues.filter((i) => i.planKey === plan.key);
                    const allocPct = pc && pc.contractPriceMinor > 0 ? Math.round((pc.allocatedMinor / pc.contractPriceMinor) * 10000) / 100 : 0;
                    return (
                      <div key={plan.key} className="rounded-xl border border-ink/10 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-charcoal">Plan {planIndex + 1}</span>
                          <input value={plan.name} onChange={(e) => updatePlan(plan.key, { name: e.target.value })} className={cn(inputCls, "h-8 w-auto min-w-[140px] flex-1")} disabled={disabled} aria-label="Plan name" />
                          <input value={plan.badge ?? ""} onChange={(e) => updatePlan(plan.key, { badge: e.target.value })} className={cn(inputCls, "h-8 w-28")} disabled={disabled} placeholder="Badge" aria-label="Plan badge" />
                          <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={!!plan.highlight} onChange={(e) => updatePlan(plan.key, { highlight: e.target.checked })} disabled={disabled} className="accent-[#1f8f3a]" /> Highlight</label>
                          {canWrite && !disabled && <div className="ml-auto flex gap-1"><button type="button" onClick={() => duplicatePlan(plan.key)} className="rounded p-1 text-mist hover:text-brand" aria-label="Duplicate plan"><Copy className="h-3.5 w-3.5" /></button><button type="button" onClick={() => removePlan(plan.key)} className="rounded p-1 text-mist hover:text-red-600" aria-label="Remove plan"><Trash2 className="h-3.5 w-3.5" /></button></div>}
                        </div>

                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                          <div>
                            <label className={labelCls}>Discount</label>
                            <select value={plan.discount?.type ?? "none"} onChange={(e) => {
                              const type = e.target.value as "none" | "percent" | "amount";
                              updatePlan(plan.key, { discount: type === "none" ? { type: "none" } : { type, value: Number(plan.discount?.value ?? 0), reason: plan.discount?.reason } });
                            }} className={cn(inputCls, "h-9")} disabled={disabled}>
                              <option value="none">No discount</option><option value="percent">Percent (%)</option><option value="amount">Fixed amount</option>
                            </select>
                          </div>
                          <div>
                            <label className={labelCls}>Discount value</label>
                            <input value={plan.discount?.type === "none" ? "" : String(plan.discount?.value ?? "")} onChange={(e) => {
                              const type = plan.discount?.type ?? "none";
                              updatePlan(plan.key, { discount: type === "none" ? { type: "none" } : { type, value: Number(e.target.value), reason: plan.discount?.reason } });
                            }} className={cn(inputCls, "h-9")} disabled={disabled || plan.discount?.type === "none"} inputMode="decimal" />
                          </div>
                          <div>
                            <label className={labelCls}>Reason (optional)</label>
                            <input value={plan.discount?.reason ?? ""} onChange={(e) => {
                              const type = plan.discount?.type ?? "none";
                              updatePlan(plan.key, { discount: type === "none" ? { type: "none", reason: e.target.value } : { type, value: Number(plan.discount?.value ?? 0), reason: e.target.value } });
                            }} className={cn(inputCls, "h-9")} disabled={disabled} />
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          {plan.components.map((c) => (
                            <div key={c.id} className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-50 p-2 sm:grid-cols-12">
                              <input value={c.label} onChange={(e) => updateComponent(plan.key, c.id, { label: e.target.value })} className={cn(inputCls, "h-8 sm:col-span-3")} disabled={disabled} aria-label="Component label" />
                              <select value={c.timing} onChange={(e) => updateComponent(plan.key, c.id, { timing: e.target.value })} className={cn(inputCls, "h-8 sm:col-span-2")} disabled={disabled} aria-label="Payment stage">
                                <option value="booking">Booking</option><option value="downPayment">Down payment</option><option value="installments">Installments</option><option value="construction">Construction</option><option value="handover">Handover</option><option value="milestone">Milestone</option><option value="other">Other</option>
                              </select>
                              <select value={c.type} onChange={(e) => updateComponent(plan.key, c.id, { type: e.target.value })} className={cn(inputCls, "h-8 sm:col-span-1")} disabled={disabled} aria-label="Value type"><option value="percent">%</option><option value="amount">Amt</option></select>
                              <input value={String(c.value)} onChange={(e) => updateComponent(plan.key, c.id, { value: Number(e.target.value) })} className={cn(inputCls, "h-8 sm:col-span-1")} disabled={disabled} inputMode="decimal" aria-label="Value" />
                              {(c.timing === "installments" || c.timing === "milestone") && (
                                <>
                                  <input value={c.count ?? 1} onChange={(e) => updateComponent(plan.key, c.id, { count: Number(e.target.value) })} className={cn(inputCls, "h-8 sm:col-span-1")} disabled={disabled} inputMode="numeric" aria-label="Count" title="Number of payments" />
                                  <select value={c.frequency ?? "monthly"} onChange={(e) => updateComponent(plan.key, c.id, { frequency: e.target.value })} className={cn(inputCls, "h-8 sm:col-span-2")} disabled={disabled} aria-label="Frequency"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select>
                                </>
                              )}
                              <div className="flex items-center justify-between gap-1 sm:col-span-2">
                                <span className="text-[10px] text-mist">{pc?.components.find((x) => x.id === c.id) ? formatMinor(pc.components.find((x) => x.id === c.id)!.totalMinor, currency) : "—"}</span>
                                {canWrite && !disabled && <button type="button" onClick={() => { setTerms((t) => ({ ...t, plans: t.plans.map((p) => (p.key === plan.key ? { ...p, components: p.components.filter((x) => x.id !== c.id) } : p)) })); setDirty(true); }} className="rounded p-1 text-mist hover:text-red-600" aria-label="Remove component"><X className="h-3.5 w-3.5" /></button>}
                              </div>
                            </div>
                          ))}
                          {canWrite && !disabled && (
                            <div className="flex flex-wrap gap-1.5">
                              {(["downPayment", "installments", "construction", "handover", "milestone"] as const).map((t) => <button key={t} type="button" onClick={() => addComponent(plan.key, t)} className="rounded-full border border-ink/10 px-2 py-1 text-[10.5px] hover:border-brand hover:text-brand">+ {t === "downPayment" ? "Down payment" : t}</button>)}
                            </div>
                          )}
                        </div>

                        {pc && (
                          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-white p-2 text-[11px] ring-1 ring-ink/8 sm:grid-cols-5">
                            <div><div className="text-mist">Contract</div><div className="font-semibold">{formatMinor(pc.contractPriceMinor, currency)}</div></div>
                            <div><div className="text-mist">Initial</div><div className="font-semibold">{formatMinor(pc.initialPaymentMinor, currency)}</div></div>
                            <div><div className="text-mist">Monthly</div><div className="font-semibold">{pc.installmentCount ? `${formatMinor(pc.installmentAmountMinor, currency)} × ${pc.installmentCount}` : "—"}</div></div>
                            <div><div className="text-mist">Handover</div><div className="font-semibold">{formatMinor(pc.handoverPaymentMinor, currency)}</div></div>
                            <div><div className="text-mist">Allocated</div><div className={cn("font-semibold", allocPct === 100 ? "text-emerald-700" : "text-red-700")}>{allocPct}%</div></div>
                          </div>
                        )}
                        {planErrors.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {planErrors.map((e, i) => <li key={i} className={cn("rounded-lg px-2 py-1 text-[11.5px] ring-1", issueClass(e.severity))}>{e.message}</li>)}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Section>

              <Section title="Fees" hint="Only add fees that genuinely apply. Nothing is assumed." actions={canWrite && !disabled ? <Btn size="sm" variant="secondary" onClick={() => { const nextId = `fee-${(terms.fees?.length ?? 0) + 1}`; updateTerms({ fees: [...(terms.fees ?? []), { id: nextId, label: "Registration fee", type: "percent", value: 4, basis: "contractPrice" }] }); }}><Plus className="h-3.5 w-3.5" /> Add fee</Btn> : undefined}>
                {(terms.fees?.length ?? 0) === 0 ? <p className="text-[12.5px] text-mist">No fees added — the offer shows the unit price only.</p> : (
                  <div className="space-y-2">
                    {terms.fees!.map((fee) => (
                      <div key={fee.id} className="grid grid-cols-2 gap-1.5 sm:grid-cols-12">
                        <input value={fee.label} onChange={(e) => updateTerms({ fees: terms.fees!.map((f) => (f.id === fee.id ? { ...f, label: e.target.value } : f)) })} className={cn(inputCls, "h-8 sm:col-span-4")} disabled={disabled} aria-label="Fee label" />
                        <select value={fee.type} onChange={(e) => updateTerms({ fees: terms.fees!.map((f) => (f.id === fee.id ? { ...f, type: e.target.value as "percent" | "amount" } : f)) })} className={cn(inputCls, "h-8 sm:col-span-2")} disabled={disabled} aria-label="Fee type"><option value="percent">Percent</option><option value="amount">Amount</option></select>
                        <input value={String(fee.value)} onChange={(e) => updateTerms({ fees: terms.fees!.map((f) => (f.id === fee.id ? { ...f, value: Number(e.target.value) } : f)) })} className={cn(inputCls, "h-8 sm:col-span-2")} disabled={disabled} inputMode="decimal" aria-label="Fee value" />
                        <select value={fee.basis ?? "contractPrice"} onChange={(e) => updateTerms({ fees: terms.fees!.map((f) => (f.id === fee.id ? { ...f, basis: e.target.value as "contractPrice" | "listPrice" } : f)) })} className={cn(inputCls, "h-8 sm:col-span-2")} disabled={disabled} aria-label="Fee basis"><option value="contractPrice">of contract</option><option value="listPrice">of list price</option></select>
                        {canWrite && !disabled && <button type="button" onClick={() => updateTerms({ fees: terms.fees!.filter((f) => f.id !== fee.id) })} className="rounded p-1 text-mist hover:text-red-600 sm:col-span-1" aria-label="Remove fee"><Trash2 className="h-3.5 w-3.5" /></button>}
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          )}

          {tab === "design" && (
            <div className="space-y-4">
              <Section title="Brand theme" hint="Premium green, black and white is the default; every offer can differ.">
                <div className="grid gap-2 sm:grid-cols-3">
                  {THEME_PRESETS.map((p) => (
                    <button key={p.key} type="button" onClick={() => setDesign({ theme: p.key, accent: p.accent, ink: p.ink, paper: p.paper, displayFont: p.displayFont, coverStyle: p.coverStyle })} disabled={disabled} className={cn("rounded-xl border p-3 text-left transition", options.design.theme === p.key ? "border-brand ring-2 ring-brand/20" : "border-ink/10 hover:border-ink/25")}>
                      <div className="flex gap-1"><span className="h-4 w-4 rounded-full" style={{ background: p.accent }} /><span className="h-4 w-4 rounded-full" style={{ background: p.ink }} /><span className="h-4 w-4 rounded-full border border-ink/10" style={{ background: p.paper }} /></div>
                      <div className="mt-2 text-[12px] font-medium">{p.label}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {([["accent", "Accent"], ["ink", "Ink"], ["paper", "Paper"]] as const).map(([key, label]) => (
                    <div key={key}>
                      <label className={labelCls}>{label}</label>
                      <div className="flex gap-1"><input type="color" value={options.design[key]} onChange={(e) => setDesign({ [key]: e.target.value })} className="h-9 w-10 rounded border border-ink/10" disabled={disabled} aria-label={`${label} colour`} /><input value={options.design[key]} onChange={(e) => setDesign({ [key]: e.target.value })} className={cn(inputCls, "h-9 font-mono text-[11px]")} disabled={disabled} /></div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Toggle checked={options.assets.includeMrHomeLogo} onChange={(v) => setAssets({ includeMrHomeLogo: v })} label="Include the Mr Home logo" help="Asked per offer. Defaults to off; it is never inherited from the previous offer." disabled={disabled} />
                  <div className="rounded-xl border border-ink/8 p-3">
                    <div className="mb-2 text-[12.5px] font-medium">Mr Home logo asset</div>
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-20 rounded border border-ink/10 bg-slate-50 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: options.assets.mrHomeLogo ? `url("${options.assets.mrHomeLogo}")` : undefined }} />
                      <Btn size="sm" variant="secondary" onClick={() => setPickerFor("mrHomeLogo")} disabled={disabled}><ImageIcon className="h-3.5 w-3.5" /> Choose</Btn>
                      {options.assets.mrHomeLogo && <button type="button" onClick={() => setAssets({ mrHomeLogo: undefined })} className="text-[11px] text-mist hover:text-red-600" disabled={disabled}>Clear</button>}
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="Cover & layout" hint="Compose the document per offer: cover treatment, headline face, vertical rhythm and page furniture.">
                <div className="grid gap-2 sm:grid-cols-3">
                  {([
                    ["photo", "Photo cover", "Full-bleed project photography with a tinted scrim."],
                    ["split", "Split cover", "Solid type panel beside the hero image."],
                    ["solid", "Solid cover", "Type-first cover with a restrained image band."],
                  ] as const).map(([key, label, help]) => (
                    <button key={key} type="button" onClick={() => setDesign({ coverStyle: key })} disabled={disabled} className={cn("rounded-xl border p-3 text-left transition", (options.design.coverStyle ?? "photo") === key ? "border-brand ring-2 ring-brand/20" : "border-ink/10 hover:border-ink/25")}>
                      <div className="text-[12.5px] font-medium">{label}</div>
                      <div className="mt-0.5 text-[11px] text-mist">{help}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div><label className={labelCls}>Cover headline</label><input value={options.design.headline ?? ""} onChange={(e) => setDesign({ headline: e.target.value })} className={inputCls} placeholder={project?.name || "Project name"} disabled={disabled} /></div>
                  <div><label className={labelCls}>Eyebrow line</label><input value={options.design.eyebrow ?? ""} onChange={(e) => setDesign({ eyebrow: e.target.value })} className={inputCls} placeholder="Prestigious living at" disabled={disabled} /></div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className={labelCls}>Headline face</label>
                    <div className="flex gap-1">
                      {([["sans", "Sans"], ["serif", "Serif"]] as const).map(([key, label]) => (
                        <button key={key} type="button" onClick={() => setDesign({ displayFont: key })} disabled={disabled} className={cn("h-9 flex-1 rounded-lg border text-[12px]", (options.design.displayFont ?? "sans") === key ? "border-brand bg-brand/5 text-brand" : "border-ink/10")}>{label}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Density</label>
                    <div className="flex gap-1">
                      {([["comfortable", "Comfortable"], ["compact", "Compact"]] as const).map(([key, label]) => (
                        <button key={key} type="button" onClick={() => setDesign({ density: key })} disabled={disabled} className={cn("h-9 flex-1 rounded-lg border text-[12px]", (options.design.density ?? "comfortable") === key ? "border-brand bg-brand/5 text-brand" : "border-ink/10")}>{label}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Cover scrim {options.design.coverOverlay ?? 52}%</label>
                    <input type="range" min={0} max={90} step={2} value={options.design.coverOverlay ?? 52} onChange={(e) => setDesign({ coverOverlay: Number(e.target.value) })} disabled={disabled} className="mt-2 w-full accent-[#1f8f3a]" aria-label="Cover scrim strength" />
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Toggle checked={options.design.showUnitStrip !== false} onChange={(v) => setDesign({ showUnitStrip: v })} label="Unit & price strip" disabled={disabled} />
                  <Toggle checked={options.design.showPlanImages !== false} onChange={(v) => setDesign({ showPlanImages: v })} label="Plan card photos" disabled={disabled} />
                  <Toggle checked={options.design.pageNumbers !== false} onChange={(v) => setDesign({ pageNumbers: v })} label="Page numbers" disabled={disabled} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div><label className={labelCls}>Watermark</label><input value={options.design.watermark ?? ""} onChange={(e) => setDesign({ watermark: e.target.value })} className={inputCls} placeholder="e.g. CONFIDENTIAL" disabled={disabled} /></div>
                  <div><label className={labelCls}>Call to action</label><input value={options.design.ctaText ?? ""} onChange={(e) => setDesign({ ctaText: e.target.value })} className={inputCls} placeholder="Ready to invest?" disabled={disabled} /></div>
                  <div><label className={labelCls}>Call-to-action note</label><input value={options.design.ctaNote ?? ""} onChange={(e) => setDesign({ ctaNote: e.target.value })} className={inputCls} placeholder="Let's get you started." disabled={disabled} /></div>
                </div>
              </Section>

              <Section title="Images" hint="Only choose imagery that genuinely represents this project and unit." actions={<div className="flex gap-1"><Btn size="sm" variant="secondary" onClick={() => setPickerFor("cover")} disabled={disabled}><Upload className="h-3.5 w-3.5" /> Cover</Btn><Btn size="sm" variant="secondary" onClick={() => setPickerFor("gallery")} disabled={disabled}><Plus className="h-3.5 w-3.5" /> Gallery</Btn></div>}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <div className={labelCls}>Cover image</div>
                    <div className="relative flex h-28 items-end overflow-hidden rounded-xl border border-ink/10 bg-slate-50 bg-cover bg-center p-2" style={{ backgroundImage: options.assets.coverImage ? `url("${options.assets.coverImage}")` : undefined }}>
                      {!options.assets.coverImage && <span className="text-[12px] text-mist">No cover selected</span>}
                      {options.assets.coverImage && <button type="button" onClick={() => setAssets({ coverImage: undefined })} className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white" disabled={disabled}>Remove</button>}
                    </div>
                  </div>
                  <div>
                    <div className={labelCls}>Project logo</div>
                    <div className="flex h-28 items-center justify-between gap-2 rounded-xl border border-ink/10 bg-slate-50 bg-contain bg-center bg-no-repeat p-2" style={{ backgroundImage: options.assets.projectLogo ? `url("${options.assets.projectLogo}")` : undefined }}>
                      {!options.assets.projectLogo && <span className="text-[12px] text-mist">No project logo</span>}
                      <div className="ml-auto flex gap-1">
                        <Btn size="sm" variant="secondary" onClick={() => setPickerFor("projectLogo")} disabled={disabled}>Choose</Btn>
                        {options.assets.projectLogo && <Btn size="sm" variant="ghost" onClick={() => setAssets({ projectLogo: undefined })} disabled={disabled}>Clear</Btn>}
                      </div>
                    </div>
                  </div>
                </div>

                {(project?.gallery?.length ?? 0) > 0 && (
                  <div className="mt-3">
                    <div className={labelCls}>Available project images</div>
                    <div className="flex flex-wrap gap-2">
                      {[project?.coverImage, ...(project?.gallery ?? [])].filter((u): u is string => !!u).map((url) => {
                        const active = options.assets.gallery.includes(url) || options.assets.coverImage === url;
                        return (
                          <button key={url} type="button" disabled={disabled} onClick={() => setAssets({ gallery: active ? options.assets.gallery.filter((u) => u !== url) : [...new Set([...options.assets.gallery, url])].slice(0, 12) })} className={cn("relative h-16 w-24 overflow-hidden rounded-lg border bg-cover bg-center", active ? "border-brand ring-2 ring-brand/30" : "border-ink/10 opacity-80 hover:opacity-100")} style={{ backgroundImage: `url("${url}")` }} aria-label="Toggle gallery image">
                            {active && <span className="absolute right-1 top-1 rounded-full bg-brand p-0.5 text-white"><Check className="h-3 w-3" /></span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {options.assets.gallery.length > 0 && (
                  <div className="mt-3">
                    <div className={labelCls}>Selected gallery ({options.assets.gallery.length}/12)</div>
                    <div className="flex flex-wrap gap-2">
                      {options.assets.gallery.map((url) => (
                        <div key={url} className="relative h-16 w-24 overflow-hidden rounded-lg border border-ink/10 bg-cover bg-center" style={{ backgroundImage: `url("${url}")` }}>
                          <button type="button" onClick={() => setAssets({ gallery: options.assets.gallery.filter((u) => u !== url) })} disabled={disabled} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white" aria-label="Remove image"><X className="h-3 w-3" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {terms.plans.length > 0 && (
                  <div className="mt-3">
                    <div className={labelCls}>Plan card imagery</div>
                    <p className="text-[11px] text-mist">Optional per-plan photo. Without a selection the cards rotate the project gallery.</p>
                    <ul className="mt-1 space-y-1.5">
                      {terms.plans.map((p, i) => {
                        const assigned = (options.assets.planImages ?? []).find((x) => x.planKey === p.key);
                        return (
                          <li key={p.key} className="flex items-center gap-2 rounded-lg border border-ink/8 p-2">
                            <div className="h-8 w-10 rounded bg-slate-50 bg-cover bg-center" style={{ backgroundImage: assigned?.image ? `url("${assigned.image}")` : undefined }} />
                            <span className="flex-1 text-[12px]">{p.name || `Plan ${i + 1}`}</span>
                            <Btn size="sm" variant="secondary" onClick={() => setPickerFor({ planImage: p.key })} disabled={disabled}>Choose</Btn>
                            {assigned && <button type="button" onClick={() => setAssets({ planImages: (options.assets.planImages ?? []).filter((x) => x.planKey !== p.key) })} className="text-[11px] text-mist hover:text-red-600" disabled={disabled}>Clear</button>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <div className="mt-4">
                  <div className="flex items-center justify-between"><div className={labelCls}>Floor plans</div><Btn size="sm" variant="secondary" onClick={() => setPickerFor("floorplan")} disabled={disabled}><Plus className="h-3.5 w-3.5" /> Add</Btn></div>
                  {options.assets.floorPlans.length === 0 ? <p className="text-[12px] text-mist">No floor plans selected.</p> : (
                    <ul className="space-y-1.5">
                      {options.assets.floorPlans.map((f, i) => (
                        <li key={`${f.image}-${i}`} className="flex items-center gap-2 rounded-lg border border-ink/8 p-2">
                          <div className="h-10 w-14 rounded bg-slate-50 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url("${f.image}")` }} />
                          <input value={f.name} onChange={(e) => setAssets({ floorPlans: options.assets.floorPlans.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)) })} className={cn(inputCls, "h-8 flex-1")} disabled={disabled} aria-label="Floor plan name" />
                          <button type="button" onClick={() => setAssets({ floorPlans: options.assets.floorPlans.filter((_, xi) => xi !== i) })} disabled={disabled} className="rounded p-1 text-mist hover:text-red-600" aria-label="Remove floor plan"><Trash2 className="h-3.5 w-3.5" /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(project?.floorPlans?.filter((f) => f.image).length ?? 0) > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {project!.floorPlans!.filter((f) => f.image).map((f) => <button key={f.name} type="button" onClick={() => setAssets({ floorPlans: [...options.assets.floorPlans, { name: f.name, image: f.image! }].slice(0, 8) })} disabled={disabled} className="rounded-full border border-ink/10 px-2 py-1 text-[10.5px] hover:border-brand hover:text-brand">+ {f.name}</button>)}
                    </div>
                  )}
                </div>
              </Section>

              <Section title="Content & contact" hint="Keep the document focused. No Thank You page, schedule page or T&C page is added.">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Toggle checked={options.design.showPriceBreakdown} onChange={(v) => setDesign({ showPriceBreakdown: v })} label="Price breakdown table" disabled={disabled} />
                  <Toggle checked={options.design.showScheduleSummary} onChange={(v) => setDesign({ showScheduleSummary: v })} label="Compact payment timeline" disabled={disabled} />
                  <Toggle checked={options.design.showGallery} onChange={(v) => setDesign({ showGallery: v })} label="Project gallery page" disabled={disabled} />
                  <Toggle checked={options.design.showFloorPlans} onChange={(v) => setDesign({ showFloorPlans: v })} label="Floor plan pages" disabled={disabled} />
                  <Toggle checked={options.design.showContact} onChange={(v) => setDesign({ showContact: v })} label="Contact block" disabled={disabled} />
                  <Toggle checked={options.design.showDisclaimer} onChange={(v) => setDesign({ showDisclaimer: v })} label="Disclaimer on the last page" disabled={disabled} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div><label className={labelCls}>Prepared by</label><input value={options.design.preparedBy ?? ""} onChange={(e) => setDesign({ preparedBy: e.target.value })} className={inputCls} disabled={disabled} /></div>
                  <div><label className={labelCls}>Tagline</label><input value={options.design.tagline ?? ""} onChange={(e) => setDesign({ tagline: e.target.value })} className={inputCls} disabled={disabled} /></div>
                  <div><label className={labelCls}>Contact phone</label><input value={options.design.contactPhone ?? ""} onChange={(e) => setDesign({ contactPhone: e.target.value })} className={inputCls} disabled={disabled} /></div>
                  <div><label className={labelCls}>Contact email</label><input value={options.design.contactEmail ?? ""} onChange={(e) => setDesign({ contactEmail: e.target.value })} className={inputCls} disabled={disabled} /></div>
                  <div><label className={labelCls}>Website</label><input value={options.design.contactSite ?? ""} onChange={(e) => setDesign({ contactSite: e.target.value })} className={inputCls} disabled={disabled} /></div>
                  <div><label className={labelCls}>Footer note</label><input value={options.design.footerNote ?? ""} onChange={(e) => setDesign({ footerNote: e.target.value })} className={inputCls} disabled={disabled} /></div>
                </div>
                <div className="mt-3"><label className={labelCls}>Disclaimer</label><textarea value={options.design.disclaimer ?? ""} onChange={(e) => setDesign({ disclaimer: e.target.value })} className={cn(inputCls, "h-20 py-2")} disabled={disabled} /></div>
              </Section>
            </div>
          )}

          {tab === "inventory" && (
            <div className="space-y-4">
              <Section title={`Inventory${project ? ` — ${project.name}` : ""}`} hint="Importing never overwrites an existing unit unless you explicitly choose Update." actions={canImport && !disabled ? <input ref={importRef} type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void runImport(f); e.target.value = ""; }} /> : undefined}>
                {!projectId ? <p className="text-[13px] text-mist">Select a project to manage its units.</p> : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {canImport && !disabled && <Btn variant="secondary" loading={busy === "import"} onClick={() => importRef.current?.click()}><Upload className="h-4 w-4" /> Import CSV / XLSX / PDF</Btn>}
                      <a href={`/admin/projects/${projectId}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-ink/10 px-4 text-[13px] hover:border-brand"><FileSpreadsheet className="h-4 w-4" /> Project record</a>
                      <span className="inline-flex h-10 items-center text-[12px] text-mist">{projectUnits.length} unit(s)</span>
                    </div>

                    {importPreview && (
                      <div className="mt-4 rounded-xl border border-brand/30 bg-brand/5 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-[12.5px]"><b>{importPreview.media.name}</b> · {importPreview.source.toUpperCase()} · {importPreview.summary.rows} rows · {importPreview.summary.existing} existing · {importPreview.summary.duplicatesInFile} in-file duplicate(s)</div>
                          <div className="flex gap-1"><Btn size="sm" variant="ghost" onClick={() => setImportPreview(null)}>Cancel</Btn><Btn size="sm" loading={busy === "commit"} onClick={commitImport} disabled={!importPreview.rows.length}>Import</Btn></div>
                        </div>
                        {importPreview.errors.length > 0 && <ul className="mt-2 list-disc pl-4 text-[11.5px] text-red-700">{importPreview.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
                        {importPreview.warnings.length > 0 && <ul className="mt-2 list-disc pl-4 text-[11.5px] text-amber-800">{importPreview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
                          <label className="flex items-center gap-1"><input type="radio" checked={importMode === "skip"} onChange={() => setImportMode("skip")} className="accent-[#1f8f3a]" /> Skip existing</label>
                          <label className="flex items-center gap-1"><input type="radio" checked={importMode === "update"} onChange={() => setImportMode("update")} className="accent-[#1f8f3a]" /> Update existing</label>
                          <span className="text-mist">Mapping: {Object.entries(importPreview.mapping).filter(([, v]) => v).map(([k, v]) => `${k} → ${v}`).join(", ") || "none"}</span>
                        </div>
                        {importPreview.rows.length > 0 && (
                          <div className="mt-2 max-h-64 overflow-auto rounded-lg bg-white">
                            <table className="w-full text-left text-[11.5px]">
                              <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-mist"><tr><th className="px-2 py-1.5">Unit</th><th className="px-2 py-1.5">Type</th><th className="px-2 py-1.5">Beds</th><th className="px-2 py-1.5">Area</th><th className="px-2 py-1.5">Price</th><th className="px-2 py-1.5">Flags</th></tr></thead>
                              <tbody className="divide-y divide-ink/6">
                                {importPreview.rows.map((r, i) => (
                                  <tr key={`${r.unitNo}-${i}`} className={r.warnings.length ? "bg-amber-50/40" : undefined}>
                                    <td className="px-2 py-1.5 font-medium">{r.unitNo}</td>
                                    <td className="px-2 py-1.5">{r.unitType ?? "—"}</td>
                                    <td className="px-2 py-1.5">{r.bedrooms ?? "—"}</td>
                                    <td className="px-2 py-1.5">{r.area ?? "—"} {r.areaUnit ?? ""}</td>
                                    <td className="px-2 py-1.5">{r.price != null ? formatMinor(r.price * 100, currency) : "—"}</td>
                                    <td className="px-2 py-1.5 text-[10.5px]">{r.exists ? <Badge tone="amber">exists</Badge> : <Badge tone="green">new</Badge>}{r.duplicateInFile && <span className="ml-1 text-amber-800">dup</span>}{r.warnings.length > 0 && <span className="ml-1 text-red-700" title={r.warnings.join("; ")}>!</span>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {importPreview.extractedText && <details className="mt-2 text-[11px]"><summary className="cursor-pointer text-mist">Extracted PDF text</summary><pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-white p-2">{importPreview.extractedText}</pre></details>}
                      </div>
                    )}

                    {canImport && !disabled && (
                      <div className="mt-4 grid gap-2 rounded-xl border border-ink/8 p-3 sm:grid-cols-6">
                        <input value={newUnit.unitNo} onChange={(e) => setNewUnit({ ...newUnit, unitNo: e.target.value })} className={cn(inputCls, "h-9 sm:col-span-1")} placeholder="Unit no." aria-label="New unit number" />
                        <input value={newUnit.unitType} onChange={(e) => setNewUnit({ ...newUnit, unitType: e.target.value })} className={cn(inputCls, "h-9 sm:col-span-1")} placeholder="Type" aria-label="New unit type" />
                        <input value={newUnit.bedrooms} onChange={(e) => setNewUnit({ ...newUnit, bedrooms: e.target.value })} className={cn(inputCls, "h-9 sm:col-span-1")} placeholder="Beds" aria-label="New unit bedrooms" />
                        <input value={newUnit.area} onChange={(e) => setNewUnit({ ...newUnit, area: e.target.value })} className={cn(inputCls, "h-9 sm:col-span-1")} placeholder="Area sqft" aria-label="New unit area" inputMode="decimal" />
                        <input value={newUnit.price} onChange={(e) => setNewUnit({ ...newUnit, price: e.target.value })} className={cn(inputCls, "h-9 sm:col-span-1")} placeholder="Price" aria-label="New unit price" inputMode="decimal" />
                        <Btn size="sm" loading={busy === "unit"} onClick={addUnit}><Plus className="h-3.5 w-3.5" /> Add</Btn>
                      </div>
                    )}

                    <div className="mt-3 overflow-auto rounded-xl border border-ink/8">
                      <table className="w-full text-left text-[12px]">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-mist"><tr><th className="px-3 py-2">Unit</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Beds</th><th className="px-3 py-2">Area</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr></thead>
                        <tbody className="divide-y divide-ink/6">
                          {projectUnits.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-mist">No units yet. Import a spreadsheet or add one manually.</td></tr>}
                          {projectUnits.map((u) => (
                            <tr key={u.id}>
                              <td className="px-3 py-2 font-medium">{u.unitNo}</td>
                              <td className="px-3 py-2">{u.unitType ?? "—"}</td>
                              <td className="px-3 py-2">{u.bedrooms ?? "—"}</td>
                              <td className="px-3 py-2">{u.area ? `${u.area} ${u.areaUnit ?? ""}` : "—"}</td>
                              <td className="px-3 py-2">{u.price ? `${formatMinor(Number(u.price), u.currency)} ${u.currency}` : "—"}</td>
                              <td className="px-3 py-2"><Badge tone="neutral">{u.status}</Badge></td>
                              <td className="px-3 py-2 text-right">{canImport && !disabled && <button type="button" onClick={() => deleteUnit(u.id)} className="rounded p-1 text-mist hover:text-red-600" aria-label={`Delete unit ${u.unitNo}`} disabled={busy === `unit-${u.id}`}><Trash2 className="h-3.5 w-3.5" /></button>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </Section>
            </div>
          )}

          {tab === "review" && (
            <div className="space-y-4">
              <Section title="Screen preview" hint="A live content check. Generate the PDF for the exact client document.">
                <div className="overflow-hidden rounded-2xl border border-ink/10" style={{ background: options.design.paper }}>
                  <div className="relative p-5" style={{ background: options.design.ink, color: "#fff" }}>
                    {options.assets.includeMrHomeLogo && <div className="mb-2 text-[10px] font-bold tracking-widest">MR.HOME</div>}
                    <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: options.design.accent }}>{options.design.tagline}</div>
                    <div className="mt-1 text-[24px] font-bold leading-tight">{project?.name ?? "Project name"}</div>
                    <div className="mt-1 text-[11px] opacity-80">{[project?.city, project?.country].filter(Boolean).join(", ") || "Location"}</div>
                    <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
                      <div><div className="text-[8px] uppercase tracking-wider opacity-70">Unit</div><div className="text-[16px] font-semibold">{unit.unitNo || "—"}</div><div className="text-[10px] opacity-80">{[unit.type, unit.bedrooms ? `${unit.bedrooms} bed` : "", unit.area ? `${unit.area} ${unit.areaUnit ?? ""}` : ""].filter(Boolean).join(" · ")}</div></div>
                      <div className="rounded-lg p-3 text-right" style={{ background: "rgba(255,255,255,0.12)" }}><div className="text-[8px] uppercase tracking-wider opacity-70">From</div><div className="text-[18px] font-bold" style={{ color: options.design.accent }}>{formatMinor(Math.min(...(calc.plans.length ? calc.plans.map((p) => p.contractPriceMinor) : [0])), currency)} {currency}</div></div>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: options.design.accent }}>Payment plans</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {calc.plans.map((p) => (
                        <div key={p.key} className="rounded-xl border p-2.5" style={{ borderColor: "rgba(0,0,0,0.1)" }}>
                          <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase text-charcoal/60">{p.name}</span>{p.badge && <span className="rounded px-1 py-0.5 text-[8px] font-bold text-white" style={{ background: options.design.accent }}>{p.badge}</span>}</div>
                          <div className="mt-1 text-[20px] font-bold" style={{ color: options.design.accent }}>{p.components.find((c) => c.timing === "downPayment")?.value ?? 0}%</div>
                          <div className="text-[8px] uppercase tracking-wider text-charcoal/50">Down payment</div>
                          <div className="mt-1 space-y-0.5 text-[9px] text-charcoal/70"><div>Installments {p.installmentCount ? `${formatMinor(p.installmentAmountMinor, currency)} × ${p.installmentCount}` : "—"}</div><div>Handover {formatMinor(p.handoverPaymentMinor, currency)}</div></div>
                          <div className="mt-1.5 rounded p-1 text-[10px] font-bold text-white" style={{ background: options.design.ink }}>{formatMinor(p.contractPriceMinor, currency)}</div>
                        </div>
                      ))}
                    </div>
                    {options.design.showPriceBreakdown && (
                      <table className="mt-3 w-full text-left text-[9.5px]">
                        <thead><tr className="text-charcoal/50"><th className="py-1">Description</th>{calc.plans.map((p) => <th key={p.key} className="py-1 text-right">{p.name}</th>)}</tr></thead>
                        <tbody className="divide-y divide-black/5">
                          <tr><td className="py-1">List price</td>{calc.plans.map((p) => <td key={p.key} className="py-1 text-right">{formatMinor(p.listPriceMinor, currency)}</td>)}</tr>
                          <tr><td className="py-1">Final price</td>{calc.plans.map((p) => <td key={p.key} className="py-1 text-right font-semibold">{formatMinor(p.contractPriceMinor, currency)}</td>)}</tr>
                          <tr><td className="py-1">Total payable</td>{calc.plans.map((p) => <td key={p.key} className="py-1 text-right font-semibold">{formatMinor(p.totalPayableMinor, currency)}</td>)}</tr>
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </Section>

              {canWrite && status !== "approved" && status !== "archived" && (
                <Section title="Generate the client PDF" hint="Generation validates every figure and verifies them again in the finished PDF.">
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-[12.5px]"><input type="radio" checked={genMode === "combined"} onChange={() => setGenMode("combined")} className="accent-[#1f8f3a]" /> One combined PDF</label>
                    <label className="flex items-center gap-2 text-[12.5px]"><input type="radio" checked={genMode === "separate"} onChange={() => setGenMode("separate")} className="accent-[#1f8f3a]" /> Separate PDF per plan</label>
                  </div>
                  {genMode === "separate" && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {terms.plans.map((p) => <label key={p.key} className="flex items-center gap-1.5 rounded-lg border border-ink/10 px-2 py-1 text-[11.5px]"><input type="checkbox" checked={genPlanKeys.includes(p.key)} onChange={(e) => setGenPlanKeys(e.target.checked ? [...genPlanKeys, p.key] : genPlanKeys.filter((k) => k !== p.key))} className="accent-[#1f8f3a]" /> {p.name}</label>)}
                    </div>
                  )}
                  {needsInfo && <div className="mt-3 rounded-lg bg-red-50 p-3 text-[12px] text-red-700 ring-1 ring-red-200">Resolve {errors.length} validation error(s) before generating. See the summary panel.</div>}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Btn onClick={generate} loading={busy === "generate"} disabled={!!busy || needsInfo || (genMode === "separate" && genPlanKeys.length === 0)}><FileText className="h-4 w-4" /> Generate {genMode === "separate" ? `${genPlanKeys.length} PDFs` : "PDF"}</Btn>
                    <Btn variant="secondary" onClick={save} loading={busy === "save"} disabled={!!busy}><Save className="h-4 w-4" /> Save draft</Btn>
                  </div>
                </Section>
              )}

              <Section title="Version history" hint="Every generated document is an immutable snapshot. Approved files are never replaced.">
                {versions.length === 0 ? <p className="text-[12.5px] text-mist">No PDFs generated yet.</p> : (
                  <ul className="divide-y divide-ink/6">
                    {versions.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center gap-2 py-2 text-[12px]">
                        <Badge tone={v.status === "approved" ? "green" : "blue"}>{v.status.replace(/_/g, " ")}</Badge>
                        <span className="font-mono text-[11px]">v{v.version}</span>
                        <span className="min-w-0 flex-1 truncate">{v.filename}</span>
                        <span className="text-[10.5px] text-mist">{v.size ? `${(v.size / 1024).toFixed(0)} KB` : ""} · {formatDateTime(v.createdAt)}</span>
                        <button type="button" onClick={() => setPreviewVersion(v)} className="rounded p-1 text-mist hover:text-brand" aria-label={`Preview version ${v.version}`}><Eye className="h-3.5 w-3.5" /></button>
                        <a href={`/api/admin/sales-offers/${offerId}/pdf?version=${v.id}`} className="rounded p-1 text-mist hover:text-brand" aria-label={`Download version ${v.version}`}><Download className="h-3.5 w-3.5" /></a>
                      </li>
                    ))}
                  </ul>
                )}
                {canApprove && status === "ready_for_review" && versions.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
                    <p className="flex-1 text-[12px] text-emerald-900">Review the PDF, then approve. Approval locks this batch and records who approved it.</p>
                    <Btn size="sm" onClick={approve} loading={busy === "approve"} disabled={!!busy}><Check className="h-3.5 w-3.5" /> Approve offer</Btn>
                  </div>
                )}
              </Section>
            </div>
          )}
        </div>

        <aside className="space-y-3 xl:sticky xl:top-20 xl:self-start">
          <section className="rounded-2xl border border-ink/8 bg-white p-4 shadow-sm">
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-mist">Live calculation</h2>
            <dl className="mt-3 space-y-1.5 text-[12.5px]">
              <div className="flex justify-between"><dt className="text-charcoal/70">Unit price</dt><dd className="font-semibold">{formatMinor(calc.unitPriceMinor, currency)} {currency}</dd></div>
              {calc.plans.map((p) => (
                <div key={p.key} className="mt-2 rounded-xl bg-slate-50 p-2.5">
                  <div className="flex items-center justify-between"><dt className="text-[11px] font-semibold uppercase tracking-wider text-charcoal/70">{p.name}</dt><dd className="text-[10px] text-mist">{p.discountAmountMinor > 0 ? `${p.discount.type === "percent" ? `${p.discount.value}%` : formatMinor(p.discountAmountMinor, currency)} off` : "no discount"}</dd></div>
                  <div className="mt-1 flex justify-between text-[11.5px]"><span>Contract</span><b>{formatMinor(p.contractPriceMinor, currency)}</b></div>
                  <div className="flex justify-between text-[11.5px]"><span>Initial</span><span>{formatMinor(p.initialPaymentMinor, currency)}</span></div>
                  <div className="flex justify-between text-[11.5px]"><span>Monthly</span><span>{p.installmentCount ? `${formatMinor(p.installmentAmountMinor, currency)} × ${p.installmentCount}` : "—"}</span></div>
                  <div className="flex justify-between text-[11.5px]"><span>Handover</span><span>{formatMinor(p.handoverPaymentMinor, currency)}</span></div>
                  <div className="mt-1 flex justify-between border-t border-ink/8 pt-1 text-[12px]"><span>Total payable</span><b>{formatMinor(p.totalPayableMinor, currency)}</b></div>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-2xl border border-ink/8 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><h2 className="text-[12px] font-semibold uppercase tracking-wider text-mist">Validation</h2>{needsInfo ? <Badge tone="red">{errors.length} error{errors.length > 1 ? "s" : ""}</Badge> : <Badge tone="green">Ready</Badge>}</div>
            {errors.length === 0 && warnings.length === 0 && <p className="mt-2 text-[12px] text-emerald-700">All figures reconcile. Generate the PDF when the content is ready.</p>}
            {errors.length > 0 && <ul className="mt-2 space-y-1">{errors.slice(0, 6).map((e, i) => <li key={i} className={cn("rounded-lg px-2 py-1 text-[11px] ring-1", issueClass("error"))}>{e.message}</li>)}{errors.length > 6 && <li className="text-[11px] text-mist">+ {errors.length - 6} more</li>}</ul>}
            {warnings.length > 0 && <ul className="mt-2 space-y-1">{warnings.slice(0, 4).map((e, i) => <li key={i} className={cn("rounded-lg px-2 py-1 text-[11px] ring-1", issueClass("warning"))}>{e.message}</li>)}</ul>}
            {deriveQuestions(calc, { paymentStartDate: terms.paymentStartDate, handoverDate: terms.handoverDate, customer }).slice(0, 4).map((q, i) => <p key={i} className="mt-1.5 text-[11px] text-sky-800">Ask: {q}</p>)}
          </section>

          <section className="rounded-2xl border border-ink/8 bg-white p-4 shadow-sm">
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-mist">AI assist</h2>
            <p className="mt-1 text-[11.5px] text-charcoal/70">{ai?.status.configured ?? true ? "Optional prompt interpretation. Financial facts always come from the validated engine." : "Not configured on this deployment — use the structured form."}</p>
            <button type="button" onClick={() => setTab("prompt")} className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"><Sparkles className="h-3.5 w-3.5" /> Open prompt assistant <ChevronRight className="h-3.5 w-3.5" /></button>
          </section>

          {offerId && (
            <section className="rounded-2xl border border-ink/8 bg-white p-4 shadow-sm">
              <h2 className="text-[12px] font-semibold uppercase tracking-wider text-mist">Latest file</h2>
              {versions[0] ? <><p className="mt-1 truncate text-[12px]">{versions[0].filename}</p><div className="mt-2 flex gap-2"><a href={`/api/admin/sales-offers/${offerId}/pdf?version=${versions[0].id}&inline=1`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-ink/10 px-2.5 text-[11.5px] hover:border-brand"><Eye className="h-3.5 w-3.5" /> View</a><a href={`/api/admin/sales-offers/${offerId}/pdf?version=${versions[0].id}`} className="inline-flex h-8 items-center gap-1 rounded-lg bg-ink px-2.5 text-[11.5px] text-white hover:bg-brand"><Download className="h-3.5 w-3.5" /> Download</a></div></> : <p className="mt-1 text-[12px] text-mist">Generate a PDF to preview and download it.</p>}
            </section>
          )}
        </aside>
      </div>

      <MediaPicker open={!!pickerFor} onClose={() => setPickerFor(null)} onSelect={onPicked} accept={!pickerFor || typeof pickerFor === "object" || pickerFor === "floorplan" || pickerFor === "cover" || pickerFor === "gallery" || pickerFor === "projectLogo" || pickerFor === "mrHomeLogo" ? "image" : "any"} />

      <Modal open={!!previewVersion} onClose={() => setPreviewVersion(null)} title={previewVersion?.filename ?? "PDF preview"} wide>
        {previewVersion && offerId && (
          <div className="space-y-2">
            <iframe title={previewVersion.filename ?? "Offer PDF"} src={`/api/admin/sales-offers/${offerId}/pdf?version=${previewVersion.id}&inline=1`} className="h-[70vh] w-full rounded-lg border border-ink/10" />
            <div className="flex justify-end gap-2"><a href={`/api/admin/sales-offers/${offerId}/pdf?version=${previewVersion.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12.5px] text-white"><Download className="h-3.5 w-3.5" /> Download</a></div>
          </div>
        )}
      </Modal>

      <Confirm open={confirmArchive} onClose={() => setConfirmArchive(false)} title="Archive this offer?" message="The offer and its generated files are retained; it stops appearing in the active workflow. You can restore it later." confirmLabel="Archive" onConfirm={archive} />
    </div>
  );
}
