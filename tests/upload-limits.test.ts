import test from "node:test";
import assert from "node:assert/strict";
import { BROCHURE_MAX_BYTES, BROCHURE_MAX_LABEL } from "../src/lib/upload-limits";
import { ALLOWED } from "../src/lib/media-validation";

/**
 * Regression guard for the brochure ceiling: the admin browser check, the
 * server init validation and PDF media validation must all use 200 MiB
 * (209,715,200 bytes) from the shared module.
 */
test("brochure ceiling is 200 MiB and PDF validation shares it", () => {
  assert.equal(BROCHURE_MAX_BYTES, 209_715_200);
  assert.equal(BROCHURE_MAX_LABEL, "200 MB");
  assert.equal(ALLOWED["application/pdf"].max, BROCHURE_MAX_BYTES);
});
