import { handleGetRecap } from "@/server/recaps/http";

export const runtime = "nodejs";
type RecapRouteContext = { params: Promise<{ id: string }> };

export const GET = async (request: Request, context: RecapRouteContext) =>
  handleGetRecap(request, (await context.params).id);
