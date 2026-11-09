import "server-only";

import { z } from "zod";
import { askRequestSchema } from "@simon-says/contracts/ask";
import { AccessError } from "../access/errors";
import { parseBody, respond } from "../access/http";
import { readPrincipal } from "../access/principal";
import { askSession } from "./service";

export const handleAsk = async (request: Request, sessionId: string) => {
  try {
    if (!z.uuid().safeParse(sessionId).success)
      throw new AccessError(404, "not_found");
    const principal = await readPrincipal();
    if (!principal) throw new AccessError(404, "not_found");
    const body = await parseBody(request, askRequestSchema);
    return await askSession({
      sessionId,
      principalId: principal.id,
      question: body.question,
      signal: request.signal,
    });
  } catch (error) {
    if (error instanceof AccessError)
      return respond({ error: error.code }, error.status);
    return respond({ error: "internal_error" }, 500);
  }
};
