import { randomUUID } from "node:crypto";
import type { BookmarkResponse } from "@simon-says/contracts/bookmark";

export const syntheticRecapSelection = () => ({
  id: randomUUID(),
  revision: 1,
  evidence: {
    segments: [
      {
        segmentId: "synthetic-selected-segment",
        revision: 2,
        range: { startMs: 1_000, endMs: 3_000 },
        text: "Synthetic evidence: shorter meetings leave more time to build.",
      },
    ],
  } satisfies BookmarkResponse["evidence"],
});

export const syntheticRecapOutput = (bookmarkId: string) => ({
  takeaways: [
    {
      text: "Shorter meetings leave more building time.",
      citations: [
        {
          bookmarkId,
          segmentId: "synthetic-selected-segment",
          segmentRevision: 2,
          excerpt: "shorter meetings leave more time to build",
        },
      ],
    },
  ],
});
