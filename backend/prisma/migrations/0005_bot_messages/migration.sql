-- Bot message direction enum
DO $$ BEGIN CREATE TYPE "BotMsgDirection" AS ENUM ('IN', 'OUT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Bot messages table for chat history
CREATE TABLE IF NOT EXISTS "bot_messages" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "user_id" TEXT,
    "direction" "BotMsgDirection" NOT NULL,
    "text" TEXT NOT NULL,
    "buttons_json" JSONB,
    "callback_data" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bot_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "bot_messages_chat_id_created_at_idx" ON "bot_messages"("chat_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "bot_messages_user_id_created_at_idx" ON "bot_messages"("user_id", "created_at" DESC);

DO $$ BEGIN ALTER TABLE "bot_messages" ADD CONSTRAINT "bot_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
