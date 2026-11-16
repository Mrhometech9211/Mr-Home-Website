-- Buy page copy becomes editable through the existing page_sections model.
-- Idempotent: an existing Buy hero row is never overwritten.
INSERT INTO "page_sections" ("page", "key", "eyebrow", "title", "body", "items", "order", "enabled")
SELECT 'buy', 'hero', 'Buy', 'Properties for Sale', 'Curated apartments, villas and townhouses across our global markets.', '[]'::jsonb, 0, true
WHERE NOT EXISTS (SELECT 1 FROM "page_sections" WHERE "page" = 'buy' AND "key" = 'hero');
