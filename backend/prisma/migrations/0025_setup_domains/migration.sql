-- Multi-domain deployment: each row is a tenant-configured domain
CREATE TABLE "setup_domains" (
    "id"              TEXT NOT NULL,
    "domain"          TEXT NOT NULL,
    "role"            TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'pending',
    "last_error"      TEXT,
    "cert_issued_at"  TIMESTAMP(3),
    "cert_expires_at" TIMESTAMP(3),
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "setup_domains_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "setup_domains_domain_key" ON "setup_domains"("domain");
