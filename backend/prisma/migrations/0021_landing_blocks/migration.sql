-- Landing Page Builder: ordered blocks per page (type + data JSON)

CREATE TABLE "landing_blocks" (
    "id" TEXT NOT NULL,
    "page_key" TEXT NOT NULL DEFAULT 'main',
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landing_blocks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "landing_blocks_page_key_sort_order_idx" ON "landing_blocks"("page_key", "sort_order");
