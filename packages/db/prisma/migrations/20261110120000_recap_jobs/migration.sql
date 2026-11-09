-- Counts claimed job attempts so an older attempt can never take a recap back from a newer one.
ALTER TABLE "recaps" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
