"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clipboard, RefreshCw } from "lucide-react";
import { api, Btn, Card, useToast } from "./ui";

type Preview = {
  title: string;
  path: string | null;
  jsonLd: Record<string, unknown>;
  draft: boolean;
  note?: string;
};

/**
 * Read-only output from the same generator the public page uses. There is no
 * raw JSON editor: edits happen in the CMS fields and the preview refreshes
 * from the saved values.
 */
export function StructuredDataPreview({
  query,
  title = "JSON-LD preview",
  refreshKey,
}: {
  query: string;
  title?: string;
  refreshKey?: string | number;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ data: Preview }>(`/api/admin/structured-data?${query}`);
      setData(res.data);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load the JSON-LD preview", "error");
    } finally {
      setLoading(false);
    }
  }, [query, toast]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api<{ data: Preview }>(`/api/admin/structured-data?${query}`);
        if (active) setData(res.data);
      } catch (e) {
        if (active) toast(e instanceof Error ? e.message : "Could not load the JSON-LD preview", "error");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [query, refreshKey, toast]);

  const json = data ? JSON.stringify(data.jsonLd, null, 2) : "";

  const copy = async () => {
    if (!json) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
      } else {
        const area = document.createElement("textarea");
        area.value = json;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      setCopied(true);
      toast("JSON-LD copied", "success");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("Could not copy — select the JSON and copy it manually", "error");
    }
  };

  return (
    <Card
      title={title}
      actions={
        <div className="flex items-center gap-2">
          <Btn type="button" variant="ghost" size="sm" loading={loading} onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Btn>
          <Btn type="button" variant="secondary" size="sm" disabled={!json} onClick={() => void copy()}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy JSON-LD"}
          </Btn>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-[12px] leading-relaxed text-mist">
          Read-only. Generated from the saved CMS/settings values used by the public page — there is no raw JSON editor here.
          {data?.path ? ` Path: ${data.path}.` : ""}
        </p>
        {data?.note && <p className="text-[12px] leading-relaxed text-charcoal/70">{data.note}</p>}
        {data?.draft && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            Draft preview — the public page suppresses this schema until the record is published.
          </p>
        )}
        <pre className="max-h-[360px] overflow-auto rounded-xl border border-ink/8 bg-slate-950 p-4 text-[11.5px] leading-relaxed text-slate-100">
          {loading && !data ? "Loading…" : json || "No JSON-LD returned."}
        </pre>
      </div>
    </Card>
  );
}
