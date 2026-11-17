-- Manual admin confirmation that a project is in stock. Defaults to false so
-- every existing project keeps claiming no availability until an editor ticks it.
ALTER TABLE "projects" ADD COLUMN "in_stock_confirmed" boolean DEFAULT false NOT NULL;
