import "server-only";
import {
  PDFDocument,
  StandardFonts,
  clip,
  closePath,
  degrees,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { formatMinor } from "./money";
import type { OfferCalculation, OfferSnapshotInput, PlanCalculation } from "./types";

/**
 * Premium branded sales-offer PDF. The renderer draws from the deterministic
 * calculation output only — it never computes or rounds a financial figure
 * itself. Layout is dynamic: page breaks are inserted where content would
 * overflow, cards size to their content, and the disclaimer sits at the bottom
 * of the last relevant page (no Thank You page, no standalone schedule page).
 */

const A4 = { w: 595.28, h: 841.89 };
const M = 42;

type ImageMap = Map<string, PDFImage>;

type Ctx = {
  pdf: PDFDocument;
  page: PDFPage;
  pages: PDFPage[];
  y: number;
  font: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  /** Headline / section-title face (sans or serif depending on the design). */
  display: PDFFont;
  /** Vertical rhythm multiplier for cards and tables. */
  density: number;
  images: ImageMap;
  snapshot: OfferSnapshotInput;
  calc: OfferCalculation;
  accent: ReturnType<typeof rgb>;
  ink: ReturnType<typeof rgb>;
  paper: ReturnType<typeof rgb>;
  muted: ReturnType<typeof rgb>;
  line: ReturnType<typeof rgb>;
};

function hexToRgb(hex: string, fallback: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  const h = m ? m[1] : fallback.replace("#", "");
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}

/** WinAnsi-safe text: PDF standard fonts cannot encode emoji or Arabic. */
function safe(text: unknown): string {
  return String(text ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00b7/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\u00d7/g, "x")
    .replace(/\u2192/g, "->")
    .replace(/\u2265/g, ">=")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\u00a1-\u00ff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = safe(text);
  if (!clean) return [""];
  const words = clean.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = "";
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
            if (chunk) lines.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        current = chunk;
      } else current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const clean = safe(text);
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let out = clean;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) out = out.slice(0, -1);
  return `${out.trim()}...`;
}

function money(minor: number, currency: string) {
  return formatMinor(minor, currency);
}

function pctOf(partMinor: number, totalMinor: number): string {
  if (!totalMinor) return "0%";
  const p = (partMinor / totalMinor) * 100;
  return `${p.toFixed(p % 1 === 0 ? 0 : 1)}%`;
}

function newPage(ctx: Ctx) {
  const page = ctx.pdf.addPage([A4.w, A4.h]);
  page.drawRectangle({ x: 0, y: 0, width: A4.w, height: A4.h, color: ctx.paper });
  ctx.page = page;
  ctx.pages.push(page);
  ctx.y = A4.h - M;
  return page;
}

function ensure(ctx: Ctx, height: number) {
  if (ctx.y - height < M + 20) newPage(ctx);
}

function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; maxWidth?: number; align?: "left" | "right" | "center"; lineHeight?: number } = {},
): number {
  const size = opts.size ?? 10;
  const font = opts.font ?? ctx.font;
  const color = opts.color ?? ctx.ink;
  const maxWidth = opts.maxWidth ?? A4.w - M * 2;
  const lines = wrap(value, font, size, maxWidth);
  const lh = opts.lineHeight ?? size * 1.32;
  let cursor = y;
  for (const line of lines) {
    let drawX = x;
    if (opts.align === "right") drawX = x + maxWidth - font.widthOfTextAtSize(line, size);
    if (opts.align === "center") drawX = x + (maxWidth - font.widthOfTextAtSize(line, size)) / 2;
    if (line) ctx.page.drawText(line, { x: drawX, y: cursor - size, size, font, color });
    cursor -= lh;
  }
  return y - cursor;
}

function drawImageContain(page: PDFPage, img: PDFImage, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  page.drawImage(img, { x: x + (w - dw) / 2, y: y + (h - dh) / 2, width: dw, height: dh });
}

function drawImageCover(page: PDFPage, img: PDFImage, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  page.drawImage(img, { x: x + (w - dw) / 2, y: y + (h - dh) / 2, width: dw, height: dh });
}

/**
 * Cover-crop inside a real clip path. Without the clip, a portrait photo drawn
 * "cover" into a short landscape box overflows far outside the box and paints
 * over headings and neighbouring cards.
 */
function drawImageCoverClipped(page: PDFPage, img: PDFImage, x: number, y: number, w: number, h: number) {
  page.pushOperators(
    pushGraphicsState(),
    moveTo(x, y),
    lineTo(x + w, y),
    lineTo(x + w, y + h),
    lineTo(x, y + h),
    closePath(),
    clip(),
    endPath(),
  );
  drawImageCover(page, img, x, y, w, h);
  page.pushOperators(popGraphicsState());
}

