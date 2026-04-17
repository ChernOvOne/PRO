-- Add RECOVERY category for account access recovery tickets
ALTER TYPE "TicketCategory" ADD VALUE IF NOT EXISTS 'RECOVERY';
