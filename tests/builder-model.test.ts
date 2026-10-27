import test from "node:test";
import assert from "node:assert/strict";
import {
  isSafeLink,
  isSafeMediaUrl,
  mapEmbedUrl,
  pageCreateSchema,
  safeSections,
  sectionColumns,
  sectionIsVisible,
  toEmbedUrl,
  validateForPublish,
  visibilityClass,
  type BuilderSection,
} from "../src/lib/page-builder";
import {
  alignClass,
  columnsClass,
  containerClass,
  defaultSpacing,
  hasTextTint,
  overlayStyle,
  radiusClass,
  shellStyle,
  spacingClass,
} from "../src/lib/builder-style";

/**
 * Regression tests for the visual builder model (Phase 10/11).
 *
 * These pin the rules the editor, the draft preview (/preview/pages/[id]) and
 * the public renderer all rely on: a section that is hidden here must be hidden
 * there, Tailwind must receive literal classes for each visibility combination,
 * and malformed stored JSON must degrade to "render nothing" instead of
 * throwing inside a page render.
 */

const section = (over: Partial<BuilderSection> = {}): BuilderSection => ({
  id: "s1",
  type: "text",
  title: "Hello",
  ...over,
});

test("stored sections keep parsing, unknown or malformed input renders nothing", () => {
  assert.equal(safeSections([{ id: "a", type: "hero", title: "Live" }]).length, 1);
  assert.deepEqual(safeSections("not an array"), []);
  assert.deepEqual(safeSections([{ id: "", type: "text" }]), [], "empty ids are rejected");
  assert.deepEqual(safeSections([{ id: "a", type: "nope" }]), [], "unknown section types are rejected");
  assert.deepEqual(safeSections([{ id: "a", type: "text", style: { overlay: 500 } }]), [], "out-of-range style values are rejected");
});

test("unsafe links and media URLs are rejected by the schema", () => {
  assert.equal(isSafeMediaUrl("/images/a.jpg"), true);
  assert.equal(isSafeMediaUrl("https://cdn.example.com/a.jpg"), true);
  assert.equal(isSafeMediaUrl("javascript:alert(1)"), false);
  assert.equal(isSafeMediaUrl("//evil.example/a.jpg"), false);
  assert.equal(isSafeLink("tel:+923001234567"), true);
  assert.equal(isSafeLink("mailto:sales@example.com"), true);
  assert.equal(isSafeLink("#inquire"), true);
  assert.equal(isSafeLink("data:text/html,<script>"), false);

  const unsafe = [{ id: "a", type: "cta", ctaHref: "javascript:alert(1)" }];
  assert.deepEqual(safeSections(unsafe), []);
});

test("per-device visibility: hidden flag beats everything, missing devices are visible", () => {
  assert.equal(sectionIsVisible(section()), true);
  assert.equal(sectionIsVisible(section({ hidden: true })), false);
  assert.equal(sectionIsVisible(section({ visible: { desktop: true } })), true, "unset devices stay visible");
  assert.equal(sectionIsVisible(section({ visible: { desktop: false, tablet: false, mobile: false } })), false);
  assert.equal(sectionIsVisible(section({ visible: { desktop: false, tablet: false, mobile: true } })), true);
  assert.equal(sectionIsVisible(section({ hidden: true, visible: { mobile: true } })), false);
});

test("visibility classes cover every device combination with literal Tailwind classes", () => {
  assert.equal(visibilityClass(section()), "");
  assert.equal(visibilityClass(section({ visible: { mobile: false } })), "hidden md:block");
  assert.equal(visibilityClass(section({ visible: { tablet: false } })), "md:hidden lg:block");
  assert.equal(visibilityClass(section({ visible: { desktop: false } })), "lg:hidden");
  assert.equal(visibilityClass(section({ visible: { mobile: false, tablet: false } })), "hidden lg:block");
  assert.equal(visibilityClass(section({ visible: { tablet: false, desktop: false } })), "md:hidden");
  assert.equal(visibilityClass(section({ visible: { mobile: false, desktop: false } })), "hidden md:block lg:hidden");
  assert.equal(visibilityClass(section({ visible: { mobile: false, tablet: false, desktop: false } })), "hidden");
});

test("column counts: explicit style wins, otherwise a per-type default", () => {
  assert.equal(sectionColumns(section({ type: "stats" })), 4);
  assert.equal(sectionColumns(section({ type: "specs" })), 1);
  assert.equal(sectionColumns(section({ type: "gallery" })), 3);
  assert.equal(sectionColumns(section({ type: "stats", style: { columns: 2 } })), 2);
  assert.equal(columnsClass(1), "grid-cols-1");
  assert.equal(columnsClass(2), "grid-cols-1 sm:grid-cols-2");
  assert.equal(columnsClass(3), "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3");
  assert.equal(columnsClass(4), "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4");
});

