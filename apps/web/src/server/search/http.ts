import "server-only";

import { z } from "zod";
import { searchRequestSchema } from "@simon-says/contracts/search";
import { AccessError } from "../access/errors";
import { parseBody, respond } from "../access/http";
import { readPrincipal } from "../access/principal";
import { searchSession } from "./service";

export const handleSearch = async (request: Request, sessionId: string) => {
  try {
    if (!z.uuid().safeParse(sessionId).success)
      throw new AccessError(404, "not_found");
    const principal = await readPrincipal();
    if (!principal) throw new AccessError(404, "not_found");
    const body = await parseBody(request, searchRequestSchema);
    return respond(
      await searchSession({
        sessionId,
        principalId: principal.id,
        request: body,
      }),
      200,
    );
  } catch (error) {
    if (error instanceof AccessError)
      return respond({ error: error.code }, error.status);
    return respond({ error: "internal_error" }, 500);
  }
};
