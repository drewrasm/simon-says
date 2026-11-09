import "server-only";

import { after } from "next/server";
import { z } from "zod";
import { createRecapRequestSchema } from "@simon-says/contracts/recap";
import { AccessError } from "../access/errors";
import { parseBody, respond } from "../access/http";
import { readPrincipal } from "../access/principal";
import { requireMembership } from "../access/membership";
import { RevisionConflict } from "../bookmarks/service";
import {
  createRecap,
  exportRecapMarkdown,
  generateRecap,
  getRecap,
} from "./service";

const handleRecap = async (operation: () => Promise<Response>) => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AccessError)
      return respond({ error: error.code }, error.status);
    if (error instanceof RevisionConflict) return respond(error.body, 409);
    return respond({ error: "internal_error" }, 500);
  }
};

const requireId = (id: string) => {
  if (!z.uuid().safeParse(id).success) throw new AccessError(404, "not_found");
};

const principalId = async () => {
  const principal = await readPrincipal();
  if (!principal) throw new AccessError(404, "not_found");
  return principal.id;
};

export const handleCreateRecap = (request: Request, sessionId: string) =>
  handleRecap(async () => {
    requireId(sessionId);
    const owner = await principalId();
    await requireMembership({ principalId: owner, sessionId });
    const body = await parseBody(request, createRecapRequestSchema);
    const result = await createRecap({
      principalId: owner,
      sessionId,
      request: body,
    });
    if (result.created)
      after(() => generateRecap(result.response.id).catch(() => undefined));
    return respond(result.response, result.created ? 201 : 200);
  });

export const handleGetRecap = (_request: Request, id: string) =>
  handleRecap(async () => {
    requireId(id);
    return respond(
      await getRecap({ principalId: await principalId(), id }),
      200,
    );
  });

export const handleExportRecap = (_request: Request, id: string) =>
  handleRecap(async () => {
    requireId(id);
    const markdown = await exportRecapMarkdown({
      principalId: await principalId(),
      id,
    });
    if (markdown === null) return respond({ error: "recap_not_ready" }, 409);
    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="recap-${id}.md"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
