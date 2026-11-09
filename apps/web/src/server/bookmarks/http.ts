import "server-only";

import { putBookmarkRequestSchema } from "@simon-says/contracts/bookmark";
import { AccessError } from "../access/errors";
import { parseBody, respond } from "../access/http";
import { readPrincipal } from "../access/principal";
import { listNotes, putNote, RevisionConflictError } from "./notes";

const handleBookmarks = async (operation: () => Promise<unknown>) => {
  try {
    return respond(await operation(), 200);
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      return respond(
        {
          error: "revision_conflict",
          id: error.id,
          expectedRevision: error.expectedRevision,
          currentRevision: error.currentRevision,
        },
        409,
      );
    }
    if (error instanceof AccessError) {
      return respond({ error: error.code }, error.status);
    }
    return respond({ error: "internal_error" }, 500);
  }
};

export const handlePutBookmark = (request: Request, bookmarkId: string) =>
  handleBookmarks(async () => {
    const body = await parseBody(request, putBookmarkRequestSchema);
    const principal = await readPrincipal();
    return putNote({ principalId: principal?.id, bookmarkId, request: body });
  });

export const handleListBookmarks = (request: Request) =>
  handleBookmarks(async () => {
    const sessionId = new URL(request.url).searchParams.get("sessionId") ?? "";
    const principal = await readPrincipal();
    return {
      bookmarks: await listNotes({ principalId: principal?.id, sessionId }),
    };
  });
