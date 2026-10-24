/**
 * Provident-style amenity filter groups.
 *
 * The public filter shows the same amenity checklist Provident Estate offers;
 * server-side each group matches any listing amenity label containing one of the
 * group's keys (case-insensitive), so real-world labels like "Infinity Pool",
 * "Private Gym" or "24/7 Security" still land in the right bucket.
 */
export type AmenityFilterGroup = { label: string; keys: string[] };

export const AMENITY_FILTERS: AmenityFilterGroup[] = [
  { label: "Fitness facilities", keys: ["gym", "fitness", "yoga", "wellness club"] },
  { label: "Outdoor spaces", keys: ["garden", "terrace", "balcony", "park", "landscaped", "podium"] },
  { label: "Children's play area", keys: ["kids", "children", "play area", "playground"] },
  { label: "Retail & dining", keys: ["retail", "restaurant", "mall", "dining", "cafe", "souk"] },
  { label: "Pets Friendly", keys: ["pet"] },
  { label: "Luxury living", keys: ["luxury", "branded", "penthouse", "sky villa", "chef", "butler"] },
  { label: "Near Metro", keys: ["metro", "tram", "train", "public transport"] },
  { label: "Swimming pools", keys: ["pool", "lagoon", "infinity pool", "beach club"] },
  { label: "Security and privacy", keys: ["security", "24/7", "concierge security", "gated", "privacy", "cctv"] },
  { label: "Concierge Services", keys: ["concierge", "hotel service", "housekeeping", "butler"] },
  { label: "Parking facilities", keys: ["parking", "garage", "parking bays", "valet"] },
  { label: "Spa and wellness facilities", keys: ["spa", "sauna", "steam", "jacuzzi", "hammam"] },
  { label: "Beachfront properties", keys: ["beach", "sea view", "waterfront", "marina"] },
  { label: "Near golf course", keys: ["golf"] },
];

/** Fast lookup: group label -> keys (used server-side when filtering). */
export const AMENITY_GROUPS: Record<string, string[]> = Object.fromEntries(AMENITY_FILTERS.map((g) => [g.label, g.keys]));
