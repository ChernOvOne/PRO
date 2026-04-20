-- Support Wizards: configurable branching ticket creation flows
CREATE TABLE "support_wizards" (
    "id"             TEXT NOT NULL,
    "category"       "TicketCategory" NOT NULL,
    "title"          TEXT NOT NULL,
    "icon"           TEXT,
    "description"    TEXT,
    "enabled"        BOOLEAN NOT NULL DEFAULT true,
    "entry_node_id"  TEXT,
    "sort_order"     INTEGER NOT NULL DEFAULT 0,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_wizards_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_wizards_category_idx" ON "support_wizards"("category");

CREATE TABLE "support_wizard_nodes" (
    "id"               TEXT NOT NULL,
    "wizard_id"        TEXT NOT NULL,
    "node_type"        TEXT NOT NULL,
    "question"         TEXT,
    "hint"             TEXT,
    "placeholder"      TEXT,
    "optional"         BOOLEAN NOT NULL DEFAULT false,
    "options"          JSONB,
    "next_node_id"     TEXT,
    "pos_x"            DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pos_y"            DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subject_template" TEXT,
    "body_template"    TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_wizard_nodes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_wizard_nodes_wizard_id_idx" ON "support_wizard_nodes"("wizard_id");

ALTER TABLE "support_wizard_nodes" ADD CONSTRAINT "support_wizard_nodes_wizard_id_fkey"
    FOREIGN KEY ("wizard_id") REFERENCES "support_wizards"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
