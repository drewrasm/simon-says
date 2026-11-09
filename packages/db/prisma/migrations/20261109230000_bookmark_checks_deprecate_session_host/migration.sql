-- The host membership is the only record of who hosts a session. hostPrincipalId is deprecated:
-- nullable now so a later release can stop writing it, and dropped after that.
ALTER TABLE "sessions" ALTER COLUMN "hostPrincipalId" DROP NOT NULL;

-- Prisma cannot express CHECK constraints; these mirror bookmarkAnchorSchema and sourceRangeSchema.
-- Comparisons with NULL pass a CHECK, so every required column is tested with IS NOT NULL.
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_anchor_check" CHECK (
    (
        "anchorKind" = 'live'
        AND "markedAtMs" IS NOT NULL
        AND "markedAtMs" >= 0
        AND "segmentId" IS NULL
        AND "segmentRevision" IS NULL
    )
    OR (
        "anchorKind" = 'paragraph'
        AND "markedAtMs" IS NULL
        AND "segmentId" IS NOT NULL
        AND "segmentRevision" IS NOT NULL
        AND "segmentRevision" >= 1
    )
);

ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_requested_range_check" CHECK (
    "requestedStartMs" >= 0
    AND "requestedEndMs" >= "requestedStartMs"
);

ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_actual_range_check" CHECK (
    ("actualStartMs" IS NULL AND "actualEndMs" IS NULL)
    OR (
        "actualStartMs" IS NOT NULL
        AND "actualEndMs" IS NOT NULL
        AND "actualStartMs" >= 0
        AND "actualEndMs" >= "actualStartMs"
    )
);

ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_clock_uncertainty_check" CHECK ("clockUncertaintyMs" >= 0);