test("publishing refuses empty, all-hidden and headline-less drafts", () => {
  assert.throws(() => validateForPublish([]), /at least one visible section/i);
  assert.throws(() => validateForPublish([section({ hidden: true })]), /at least one visible section/i);
  assert.throws(() => validateForPublish([section({ type: "form", title: null, eyebrow: null })]), /title or eyebrow/i);
  assert.doesNotThrow(() => validateForPublish([section()]));
  assert.doesNotThrow(() => validateForPublish([section({ hidden: true }), section({ id: "s2", eyebrow: "Dubai" })]));
});

test("style helpers map to the same markup in editor and public renderer", () => {
  assert.equal(spacingClass(section({ type: "hero" })), "py-20 lg:py-32", "hero keeps its legacy spacing");
  assert.equal(spacingClass(section({ type: "text" })), "py-12 sm:py-14 lg:py-16");
  assert.equal(spacingClass(section({ type: "banner" })), "py-0");
  assert.equal(spacingClass(section({ style: { padY: "sm" } })), "py-6 sm:py-8", "an override wins over the default");
  assert.equal(defaultSpacing("cta"), "lg");

  assert.equal(containerClass(section()), "mx-auto w-full max-w-[1400px] px-4 sm:px-6");
  assert.equal(containerClass(section({ style: { width: "wide" } })), "mx-auto w-full max-w-[1600px] px-4 sm:px-6");
  assert.equal(containerClass(section({ style: { width: "full" } })), "w-full px-4 sm:px-6");

  assert.equal(alignClass(section()), "text-left");
  assert.equal(alignClass(section({ style: { align: "center" } })), "text-center");
  assert.equal(alignClass(section({ style: { align: "right" } })), "text-right");

  assert.equal(radiusClass(section()), "");
  assert.equal(radiusClass(section({ style: { radius: "none" } })), "rounded-none");
  assert.equal(radiusClass(section({ style: { radius: "md" } })), "rounded-xl");
  assert.equal(radiusClass(section({ style: { radius: "xl" } })), "rounded-3xl");
});

test("shell and overlay styles clamp values and stay empty by default", () => {
  assert.deepEqual(shellStyle(section()), {});
  assert.deepEqual(shellStyle(section({ style: { background: "#0b3d2e", textColor: "#ffffff", minHeight: 320 } })), {
    backgroundColor: "#0b3d2e",
    color: "#ffffff",
    minHeight: "320px",
  });

  assert.match(String(overlayStyle(section()).background), /rgba\(8,12,10,0\.45\)/);
  assert.match(String(overlayStyle(section({ style: { overlay: 120 } })).background), /rgba\(8,12,10,0\.9\)/, "overlay is capped at 90%");
  assert.match(String(overlayStyle(section({ style: { overlay: -20 } })).background), /rgba\(8,12,10,0\)/, "negative overlay is floored at 0%");
  assert.equal(hasTextTint(section()), false);
  assert.equal(hasTextTint(section({ style: { textColor: "#ffffff" } })), true);
});

test("creating a page accepts the blank slug the form sends", () => {
  // Regression: the "New page" dialog posts slug: "" and expects the API to
  // derive it from the title. A regex that required a first character rejected
  // every new page with 400 "Invalid slug".
  const parsed = pageCreateSchema.safeParse({ title: "Investor Guide", slug: "", navOrder: "", navVisible: true, noIndex: false });
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  assert.equal(parsed.success && parsed.data.slug, "");
  assert.equal(parsed.success && parsed.data.navOrder, 0, "an empty nav order coerces to 0");
});

test("creating a page still rejects an unsafe slug and an empty title", () => {
  assert.equal(pageCreateSchema.safeParse({ title: "X", slug: "<script>" }).success, false);
  assert.equal(pageCreateSchema.safeParse({ title: "X", slug: "valid-slug" }).success, true);
  assert.equal(pageCreateSchema.safeParse({ title: "   " }).success, false);
});

test("video embeds only accept known hosts over https", () => {
  assert.equal(toEmbedUrl("https://www.youtube.com/watch?v=abc123"), "https://www.youtube-nocookie.com/embed/abc123");
  assert.equal(toEmbedUrl("https://youtu.be/abc123"), "https://www.youtube-nocookie.com/embed/abc123");
  assert.equal(toEmbedUrl("https://vimeo.com/76979871"), "https://player.vimeo.com/video/76979871");
  assert.equal(toEmbedUrl("http://www.youtube.com/watch?v=abc123"), null, "plain http is refused");
  assert.equal(toEmbedUrl("https://evil.example/embed/x"), null);
  assert.equal(toEmbedUrl(""), null);
});

test("map embeds encode the query and keep the fixed Google host", () => {
  assert.equal(mapEmbedUrl("JVC, Dubai"), "https://www.google.com/maps?q=JVC%2C%20Dubai&output=embed");
  assert.equal(mapEmbedUrl("   "), null);
  assert.equal(mapEmbedUrl("</iframe><script>"), "https://www.google.com/maps?q=%3C%2Fiframe%3E%3Cscript%3E&output=embed");
});
