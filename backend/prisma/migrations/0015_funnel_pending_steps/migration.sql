-- CreateTable: pending_funnel_steps
CREATE TABLE "pending_funnel_steps" (
    "id" TEXT NOT NULL,
    "funnel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'delayed',
    "execute_at" TIMESTAMP(3) NOT NULL,
    "wait_event" TEXT,
    "repeat_count" INTEGER NOT NULL DEFAULT 0,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "vars_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_funnel_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pending_funnel_steps_execute_at_idx" ON "pending_funnel_steps"("execute_at");
CREATE INDEX "pending_funnel_steps_user_id_wait_event_idx" ON "pending_funnel_steps"("user_id", "wait_event");
CREATE INDEX "pending_funnel_steps_funnel_id_user_id_idx" ON "pending_funnel_steps"("funnel_id", "user_id");
