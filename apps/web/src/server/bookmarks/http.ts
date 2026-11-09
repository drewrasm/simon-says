import "server-only";

import { z } from "zod";
import { putBookmarkRequestSchema } from "@simon-says/contracts/bookmark";
import { SourceUnavailable } from "../evidence/resolve";
import { tracePrivateHttp } from "../telemetry/private-flow";
import { AccessError } from "../access/errors";
import { parseBody, respond } from "../access/http";
import { readPrincipal } from "../access/principal";
import {
  deleteBookmark,
  listBookmarks,
  putBookmark,
  RevisionConflict,
} from "./service";

const handleBookmark = async (operation: () => Promise<Response>) => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AccessError)
      return respond({ error: error.code }, error.status);
    if (error instanceof SourceUnavailable)
      return respond({ error: "source_unavailable" }, 503);
    if (error instanceof RevisionConflict) return respond(error.body, 409);
    return respond({ error: "internal_error" }, 500);
  }
};

const principalId = async () => {
  const principal = await readPrincipal();
  if (!principal) throw new AccessError(404, "not_found");
  return principal.id;
};

const requireId = (id: string) => {
  if (!z.uuid().safeParse(id).success) throw new AccessError(404, "not_found");
};

export const handlePutBookmark = (request: Request, id: string) =>
  tracePrivateHttp("bookmark.save", () =>
    handleBookmark(async () => {
      requireId(id);
      const body = await parseBody(request, putBookmarkRequestSchema);
      const result = await putBookmark({
        principalId: await principalId(),
        id,
        request: body,
      });
      return respond(result.bookmark, result.status);
    }),
  );

export const handleListBookmarks = (request: Request) =>
  handleBookmark(async () => {
    const sessionId = new URL(request.url).searchParams.get("sessionId") ?? "";
    requireId(sessionId);
    return respond(
      await listBookmarks({ principalId: await principalId(), sessionId }),
      200,
    );
  });

export const handleDeleteBookmark = (_request: Request, id: string) =>
  handleBookmark(async () => {
    requireId(id);
    await deleteBookmark({ principalId: await principalId(), id });
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  });
