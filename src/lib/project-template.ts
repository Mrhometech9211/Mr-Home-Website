import type { Project } from "@/db/schema";
import type { BuilderItem, BuilderSection } from "@/lib/page-builder";

/**
 * Default sections for a project page.
 *
 * Mirrors what the legacy detail layout shows (intro, gallery, amenities,
 * specifications, floor plans, location, brochure, related projects, inquiry)
 * so an administrator can start from a familiar page and then reorder, delete
 * or restyle it. Nothing is invented: every value comes from the project row.
 */

function sid(prefix: string, i: number): string {
  return `${prefix}-${i}-${Math.random().toString(36).slice(2, 7)}`;
}

export function projectSeedSections(project: Project): BuilderSection[] {
  const out: BuilderSection[] = [];

  out.push({
    id: sid("intro", out.length),
    type: "text",
    title: `About ${project.name}`,
    eyebrow: project.developer ? `By ${project.developer}` : null,
    body: project.description || project.shortDescription || "",
    image: project.coverImage ?? null,
    imageLayout: "right",
    visible: { desktop: true, tablet: true, mobile: true },
  });

  const gallery = [project.coverImage, ...(project.gallery ?? [])].filter((g): g is string => Boolean(g));
  if (gallery.length > 1) {
    out.push({
      id: sid("gallery", out.length),
      type: "gallery",
      title: "Gallery",
      items: gallery.map((image) => ({ image })),
      visible: { desktop: true, tablet: true, mobile: true },
    });
  }

  if ((project.amenities ?? []).length) {
    out.push({
      id: sid("amenities", out.length),
      type: "amenities",
      title: "Amenities",
      items: project.amenities!.map((title) => ({ title })),
      style: { columns: 3 },
      visible: { desktop: true, tablet: true, mobile: true },
    });
  }

  if ((project.specifications ?? []).length) {
    out.push({
      id: sid("specs", out.length),
      type: "specs",
      title: "Specifications",
      items: project.specifications!.map((s) => ({ label: s.label, value: s.value })),
      visible: { desktop: true, tablet: true, mobile: true },
    });
  }

  if ((project.floorPlans ?? []).length) {
    out.push({
      id: sid("plans", out.length),
      type: "floorPlans",
      title: "Floor plans",
      items: project.floorPlans!.map((f) => ({ title: f.name, value: f.area ?? "", image: f.image ?? "" })),
      visible: { desktop: true, tablet: true, mobile: true },
    });
  }

  if (project.address || project.city || (project.latitude && project.longitude)) {
    const items: BuilderItem[] = [];
    if (project.developer) items.push({ title: "Developer", description: project.developer });
    if (project.handover) items.push({ title: "Handover", description: project.handover });
    out.push({
      id: sid("location", out.length),
      type: "location",
      title: "Location",
      body: [project.address, project.city, project.country].filter(Boolean).join(", "),
      mapQuery: project.latitude && project.longitude ? `${project.latitude},${project.longitude}` : [project.address, project.city, project.country].filter(Boolean).join(", "),
      items,
      visible: { desktop: true, tablet: true, mobile: true },
    });
  }

  out.push({
    id: sid("brochure", out.length),
    type: "brochure",
    eyebrow: "Brochure",
    title: "Download the full brochure",
    body: "Floor plans, payment plans and the complete specification in one document.",
    visible: { desktop: true, tablet: true, mobile: true },
  });

  out.push({
    id: sid("related", out.length),
    type: "related",
    title: "Other projects you may like",
    visible: { desktop: true, tablet: true, mobile: true },
  });

  out.push({
    id: sid("form", out.length),
    type: "form",
    eyebrow: "Enquire",
    title: `Request details about ${project.name}`,
    body: "Our team replies within one business day.",
    visible: { desktop: true, tablet: true, mobile: true },
  });

  return out;
}
