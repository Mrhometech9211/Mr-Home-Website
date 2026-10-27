import type { CSSProperties } from "react";
import { type BuilderSection, type SectionSpacing } from "./page-builder";

/**
 * Shared visual rules for builder sections. Used by the public renderer and by
 * the editor's canvas so a change in the settings panel maps to exactly the
 * markup the site will produce.
 */

const SPACING_CLASS: Record<SectionSpacing, string> = {
  none: "py-0",
  sm: "py-6 sm:py-8",
  md: "py-12 sm:py-14 lg:py-16",
  lg: "py-16 lg:py-24",
  xl: "py-20 lg:py-32",
};

/** Legacy spacing, per type, used when the editor has not set an override. */
export function defaultSpacing(type: BuilderSection["type"]): SectionSpacing {
  switch (type) {
    case "hero":
      return "xl";
    case "banner":
    case "divider":
    case "whatsapp":
      return "none";
    case "form":
    case "cta":
      return "lg";
    case "gallery":
    case "columns":
    case "pricing":
    case "related":
      return "md";
    default:
      return "md";
  }
}

export function spacingClass(section: BuilderSection): string {
  return SPACING_CLASS[section.style?.padY ?? defaultSpacing(section.type)];
}

/** Static class strings — Tailwind only emits classes it can see literally. */
const CONTAINER_CLASS = {
  narrow: "mx-auto w-full max-w-[900px] px-4 sm:px-6",
  default: "mx-auto w-full max-w-[1400px] px-4 sm:px-6",
  wide: "mx-auto w-full max-w-[1600px] px-4 sm:px-6",
  full: "w-full px-4 sm:px-6",
} as const;

export function containerClass(section: BuilderSection): string {
  return CONTAINER_CLASS[section.style?.width ?? "default"];
}

export function alignClass(section: BuilderSection): string {
  const align = section.style?.align ?? "left";
  return align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
}

export function radiusClass(section: BuilderSection): string {
  switch (section.style?.radius) {
    case "none":
      return "rounded-none";
    case "md":
      return "rounded-xl";
    case "xl":
      return "rounded-3xl";
    default:
      return "";
  }
}

/** Inline style for the section root: background colour, text tint, min height. */
export function shellStyle(section: BuilderSection): CSSProperties {
  const s = section.style;
  const style: CSSProperties = {};
  if (s?.background) style.backgroundColor = s.background;
  if (s?.textColor) style.color = s.textColor;
  if (s?.minHeight) style.minHeight = `${s.minHeight}px`;
  return style;
}

/** Gradient scrim over a section background photo. */
export function overlayStyle(section: BuilderSection): CSSProperties {
  const strength = section.style?.overlay ?? 45;
  const alpha = Math.min(90, Math.max(0, strength)) / 100;
  return { background: `linear-gradient(180deg, rgba(8,12,10,${alpha}), rgba(8,12,10,${Math.min(0.95, alpha + 0.18)}))` };
}

/** Grid class for an item-based section at a given column count. */
export function columnsClass(columns: number): string {
  switch (columns) {
    case 1:
      return "grid-cols-1";
    case 2:
      return "grid-cols-1 sm:grid-cols-2";
    case 4:
      return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
    default:
      return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  }
}

/**
 * True when a text tint is configured. The renderer then adds `pb-tint` so the
 * heading/paragraph colour utilities inside built-in components inherit it.
 */
export function hasTextTint(section: BuilderSection): boolean {
  return Boolean(section.style?.textColor);
}
