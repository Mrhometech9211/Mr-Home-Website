import test from "node:test";
import assert from "node:assert/strict";
import { settingsPatchSchema } from "../src/lib/settings-payload";
import { DEFAULT_SETTINGS, LYP_FIELDS, mergeSettings } from "../src/lib/settings-types";

/**
 * Regression tests for the Admin → Settings save failure:
 *   Validation failed: listYourProperty.contactFields.0: Invalid option:
 *   expected one of "email"|"phone"|...
 *
 * Root cause: the save schema listed the List Your Property fields by hand and
 * omitted "name", while DEFAULT_SETTINGS / the stored row always contain it.
 * Because the admin form sends the whole settings object, every save — even a
 * Notifications-only change — was rejected.
 */

test("default settings pass the save schema (the exact failing payload shape)", () => {
  const parsed = settingsPatchSchema.safeParse(DEFAULT_SETTINGS);
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  assert.deepEqual(parsed.success && parsed.data.listYourProperty?.contactFields, [...LYP_FIELDS]);
});

test("a toggled field list (bedrooms off) is accepted", () => {
  const fields = LYP_FIELDS.filter((f) => f !== "bedrooms");
  const parsed = settingsPatchSchema.safeParse({
    listYourProperty: { ...DEFAULT_SETTINGS.listYourProperty, contactFields: fields },
  });
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues));
});

test("a Notifications-only save is not blocked by List Your Property fields", () => {
  const parsed = settingsPatchSchema.safeParse({ notifications: DEFAULT_SETTINGS.notifications });
  assert.equal(parsed.success, true);
});

test("unknown List Your Property field ids are still rejected", () => {
  const parsed = settingsPatchSchema.safeParse({
    listYourProperty: { ...DEFAULT_SETTINGS.listYourProperty, contactFields: ["name", "listingType"] },
  });
  assert.equal(parsed.success, false);
});

test("mergeSettings keeps stored toggles, drops unknown ids, and always keeps name", () => {
  const merged = mergeSettings({
    listYourProperty: {
      ...DEFAULT_SETTINGS.listYourProperty,
      contactFields: ["email", "listingType", "phone", "phone"],
    },
  });
  assert.deepEqual(merged.listYourProperty.contactFields, ["name", "email", "phone"]);
});

test("mergeSettings fills all fields when the stored row predates the toggles", () => {
  const merged = mergeSettings({ listYourProperty: { ...DEFAULT_SETTINGS.listYourProperty, contactFields: undefined as never } });
  assert.deepEqual(merged.listYourProperty.contactFields, [...LYP_FIELDS]);
});
