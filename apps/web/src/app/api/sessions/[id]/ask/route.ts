import { handleAsk } from "@/server/ask/http";

export const runtime = "nodejs";
export const maxDuration = 15;
type AskRouteContext = { params: Promise<{ id: string }> };

export const POST = async (request: Request, context: AskRouteContext) =>
  handleAsk(request, (await context.params).id);
