"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Download, FileText, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  projectSlug: string;
  projectName: string;
  className?: string;
};

const fieldCls =
  "h-12 w-full rounded-xl border border-ink/10 bg-white px-4 text-[14px] text-ink outline-none transition placeholder:text-mist focus:border-brand focus:ring-4 focus:ring-brand/10";

/**
 * Public "Download Brochure" button + pop-up contact form gate.
 * Submitting creates a brochure-download lead and immediately starts the
 * signed download — no page navigation involved.
 */
type Progress = { loaded: number; total: number };

function fmtBytes(b: number) {
  return b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1_024))} KB`;
}

export function BrochureGate({ projectSlug, projectName, className }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null); // live while streaming
  const [dlDone, setDlDone] = useState(false);
  const [dlFailed, setDlFailed] = useState(false);
  const autoTriggered = useRef(false);

  // Lock page scroll while the modal is open.
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  function reset() {
    setStatus("idle");
    setMessage(null);
    setIssues({});
    setDownloadUrl(null);
    setProgress(null);
    setDlDone(false);
    setDlFailed(false);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    delete payload.website;
    // The gate modal is rendered outside the form fields — attach the project
    // context explicitly or the API schema rejects the request ("validation failed").
    payload.projectSlug = projectSlug;
    setStatus("loading");
    setIssues({});
    try {
      const res = await fetch("/api/brochures/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        issues?: { path: string; message: string }[];
        url?: string;
      };
      if (!res.ok) {
        const map: Record<string, string> = {};
        (data.issues ?? []).forEach((i) => {
          map[i.path] = i.message;
        });
        setIssues(map);
        setStatus("error");
        // A bare "Validation failed" banner tells the user nothing — surface the
        // first specific field issue instead, keeping real API errors verbatim.
        setMessage(
          data.error === "Validation failed"
            ? (data.issues?.[0]?.message ?? "Please check your details and try again.")
            : (data.error || "Submission failed. Please try again."),
        );
        return;
      }
      if (!data.url) {
        setStatus("error");
        setMessage("The brochure could not be released. Please try again.");
        return;
      }
      setStatus("success");
      setDownloadUrl(data.url);
      form.reset();
    } catch {
      setStatus("error");
      setMessage("Network error. Please check your connection and try again.");
    }
  }

  // Auto-start the download once, after a successful gate submit. The file is
  // streamed through a ReadableStream so the slide can show real progress:
  // MBs downloaded out of total MBs, then a completion state.
  useEffect(() => {
    if (status !== "success" || !downloadUrl || autoTriggered.current) return;
    autoTriggered.current = true;
    void startDownload(downloadUrl);
  }, [status, downloadUrl]);

  async function startDownload(url: string) {
    setProgress({ loaded: 0, total: 0 });
    setDlDone(false);
    setDlFailed(false);
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) throw new Error(res.status === 403 ? "Brochure access expired — submit the form again." : "Download failed. Please try again.");
      // Preferred filename comes from the API's Content-Disposition header.
      const cd = res.headers.get("content-disposition") ?? "";
      const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
      const filename = match?.[1] ?? `${projectName}-brochure.pdf`;
      const total = Number(res.headers.get("content-length")) || 0;
      let loaded = 0;
      const chunks: BlobPart[] = [];
      if (res.body) {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (value) {
            chunks.push(value);
            loaded += value.byteLength;
            setProgress({ loaded, total: total || loaded });
          }
          if (done) break;
        }
      }
      const blob = new Blob(chunks, { type: res.headers.get("content-type") || "application/pdf" });
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      setProgress({ loaded: blob.size, total: total || blob.size });
      setDlDone(true);
    } catch (err) {
      setProgress(null);
      setDlFailed(true);
      setMessage(err instanceof Error ? err.message : "Download failed. Please try again.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className={cn(
          "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 text-[15px] font-medium text-white backdrop-blur transition hover:border-brand-bright hover:bg-brand hover:shadow-card",
          className,
        )}
      >
        <Download className="h-4 w-4" />
        Download Brochure
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-space/70 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={`Download the ${projectName} brochure`}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: "spring", damping: 26, stiffness: 300 }}
              className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-card sm:p-8"
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute right-4 top-4 rounded-full p-2 text-charcoal/60 transition hover:bg-ivory-deep hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>

              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <FileText className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-[21px] font-semibold tracking-tight text-ink">{projectName} brochure</h2>
              <p className="mt-1.5 text-[14px] text-charcoal/75">
                Fill in your details and the brochure downloads instantly — an MR.HOME advisor will also follow up with you.
              </p>

              {status === "success" ? (
                <div className="mt-6 flex flex-col items-center rounded-2xl bg-ivory-deep/60 px-6 py-8 text-center" role="status">
                  <span className={cn("flex h-14 w-14 items-center justify-center rounded-full transition-colors", dlDone ? "bg-brand/10 text-brand" : "bg-brand/10 text-brand")}>
                    {dlDone ? <Check className="h-7 w-7" /> : <Download className="h-7 w-7 animate-pulse" />}
                  </span>
                  <p className="mt-4 text-[15px] font-semibold text-ink">
                    {dlDone ? "Download complete" : dlFailed ? "Download didn't finish" : "Downloading your brochure"}
                  </p>
                  {/* Download-completion slide: MBs out of total MBs + live %. */}
                  {progress && (
                    <div className="mt-3 w-full max-w-xs">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
                        <motion.div
                          className="h-full rounded-full bg-brand"
                          animate={{ width: `${dlDone ? 100 : progress.total ? Math.min(100, (progress.loaded / progress.total) * 100) : 12}%` }}
                          transition={{ ease: "linear", duration: 0.25 }}
                        />
                      </div>
                      <p className="mt-2 text-[12.5px] text-charcoal/75">
                        {dlDone
                          ? `${fmtBytes(progress.loaded)} downloaded of ${fmtBytes(progress.total)} — complete ✓`
                          : dlFailed
                            ? null
                            : progress.total
                              ? `${fmtBytes(progress.loaded)} of ${fmtBytes(progress.total)} (${Math.floor((progress.loaded / progress.total) * 100)}%)`
                              : `${fmtBytes(progress.loaded)} downloaded…`}
                      </p>
                    </div>
                  )}
                  {dlFailed && message && <p className="mt-2 text-[13px] text-red-600">{message}</p>}
                  {downloadUrl && (
                    <button type="button" onClick={() => void startDownload(downloadUrl)} className="mt-3 inline-flex items-center gap-2 text-[13.5px] font-medium text-brand underline-offset-4 hover:underline">
                      <Download className="h-4 w-4" /> Download again
                    </button>
                  )}
                  <button type="button" onClick={() => setOpen(false)} className="mt-5 text-[13px] text-charcoal/70 underline-offset-4 hover:underline">
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={submit} noValidate className="mt-5 grid gap-3">
                  {/* Honeypot */}
                  <div className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden" aria-hidden>
                    <label>
                      Website
                      <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                    </label>
                  </div>
                  <div>
                    <label htmlFor="bg-name" className="sr-only">Full name</label>
                    <input id="bg-name" name="name" required placeholder="Full Name" className={fieldCls} autoComplete="name" />
                    {issues.name && <p className="mt-1 text-[12px] text-red-600" role="alert">{issues.name}</p>}
                  </div>
                  <div>
                    <label htmlFor="bg-phone" className="sr-only">Phone / WhatsApp</label>
                    <input id="bg-phone" name="phone" type="tel" required placeholder="Phone / WhatsApp (with country code)" className={fieldCls} autoComplete="tel" />
                    {issues.phone && <p className="mt-1 text-[12px] text-red-600" role="alert">{issues.phone}</p>}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="bg-city" className="sr-only">City</label>
                      <input id="bg-city" name="city" required placeholder="City" className={fieldCls} autoComplete="address-level2" />
                      {issues.city && <p className="mt-1 text-[12px] text-red-600" role="alert">{issues.city}</p>}
                    </div>
                    <div>
                      <label htmlFor="bg-country" className="sr-only">Country</label>
                      <input id="bg-country" name="country" required placeholder="Country" className={fieldCls} autoComplete="country-name" />
                      {issues.country && <p className="mt-1 text-[12px] text-red-600" role="alert">{issues.country}</p>}
                    </div>
                  </div>
                  {status === "error" && message && (
                    <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700" role="alert">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{message}</span>
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand px-6 text-[15px] font-semibold text-white transition hover:bg-brand-bright disabled:opacity-60"
                  >
                    {status === "loading" ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Preparing your download…
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <Download className="h-4 w-4" /> Download now
                      </span>
                    )}
                  </button>
                  <p className="text-[11.5px] leading-relaxed text-mist">
                    By submitting you agree to our{" "}
                    <Link href="/privacy-policy" className="underline underline-offset-2">Privacy Policy</Link>.
                  </p>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
