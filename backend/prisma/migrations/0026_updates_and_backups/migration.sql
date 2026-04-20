-- Backups: full platform snapshots
CREATE TABLE "backups" (
    "id"              TEXT NOT NULL,
    "filename"        TEXT NOT NULL,
    "size_bytes"      BIGINT NOT NULL,
    "git_sha"         TEXT,
    "git_tag"         TEXT,
    "uploaded_to_tg"  BOOLEAN NOT NULL DEFAULT false,
    "tg_file_id"      TEXT,
    "tg_message_url"  TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by"      TEXT,
    "reason"          TEXT,

    CONSTRAINT "backups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "backups_filename_key" ON "backups"("filename");
CREATE INDEX "backups_created_at_idx" ON "backups"("created_at" DESC);

-- Update events: history of platform updates
CREATE TABLE "update_events" (
    "id"            TEXT NOT NULL,
    "from_sha"      TEXT,
    "to_sha"        TEXT,
    "from_tag"      TEXT,
    "to_tag"        TEXT,
    "status"        TEXT NOT NULL,
    "phase"         TEXT,
    "log"           TEXT,
    "error_message" TEXT,
    "started_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at"   TIMESTAMP(3),
    "backup_id"     TEXT,
    "triggered_by"  TEXT,
    "is_rollback"   BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "update_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "update_events_started_at_idx" ON "update_events"("started_at" DESC);

ALTER TABLE "update_events" ADD CONSTRAINT "update_events_backup_id_fkey"
    FOREIGN KEY ("backup_id") REFERENCES "backups"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