async function fetchImage(url: string | undefined, origin: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  let absolute: string;
  try {
    if (trimmed.startsWith("/")) absolute = new URL(trimmed, origin).toString();
    else {
      const u = new URL(trimmed);
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      absolute = u.toString();
    }
  } catch {
    return null;
  }
  try {
    const res = await fetch(absolute, { redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!/^image\/(png|jpe?g)$/.test(type)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 15 * 1024 * 1024) return null;
    return { bytes: new Uint8Array(buf), type };
  } catch {
    return null;
  }
}

async function loadImages(ctx: CtxWithOrigin, urls: (string | undefined)[]) {
  const unique = [...new Set(urls.filter((u): u is string => !!u))];
  await Promise.all(
    unique.map(async (url) => {
      if (ctx.images.has(url)) return;
      const asset = await fetchImage(url, ctx.origin);
      if (!asset) return;
      try {
        const img = asset.type === "image/png" ? await ctx.pdf.embedPng(asset.bytes) : await ctx.pdf.embedJpg(asset.bytes);
        ctx.images.set(url, img);
      } catch {
        /* unsupported/corrupt image — layout falls back to a branded placeholder */
      }
    }),
  );
}

type CtxWithOrigin = Ctx & { origin: string };

/* ------------------------------- cover ------------------------------------ */

function cover(ctx: CtxWithOrigin) {
  const page = ctx.page;
  const coverUrl = ctx.snapshot.assets.coverImage || ctx.snapshot.assets.gallery[0];
  const coverImg = coverUrl ? ctx.images.get(coverUrl) : undefined;
  const style = ctx.snapshot.design.coverStyle ?? (coverImg ? "photo" : "solid");
  const overlay = Math.min(0.9, Math.max(0, (ctx.snapshot.design.coverOverlay ?? 52) / 100));

  if (style === "photo" && coverImg) {
    drawImageCover(page, coverImg, 0, 0, A4.w, A4.h);
    page.drawRectangle({ x: 0, y: 0, width: A4.w, height: A4.h, color: ctx.ink, opacity: overlay });
    page.drawRectangle({ x: 0, y: 0, width: A4.w, height: 250, color: ctx.ink, opacity: 0.28 });
  } else if (style === "split" && coverImg) {
    // Solid type panel on the left, photography on the right.
    page.drawRectangle({ x: 0, y: 0, width: A4.w, height: A4.h, color: ctx.ink });
    drawImageCoverClipped(page, coverImg, A4.w * 0.46, 0, A4.w * 0.54, A4.h);
    page.drawRectangle({ x: A4.w * 0.46, y: 0, width: A4.w * 0.54, height: A4.h, color: ctx.ink, opacity: Math.min(0.6, overlay * 0.6) });
    page.drawRectangle({ x: A4.w * 0.46, y: 0, width: 3, height: A4.h, color: ctx.accent });
  } else {
    page.drawRectangle({ x: 0, y: 0, width: A4.w, height: A4.h, color: ctx.ink });
    if (coverImg && style === "solid") {
      // A restrained photographic band under the type block.
      drawImageCover(page, coverImg, 0, 0, A4.w, A4.h * 0.42);
      page.drawRectangle({ x: 0, y: 0, width: A4.w, height: A4.h * 0.42, color: ctx.ink, opacity: Math.min(0.75, overlay + 0.15) });
    }
    page.drawRectangle({ x: 0, y: A4.h * 0.55, width: A4.w, height: A4.h * 0.45, color: ctx.ink });
    page.drawRectangle({ x: 0, y: A4.h * 0.55, width: 14, height: A4.h * 0.45, color: ctx.accent });
    page.drawRectangle({ x: A4.w - 120, y: A4.h * 0.55, width: 120, height: 3, color: ctx.accent, opacity: 0.7 });
  }

  const white = rgb(1, 1, 1);
  const soft = rgb(0.86, 0.9, 0.87);

  // Brand row (Mr Home logo only when explicitly requested for THIS offer).
  let brandX = M;
  if (ctx.snapshot.assets.includeMrHomeLogo && ctx.snapshot.assets.mrHomeLogo) {
    const img = ctx.images.get(ctx.snapshot.assets.mrHomeLogo);
    if (img) {
      const h = 30;
      const w = (img.width / img.height) * h;
      page.drawImage(img, { x: M, y: A4.h - M - h, width: Math.min(w, 150), height: h });
      brandX = M + Math.min(w, 150) + 14;
    }
  }
  const projectLogo = ctx.snapshot.assets.projectLogo ? ctx.images.get(ctx.snapshot.assets.projectLogo) : undefined;
  if (projectLogo) {
    const h = 34;
    const w = (projectLogo.width / projectLogo.height) * h;
    page.drawImage(projectLogo, { x: A4.w - M - Math.min(w, 170), y: A4.h - M - h, width: Math.min(w, 170), height: h });
  } else {
    text(ctx, (ctx.snapshot.project?.developer || "MR.HOME").toUpperCase(), A4.w - M - 180, A4.h - M, { size: 9, font: ctx.bold, color: white, maxWidth: 180, align: "right" });
    text(ctx, "PRIVATE & CONFIDENTIAL", A4.w - M - 180, A4.h - M - 14, { size: 7.5, color: soft, maxWidth: 180, align: "right" });
  }
  if (brandX === M && ctx.snapshot.assets.includeMrHomeLogo) {
    text(ctx, "MR.HOME", brandX, A4.h - M - 2, { size: 15, font: ctx.bold, color: white });
  }

  // Thin rule under the brand row gives the type block a deliberate frame.
  page.drawLine({ start: { x: M, y: A4.h - M - 44 }, end: { x: A4.w - M, y: A4.h - M - 44 }, thickness: 0.7, color: white, opacity: 0.28 });
  if (style === "solid" && !coverImg) {
    // Type-only covers need composition, not emptiness.
    page.drawRectangle({ x: A4.w * 0.58, y: A4.h * 0.76, width: A4.w * 0.42 - M, height: 2, color: ctx.accent, opacity: 0.9 });
    page.drawRectangle({ x: A4.w * 0.58, y: A4.h * 0.71, width: 90, height: 2, color: white, opacity: 0.35 });
  }

  // Eyebrow + project name.
  const narrowCover = style === "split";
  const textWidth = narrowCover ? A4.w * 0.46 - M * 1.4 : A4.w - M * 2 - 40;
  let y = narrowCover ? A4.h * 0.7 : A4.h * 0.74;
  if (ctx.snapshot.design?.tagline) {
    text(ctx, ctx.snapshot.design.tagline.toUpperCase(), M, y, { size: 8, font: ctx.bold, color: ctx.accent, maxWidth: textWidth });
    y -= 26;
  }
  const eyebrow = safe(ctx.snapshot.design?.eyebrow || "Prestigious living at");
  if (eyebrow) {
    text(ctx, eyebrow.toUpperCase(), M, y, { size: 8.5, font: ctx.bold, color: soft, maxWidth: textWidth });
    y -= 14;
  }
  const title = safe(ctx.snapshot.design?.headline || ctx.snapshot.project?.name || ctx.snapshot.title || "Private Residence");
  const titleSize = narrowCover ? 28 : title.length > 26 ? 34 : 42;
  const titleLines = wrap(title.toUpperCase(), ctx.display, titleSize, textWidth);
  for (const line of titleLines.slice(0, 3)) {
    ctx.page.drawText(line, { x: M, y: y - titleSize, size: titleSize, font: ctx.display, color: white });
    y -= titleSize * 1.02;
  }
  ctx.page.drawRectangle({ x: M, y: y - 8, width: 46, height: 4, color: ctx.accent });
  y -= 28;

  const location = [ctx.snapshot.project?.city, ctx.snapshot.project?.country].filter(Boolean).join(", ");
  if (location) {
    text(ctx, `LOCATION  ${location.toUpperCase()}`, M, y, { size: 8.5, font: ctx.bold, color: soft, maxWidth: 360 });
  }

  // Real project amenities only — never invented selling points.
  const amenities = (ctx.snapshot.project?.amenities ?? []).map((a) => safe(a)).filter(Boolean).slice(0, 4);
  if (amenities.length && !narrowCover) {
    const chipY = 296;
    let cx = M;
    for (const amenity of amenities) {
      const label = amenity.toUpperCase();
      const w = ctx.font.widthOfTextAtSize(label, 6.4) + 20;
      if (cx + w > A4.w - M) break;
      page.drawRectangle({ x: cx, y: chipY, width: w, height: 18, color: white, opacity: 0.1, borderColor: white, borderOpacity: 0.25, borderWidth: 0.5 });
      text(ctx, label, cx + 8, chipY + 12, { size: 6.4, color: white, maxWidth: w - 12 });
      cx += w + 8;
    }
  }

  // Unit + price cards at the bottom (optional unit strip).
  const unit = ctx.snapshot.unit ?? {};
  const cheapest = ctx.calc.plans.length ? [...ctx.calc.plans].sort((a, b) => a.contractPriceMinor - b.contractPriceMinor)[0] : null;
  const unitPriceLine = `List ${money(ctx.calc.unitPriceMinor, ctx.calc.currency)}`;
  const priceCaption = cheapest && cheapest.discountAmountMinor > 0 ? `${unitPriceLine}  -  ${pctOf(cheapest.discountAmountMinor, cheapest.listPriceMinor)} discount` : unitPriceLine;
  const drawUnitCard = (x: number, cy: number, w: number, h: number) => {
    page.drawRectangle({ x, y: cy, width: w, height: h, color: white, opacity: 0.94 });
    page.drawRectangle({ x, y: cy, width: 5, height: h, color: ctx.accent });
    text(ctx, "UNIT NO.", x + 18, cy + h - 20, { size: 6.8, font: ctx.bold, color: ctx.muted });
    text(ctx, unit.unitNo || "To be confirmed", x + 18, cy + h - 32, { size: 19, font: ctx.display, color: ctx.ink, maxWidth: w - 30 });
    const u1 = [unit.type, unit.bedrooms ? `${unit.bedrooms} bed` : "", unit.area ? `${unit.area} ${unit.areaUnit || "sqft"}` : ""].filter(Boolean).join("  -  ");
    text(ctx, u1 || "Unit details to be confirmed", x + 18, cy + h - 58, { size: 7.4, color: ctx.ink, maxWidth: w - 30 });
    text(ctx, [unit.floor ? `Floor ${unit.floor}` : "", unit.view ? `View ${unit.view}` : ""].filter(Boolean).join("  -  "), x + 18, cy + 22, { size: 7.2, color: ctx.muted, maxWidth: w - 30 });
  };
  const drawPriceCard = (x: number, cy: number, w: number, h: number) => {
    page.drawRectangle({ x, y: cy, width: w, height: h, color: ctx.ink, opacity: 0.95 });
    text(ctx, ctx.calc.plans.length > 1 ? "PRICES FROM" : "UNIT PRICE", x + 18, cy + h - 20, { size: 6.8, font: ctx.bold, color: soft });
    text(ctx, money(cheapest?.contractPriceMinor ?? ctx.calc.unitPriceMinor, ctx.calc.currency), x + 18, cy + h - 36, { size: Math.min(22, (w - 36) / 8.4), font: ctx.display, color: white, maxWidth: w - 30 });
    text(ctx, `(${ctx.calc.currency})`, x + 18, cy + h - 60, { size: 7, color: soft });
    text(ctx, priceCaption, x + 18, cy + 24, { size: 6.8, color: soft, maxWidth: w - 30 });
  };
  if (ctx.snapshot.design.showUnitStrip !== false) {
    if (narrowCover) {
      // The split cover has a narrow type panel: stack the cards instead of
      // squeezing two side by side.
      const pw = A4.w * 0.46 - M * 1.4;
      drawPriceCard(M, 300, pw, 100);
      drawUnitCard(M, 166, pw, 118);
    } else {
      const cardY = 150;
      const cardH = 122;
      const cardW = (A4.w - M * 2 - 12) / 2;
      drawUnitCard(M, cardY, cardW, cardH);
      drawPriceCard(M + cardW + 12, cardY, cardW, cardH);
    }
  } else {
    // Slim single price band instead of the two cards.
    page.drawRectangle({ x: M, y: 128, width: A4.w - M * 2, height: 54, color: ctx.ink, opacity: 0.94 });
    page.drawRectangle({ x: M, y: 128, width: 5, height: 54, color: ctx.accent });
    text(ctx, ctx.calc.plans.length > 1 ? "PRICES FROM" : "UNIT PRICE", M + 18, 166, { size: 6.8, font: ctx.bold, color: soft });
    text(ctx, money(cheapest?.contractPriceMinor ?? ctx.calc.unitPriceMinor, ctx.calc.currency), M + 18, 146, { size: 16, font: ctx.display, color: white, maxWidth: 260 });
    if (ctx.snapshot.design.ctaText) text(ctx, safe(ctx.snapshot.design.ctaText).toUpperCase(), A4.w - M - 200, 160, { size: 7.4, font: ctx.bold, color: ctx.accent, maxWidth: 200, align: "right" });
    if (ctx.snapshot.design.ctaNote) text(ctx, safe(ctx.snapshot.design.ctaNote), A4.w - M - 200, 146, { size: 7, color: soft, maxWidth: 200, align: "right" });
  }

  page.drawRectangle({ x: 0, y: 0, width: A4.w, height: 46, color: ctx.ink, opacity: 0.92 });
  text(ctx, safe(ctx.snapshot.design?.contactSite || "www.mrhomerealestate.com"), M, 30, { size: 8.5, font: ctx.bold, color: white });
  text(ctx, "LUXURY  |  INVESTMENT  |  LIFESTYLE", A4.w - M - 240, 30, { size: 7.2, color: soft, maxWidth: 240, align: "right" });
}

/* ------------------------------- plans ------------------------------------ */

function planCardHeight(ctx: Ctx, hasImage: boolean): number {
  return 244 + (hasImage ? 78 : 0) - (1 - ctx.density) * 81;
}

const FREQUENCY_LABEL: Record<string, string> = { monthly: "Monthly", quarterly: "Quarterly", annual: "Annual", "one-off": "Single" };

function planCard(ctx: CtxWithOrigin, plan: PlanCalculation, x: number, y: number, w: number, imageUrl?: string, minHeight = 0): number {
  const page = ctx.page;
  const currency = ctx.calc.currency;
  const imgH = imageUrl && ctx.images.get(imageUrl) ? 78 : 0;
  const h = Math.max(minHeight, planCardHeight(ctx, imgH > 0));
  page.drawRectangle({ x, y: y - h, width: w, height: h, color: rgb(1, 1, 1), borderColor: ctx.line, borderWidth: 0.6 });
  let cursor = y;

  if (imgH) {
    const img = ctx.images.get(imageUrl!)!;
    drawImageCoverClipped(page, img, x, y - imgH, w, imgH);
    page.drawRectangle({ x, y: y - imgH, width: w, height: imgH, color: ctx.ink, opacity: 0.12 });
    cursor -= imgH;
  }

  const pad = 12;
  const badge = safe(plan.badge || (plan.highlight ? "POPULAR" : ""));
  if (badge) {
    ctx.page.drawRectangle({ x: x + w - pad - 58, y: cursor - 22, width: 58, height: 15, color: ctx.accent });
    text(ctx, badge.toUpperCase(), x + w - pad - 56, cursor - 9, { size: 5.8, font: ctx.bold, color: rgb(1, 1, 1), maxWidth: 54 });
  }
  text(ctx, plan.name.toUpperCase(), x + pad, cursor - 14, { size: 8.2, font: ctx.bold, color: ctx.muted, maxWidth: w - pad * 2 - 60 });
  cursor -= 30;

  const down = plan.components.find((c) => c.timing === "downPayment");
  const downPct = down?.type === "percent" ? `${down.value}%` : pctOf(plan.initialPaymentMinor, plan.contractPriceMinor);
  text(ctx, downPct, x + pad, cursor, { size: 27, font: ctx.bold, color: ctx.accent, maxWidth: w - pad * 2 });
  cursor -= 29;
  text(ctx, "DOWN PAYMENT", x + pad, cursor, { size: 6.4, font: ctx.bold, color: ctx.muted, maxWidth: w - pad * 2 });
  cursor -= 20;

  if (plan.discountAmountMinor > 0) {
    text(ctx, `${plan.discount.type === "percent" ? `${plan.discount.value}%` : money(plan.discountAmountMinor, currency)} DISCOUNT`, x + pad, cursor, { size: 8.2, font: ctx.bold, color: ctx.accent });
    cursor -= 18;
  }

  const row = (label: string, value: string) => {
    text(ctx, label, x + pad, cursor, { size: 6.8, color: ctx.muted, maxWidth: w - pad * 2 });
    text(ctx, value, x + pad, cursor - 9, { size: 7.6, font: ctx.bold, color: ctx.ink, maxWidth: w - pad * 2 });
    cursor -= 27 * ctx.density;
  };
  const freq = FREQUENCY_LABEL[plan.installmentsFrequency ?? "monthly"] ?? "Monthly";
  row(
    `${freq} installments`,
    plan.installmentCount > 0 ? `${money(plan.installmentAmountMinor, currency)}${plan.installmentsFrequency === "monthly" ? ` / mo x ${plan.installmentCount}` : ` x ${plan.installmentCount}`}` : "-",
  );
  row("During construction", `${money(plan.duringConstructionMinor, currency)}  (${pctOf(plan.duringConstructionMinor, plan.contractPriceMinor)})`);
  row("Handover", `${money(plan.handoverPaymentMinor, currency)}  (${pctOf(plan.handoverPaymentMinor, plan.contractPriceMinor)})`);

  const footH = 42;
  ctx.page.drawRectangle({ x, y: y - h, width: w, height: footH, color: ctx.ink });
  text(ctx, `FINAL PRICE (${currency})`, x + pad, y - h + footH - 8, { size: 5.8, font: ctx.bold, color: rgb(0.82, 0.87, 0.83) });
  // text() positions the baseline at (cursor - size), so reserve the full
  // cap height before the card edge to keep the figure inside the dark band.
  text(ctx, money(plan.contractPriceMinor, currency), x + pad, y - h + 26, { size: 12, font: ctx.display, color: rgb(1, 1, 1), maxWidth: w - pad * 2 });
  return h;
}

function plansPage(ctx: CtxWithOrigin) {
  const page = ctx.page;
  const accentBar = 24;
  page.drawRectangle({ x: M, y: A4.h - 58, width: 108, height: accentBar, color: ctx.accent });
  text(ctx, "FLEXIBLE PAYMENT PLANS", M + 7, A4.h - 49, { size: 5.9, font: ctx.bold, color: rgb(1, 1, 1), maxWidth: 96 });
  let y = A4.h - 82;
  const title = ctx.calc.plans.length > 1 ? "Choose the plan that fits your goals" : "Your payment plan, clearly presented";
  const lines = wrap(title, ctx.display, 22, A4.w - M * 2 - 40);
  for (const line of lines) {
    page.drawText(line, { x: M, y: y - 22, size: 22, font: ctx.display, color: ctx.ink });
    y -= 24;
  }
  y -= 4;
  text(ctx, "Multiple options. The same premium lifestyle. Every figure below is validated against the unit price.", M, y, { size: 8.2, color: ctx.muted, maxWidth: A4.w - M * 2 });
  y -= 24;

  const plans = ctx.calc.plans;
  const cols = Math.min(3, Math.max(1, plans.length));
  const gap = 10;
  const cardW = (A4.w - M * 2 - gap * (cols - 1)) / cols;
  const imgs = ctx.snapshot.design.showPlanImages === false
    ? []
    : [...new Set([...ctx.snapshot.assets.gallery, ctx.snapshot.assets.coverImage].filter((u): u is string => !!u))];
  const assigned = new Map((ctx.snapshot.assets.planImages ?? []).map((p) => [p.planKey, p.image]));
  const imageFor = (key: string, index: number) => assigned.get(key) ?? (imgs.length ? imgs[index % imgs.length] : undefined);
  // Cards in a row share the tallest height so the grid stays aligned and the
  // assurance strip never lands on top of a card.
  const rows = Math.ceil(plans.length / cols);
  for (let r = 0; r < rows; r++) {
    const start = r * cols;
    const rowPlans = plans.slice(start, start + cols);
    const images = rowPlans.map((p, c) => imageFor(p.key, start + c));
    const rowH = Math.max(...rowPlans.map((_, c) => planCardHeight(ctx, !!(images[c] && ctx.images.get(images[c]!)))));
    if (r > 0) {
      y -= rowH + 14;
      if (y - rowH < M + 40) {
        newPage(ctx);
        y = A4.h - M;
      }
    }
    rowPlans.forEach((p, c) => planCard(ctx, p, M + c * (cardW + gap), y, cardW, images[c], rowH));
    y -= rowH;
  }

  // Static assurance strip — only when there is genuine space left.
  if (y > M + 118) {
    y -= 22;
    const chips = [
      ["Secure your future", "Plans structured around your cash flow."],
      ["Prime location", [ctx.snapshot.project?.city, ctx.snapshot.project?.country].filter(Boolean).join(", ") || "Details in this offer."],
      ["Clear figures", "Every total reconciles to the unit price."],
    ];
    const chipW = (A4.w - M * 2 - 16) / 3;
    chips.forEach(([h, b], i) => {
      const x = M + i * (chipW + 8);
      page.drawRectangle({ x, y: y - 44, width: chipW, height: 44, color: ctx.accent, opacity: 0.08 });
      text(ctx, h, x + 8, y - 10, { size: 7.2, font: ctx.bold, color: ctx.ink, maxWidth: chipW - 16 });
      text(ctx, b, x + 8, y - 23, { size: 6.2, color: ctx.muted, maxWidth: chipW - 16 });
    });
    y -= 62;
  }
  ctx.y = y;
}

/* --------------------------- price breakdown ------------------------------- */

function breakdownTable(ctx: CtxWithOrigin, plans: PlanCalculation[]) {
  const rowsNeeded = 4 + (plans.some((p) => p.feesTotalMinor > 0) ? 1 : 0) + (plans.some((p) => p.vatTotalMinor > 0) ? 1 : 0) + 2;
  ensure(ctx, 30 + rowsNeeded * 21 * ctx.density + 26);
  const page = ctx.page;
  let y = ctx.y;

  page.drawRectangle({ x: M, y: y - 28, width: A4.w - M * 2, height: 28, color: ctx.accent });
  text(ctx, "PRICE BREAKDOWN", M + 8, y - 9, { size: 7.4, font: ctx.display, color: rgb(1, 1, 1) });
  text(ctx, `${plans.length} plan${plans.length > 1 ? "s" : ""}  -  ${ctx.calc.currency}`, M + 8, y - 19, { size: 5.6, color: rgb(0.9, 0.95, 0.9) });
  y -= 40;

  const labelW = 158;
  const planW = Math.max(70, (A4.w - M * 2 - labelW) / plans.length);
  const tableW = labelW + planW * plans.length;
  const rowH = 21 * ctx.density;

  const header = (v: string, x: number, w: number, align: "left" | "right") => text(ctx, v, x, y, { size: 6.5, font: ctx.bold, color: ctx.muted, maxWidth: w, align });
  header("Description", M + 6, labelW - 6, "left");
  plans.forEach((p, i) => header(fit(p.name, ctx.bold, 6.5, planW - 8), M + labelW + i * planW + 4, planW - 8, "right"));
  y -= rowH;
  page.drawLine({ start: { x: M, y }, end: { x: M + tableW, y }, thickness: 0.6, color: ctx.line });

  const row = (label: string, values: string[], opts: { bold?: boolean; accent?: boolean } = {}) => {
    if (opts.accent) page.drawRectangle({ x: M, y: y - rowH + 2, width: tableW, height: rowH - 2, color: ctx.accent, opacity: 0.07 });
    text(ctx, label, M + 6, y - 8, { size: 6.9, font: opts.bold ? ctx.bold : ctx.font, color: opts.accent ? ctx.accent : ctx.ink, maxWidth: labelW - 12 });
    values.forEach((v, i) => text(ctx, v, M + labelW + i * planW + 4, y - 8, { size: 6.9, font: opts.bold ? ctx.bold : ctx.font, color: opts.accent ? ctx.accent : ctx.ink, maxWidth: planW - 8, align: "right" }));
    y -= rowH;
  };

  row("List price", plans.map((p) => money(p.listPriceMinor, ctx.calc.currency)));
  row(
    "Discount",
    plans.map((p) => (p.discountAmountMinor > 0 ? `${p.discount.type === "percent" ? `${p.discount.value}%` : ""}  ${money(p.discountAmountMinor, ctx.calc.currency)}`.trim() : "—")),
  );
  row("Final price (contract)", plans.map((p) => money(p.contractPriceMinor, ctx.calc.currency)), { bold: true, accent: true });
  row("Initial payment", plans.map((p) => money(p.initialPaymentMinor, ctx.calc.currency)));
  row("During construction", plans.map((p) => money(p.duringConstructionMinor, ctx.calc.currency)));
  row("Handover payment", plans.map((p) => money(p.handoverPaymentMinor, ctx.calc.currency)));
  if (plans.some((p) => p.feesTotalMinor > 0)) {
    row("Fees", plans.map((p) => (p.feesTotalMinor > 0 ? money(p.feesTotalMinor, ctx.calc.currency) : "—")));
  }
  if (plans.some((p) => p.vatTotalMinor > 0)) {
    row("VAT", plans.map((p) => (p.vatTotalMinor > 0 ? money(p.vatTotalMinor, ctx.calc.currency) : "—")));
  }
  page.drawLine({ start: { x: M, y }, end: { x: M + tableW, y }, thickness: 0.6, color: ctx.line });
  row("Total payable", plans.map((p) => money(p.totalPayableMinor, ctx.calc.currency)), { bold: true, accent: true });

  if (plans.length > 1) {
    y -= 8;
    text(ctx, "Each plan is calculated independently. A plan's discount applies only to that plan; fees and VAT are shown separately and never hidden inside a monthly figure.", M, y, { size: 6.6, color: ctx.muted, maxWidth: A4.w - M * 2 });
    y -= 20;
  }
  ctx.y = y;
}

function scheduleSummary(ctx: CtxWithOrigin) {
  if (!ctx.snapshot.design.showScheduleSummary) return;
  for (const plan of ctx.calc.plans) {
    ensure(ctx, 90);
    let y = ctx.y - 10;
    text(ctx, `${plan.name.toUpperCase()} — PAYMENT TIMELINE`, M, y, { size: 7.2, font: ctx.bold, color: ctx.accent });
    y -= 14;
    const entries = plan.schedule.slice(0, 8);
    for (const s of entries) {
      const value = s.count > 1 ? `${money(s.amountMinor, ctx.calc.currency)} x ${s.count}` : money(s.totalMinor, ctx.calc.currency);
      ctx.page.drawCircle({ x: M + 3, y: y - 2.6, size: 1.4, color: ctx.accent });
      text(ctx, `${s.label}${s.dueDate ? `  (${s.dueDate})` : ""}`, M + 10, y, { size: 7.1, color: ctx.ink, maxWidth: 320 });
      text(ctx, value, A4.w - M - 160, y, { size: 7.1, font: ctx.bold, color: ctx.ink, maxWidth: 160, align: "right" });
      y -= 12;
    }
    if (plan.schedule.length > 8) text(ctx, `+ ${plan.schedule.length - 8} further scheduled payment(s)`, M + 4, y, { size: 6.6, color: ctx.muted });
    ctx.y = y - 10;
  }
}

/* ------------------------------ gallery ----------------------------------- */

function gallery(ctx: CtxWithOrigin) {
  const images = ctx.snapshot.assets.gallery.filter((u) => ctx.images.get(u)).slice(0, 6);
  if (!ctx.snapshot.design.showGallery || images.length === 0) return;
  const gap = 10;
  const w = (A4.w - M * 2 - gap) / 2;
  const h = 158;
  // Flow onto the current page when there is room; the gallery does not have to
  // own a page of its own.
  ensure(ctx, 90 + h);
  let y = ctx.y - 16;
  text(ctx, "PROJECT GALLERY", M, y, { size: 8, font: ctx.bold, color: ctx.accent });
  text(ctx, safe(ctx.snapshot.project?.name || "Selected project imagery"), M, y - 18, { size: 18, font: ctx.display, color: ctx.ink, maxWidth: A4.w - M * 2 });
  y -= 66;
  for (let i = 0; i < images.length; i++) {
    const col = i % 2;
    if (col === 0 && i > 0) y -= h + 12;
    if (y - h < M + 30) {
      newPage(ctx);
      y = A4.h - M - 8;
    }
    const img = ctx.images.get(images[i])!;
    drawImageCoverClipped(ctx.page, img, M + col * (w + gap), y - h, w, h);
    ctx.page.drawRectangle({ x: M + col * (w + gap), y: y - h, width: w, height: h, borderColor: ctx.line, borderWidth: 0.4 });
  }
  ctx.y = y - h - 10;
}

function floorPlans(ctx: CtxWithOrigin) {
  const plans = ctx.snapshot.assets.floorPlans.filter((p) => p.image && ctx.images.get(p.image)).slice(0, 6);
  if (!ctx.snapshot.design.showFloorPlans || plans.length === 0) return;
  ensure(ctx, 300);
  text(ctx, "FLOOR PLANS", M, ctx.y, { size: 8, font: ctx.bold, color: ctx.accent });
  text(ctx, "Selected layouts", M, ctx.y - 18, { size: 18, font: ctx.display, color: ctx.ink });
  let y = ctx.y - 60;
  for (const plan of plans) {
    const h = 300;
    if (y - h < M + 30) {
      newPage(ctx);
      y = A4.h - M;
    }
    ctx.page.drawRectangle({ x: M, y: y - h, width: A4.w - M * 2, height: h, borderColor: ctx.line, borderWidth: 0.5, color: rgb(1, 1, 1) });
    drawImageContain(ctx.page, ctx.images.get(plan.image)!, M + 10, y - h + 30, A4.w - M * 2 - 20, h - 42);
    text(ctx, plan.name, M + 10, y - 18, { size: 9, font: ctx.bold, color: ctx.ink, maxWidth: A4.w - M * 2 - 20 });
    y -= h + 14;
  }
  ctx.y = y;
}

/* ------------------------------- closing ---------------------------------- */

function closing(ctx: CtxWithOrigin) {
  ensure(ctx, 190);
  const page = ctx.page;
  let y = ctx.y - 16;
  if (ctx.snapshot.design.showContact) {
    const boxH = 108;
    page.drawRectangle({ x: M, y: y - boxH, width: A4.w - M * 2, height: boxH, color: ctx.ink });
    page.drawRectangle({ x: M, y: y - boxH, width: 5, height: boxH, color: ctx.accent });
    text(ctx, "GET IN TOUCH", M + 18, y - 20, { size: 7, font: ctx.bold, color: rgb(0.75, 0.83, 0.77) });
    text(ctx, "We're here to help you make the right decision.", M + 18, y - 34, { size: 13, font: ctx.display, color: rgb(1, 1, 1), maxWidth: A4.w - M * 2 - 36 });
    const phone = ctx.snapshot.design.contactPhone || "";
    const email = ctx.snapshot.design.contactEmail || "";
    const site = ctx.snapshot.design.contactSite || "";
    const values = [phone, email, site].filter(Boolean).join("   ·   ");
    text(ctx, values || "Contact your MR.HOME advisor", M + 18, y - 62, { size: 8, color: rgb(0.88, 0.92, 0.89), maxWidth: A4.w - M * 2 - 36 });
    if (ctx.snapshot.design.preparedBy) text(ctx, `Prepared by ${ctx.snapshot.design.preparedBy}`, M + 18, y - 82, { size: 7, color: rgb(0.7, 0.78, 0.72), maxWidth: A4.w - M * 2 - 36 });
    y -= boxH + 14;
  }

  if (ctx.snapshot.design.showDisclaimer && ctx.snapshot.design.disclaimer) {
    // Anchored to the bottom of this (last) page — never a separate T&C page.
    const note = ctx.snapshot.design.disclaimer;
    const lines = wrap(note, ctx.font, 6.4, A4.w - M * 2);
    const blockH = lines.length * 8.4 + 22;
    const bottomY = Math.min(y, M + 34 + blockH);
    page.drawLine({ start: { x: M, y: bottomY }, end: { x: A4.w - M, y: bottomY }, thickness: 0.4, color: ctx.line });
    text(ctx, "IMPORTANT", M, bottomY - 10, { size: 6, font: ctx.bold, color: ctx.muted });
    let ty = bottomY - 18;
    for (const line of lines) {
      page.drawText(line, { x: M, y: ty - 6.4, size: 6.4, font: ctx.font, color: ctx.muted });
      ty -= 8.4;
    }
    y = ty;
  }
  if (ctx.snapshot.design.footerNote) {
    text(ctx, ctx.snapshot.design.footerNote, M, Math.max(M + 26, y), { size: 7, font: ctx.italic, color: ctx.muted, maxWidth: A4.w - M * 2 });
  }
  ctx.y = M + 22;
}

function pageFooters(ctx: CtxWithOrigin) {
  const total = ctx.pages.length;
  const mark = safe(ctx.snapshot.design.watermark || "");
  const current = ctx.page;
  for (let i = 1; i < total; i++) {
    const page = ctx.pages[i];
    // text() always paints on ctx.page, so switch it per page instead of
    // leaving every footer on the final page.
    ctx.page = page;
    page.drawLine({ start: { x: M, y: 34 }, end: { x: A4.w - M, y: 34 }, thickness: 0.4, color: ctx.line });
    text(ctx, `${safe(ctx.snapshot.project?.name || "MR.HOME")}  -  ${safe(ctx.snapshot.reference)}`, M, 30, { size: 6.2, color: ctx.muted, maxWidth: 340 });
    if (ctx.snapshot.design.pageNumbers !== false) {
      text(ctx, `Page ${i + 1} of ${total}`, A4.w - M - 80, 30, { size: 6.2, color: ctx.muted, maxWidth: 80, align: "right" });
    }
    if (mark) {
      page.drawText(mark.toUpperCase(), {
        x: A4.w - 12,
        y: 90,
        size: 5.6,
        font: ctx.font,
        color: ctx.muted,
        opacity: 0.45,
        rotate: degrees(90),
      });
    }
  }
  ctx.page = current;
}

/* -------------------------------- public API ------------------------------ */

export type RenderOptions = {
  /** Absolute origin used to resolve relative /images or /api/media asset URLs. */
  origin: string;
  /** Render only these plans (used to produce one PDF per plan). */
  planKeys?: string[];
};

export async function renderOfferPdf(snapshot: OfferSnapshotInput, calc: OfferCalculation, options: RenderOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${safe(snapshot.title || snapshot.project?.name || "Sales offer")} — ${snapshot.reference}`);
  pdf.setAuthor("MR.HOME Real Estate");
  pdf.setSubject("Sales offer & payment plans");
  pdf.setCreator("MR.HOME AI Sales Offer Generator");

  const design = snapshot.design;
  const serifDisplay = design.displayFont === "serif";
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const display = await pdf.embedFont(serifDisplay ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold);
  const page = pdf.addPage([A4.w, A4.h]);
  page.drawRectangle({ x: 0, y: 0, width: A4.w, height: A4.h, color: hexToRgb(design.paper, "#ffffff") });

  const ctx: CtxWithOrigin = {
    pdf,
    page,
    pages: [page],
    y: A4.h - M,
    font,
    bold,
    italic,
    display,
    density: design.density === "compact" ? 0.82 : 1,
    images: new Map(),
    snapshot,
    calc,
    accent: hexToRgb(design.accent, "#1f8f3a"),
    ink: hexToRgb(design.ink, "#0b1b12"),
    paper: hexToRgb(design.paper, "#ffffff"),
    muted: rgb(0.36, 0.4, 0.37),
    line: rgb(0.87, 0.89, 0.87),
    origin: options.origin,
  };

  const selected = options.planKeys?.length ? calc.plans.filter((p) => options.planKeys!.includes(p.key)) : calc.plans;
  if (selected.length === 0) throw new Error("No plans selected for rendering");
  const renderCalc: OfferCalculation = { ...calc, plans: selected };

  await loadImages(ctx, [
    snapshot.assets.coverImage,
    ...snapshot.assets.gallery,
    ...snapshot.assets.floorPlans.map((f) => f.image),
    ...(snapshot.assets.planImages ?? []).map((p) => p.image),
    snapshot.assets.projectLogo,
    snapshot.assets.mrHomeLogo,
  ]);

  cover(ctx);
  newPage(ctx);
  plansPage(ctx);
  if (design.showPriceBreakdown) {
    const chunkSize = selected.length > 4 ? 3 : 4;
    for (let i = 0; i < selected.length; i += chunkSize) {
      if (i > 0) newPage(ctx);
      breakdownTable(ctx, selected.slice(i, i + chunkSize));
    }
    scheduleSummary(ctx);
  }
  gallery(ctx);
  floorPlans(ctx);
  closing(ctx);
  pageFooters(ctx);

  const bytes = await pdf.save({ useObjectStreams: false });
  return new Uint8Array(bytes);
}

/** One PDF per plan (separate-plan output). */
export async function renderOfferPackage(snapshot: OfferSnapshotInput, calc: OfferCalculation, options: RenderOptions): Promise<{ key: string; name: string; bytes: Uint8Array }[]> {
  return Promise.all(
    calc.plans.map(async (plan) => ({
      key: plan.key,
      name: plan.name,
      bytes: await renderOfferPdf(snapshot, { ...calc, plans: [plan] }, { ...options, planKeys: [plan.key] }),
    })),
  );
}

/** Every figure drawn into the PDF that must be found again by text extraction. */
export function expectedPdfFigures(snapshot: OfferSnapshotInput, calc: OfferCalculation): string[] {
  const figures: string[] = [snapshot.reference, snapshot.project?.name ?? "", snapshot.unit?.unitNo ?? ""];
  for (const plan of calc.plans) {
    figures.push(
      plan.name,
      formatMinor(plan.contractPriceMinor, calc.currency),
      formatMinor(plan.initialPaymentMinor, calc.currency),
      formatMinor(plan.handoverPaymentMinor, calc.currency),
      formatMinor(plan.totalPayableMinor, calc.currency),
    );
  }
  return [...new Set(figures.map((f) => f.trim()).filter(Boolean))];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Verify the rendered PDF really contains the calculated figures. Uses real
 * PDF text extraction (PDF.js via unpdf), not a byte-length guess.
 */
export async function validateRenderedPdf(bytes: Uint8Array, expected: string[]): Promise<{ ok: boolean; pages: number; missing: string[] }> {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPageCount();
  if (pages < 1) return { ok: false, pages, missing: ["no pages"] };
  if (bytes.byteLength < 2000) return { ok: false, pages, missing: ["file too small"] };
  let extracted = "";
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const proxy = await getDocumentProxy(new Uint8Array(bytes));
    const result = await extractText(proxy, { mergePages: true });
    extracted = Array.isArray(result.text) ? result.text.join(" ") : result.text;
  } catch {
    return { ok: false, pages, missing: ["text extraction failed"] };
  }
  const haystack = normalize(extracted);
  const missing = expected.filter((fig) => !haystack.includes(normalize(fig)));
  return { ok: missing.length === 0, pages, missing };
}
