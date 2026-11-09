import "server-only";

import { z } from "zod";
import { searchRequestSchema } from "@simon-says/contracts/search";
import { tracePrivateHttp } from "../telemetry/private-flow";
import { AccessError } from "../access/errors";
import { parseBody, respond } from "../access/http";
import { readPrincipal } from "../access/principal";
import { searchSession } from "./service";

export const handleSearch = (request: Request, sessionId: string) =>
  tracePrivateHttp("search.query", async (fail) => {
    try {
      if (!z.uuid().safeParse(sessionId).success)
        throw new AccessError(404, "not_found");
      const principal = await readPrincipal();
      if (!principal) throw new AccessError(404, "not_found");
      const body = await parseBody(request, searchRequestSchema);
      const result = await searchSession({
        sessionId,
        principalId: principal.id,
        request: body,
      });
      if (result.indexingState === "unavailable") fail("source_unavailable");
      return respond(result, 200);
    } catch (error) {
      if (error instanceof AccessError)
        return respond({ error: error.code }, error.status);
      return respond({ error: "internal_error" }, 500);
    }
  });
