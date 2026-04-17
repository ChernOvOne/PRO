-- News: per-image focus point (CSS object-position) + aspect ratio override
ALTER TABLE "news" ADD COLUMN "image_focus"  TEXT;
ALTER TABLE "news" ADD COLUMN "image_aspect" TEXT;
