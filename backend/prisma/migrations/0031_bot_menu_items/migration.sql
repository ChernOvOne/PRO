-- Admin-editable replacement for the hardcoded mainMenuKeyboard().
-- Empty table → bot falls back to built-in defaults in code.
CREATE TABLE IF NOT EXISTS "bot_menu_items" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "label"       TEXT NOT NULL,
  "link_type"   TEXT NOT NULL DEFAULT 'callback',
  "payload"     TEXT NOT NULL,
  "row"         INTEGER NOT NULL DEFAULT 0,
  "col"         INTEGER NOT NULL DEFAULT 0,
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "is_active"   BOOLEAN NOT NULL DEFAULT TRUE,
  "staff_only"  BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "bot_menu_items_is_active_sort_order_idx"
  ON "bot_menu_items" ("is_active", "sort_order");
