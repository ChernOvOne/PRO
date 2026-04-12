-- Add geo_info JSON column to users for storing GeoIP lookup results (country, city, lat, lon, isp)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "geo_info" JSONB;
