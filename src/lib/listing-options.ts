/** Phase 3 — List Your Property form options (shared by the API route and the public page). */
export const LISTING_LANGUAGES = ["English", "Arabic", "Urdu", "French", "Spanish", "Turkish", "Russian", "Chinese (Mandarin)"];

export const LISTING_PROPERTY_TYPES = ["Apartment", "Villa", "Townhouse", "Penthouse", "Duplex", "Studio", "Land / Plot", "Commercial"];

export const LISTING_PURPOSES = [
  { value: "sell", label: "Sell" },
  { value: "rent", label: "Rent" },
  { value: "both", label: "Sell or Rent" },
] as const;
