-- Editable system messages for INPUT validation errors and email-verification actions.
-- Stored as JSON so we don't need a new column per text.
ALTER TABLE "bot_blocks" ADD COLUMN IF NOT EXISTS "custom_messages" JSONB;
