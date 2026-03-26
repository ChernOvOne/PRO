-- Initial PostgreSQL setup for HIDEYOU
-- This runs when the container first starts

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for fast text search

-- Create indexes after Prisma migration (run after migrate deploy)
-- These are created by Prisma migrations, this file is for extensions only
