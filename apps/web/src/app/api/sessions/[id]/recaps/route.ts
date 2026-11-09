import { handleCreateRecap } from "@/server/recaps/http";

export const runtime = "nodejs";
type RecapRouteContext = { params: Promise<{ id: string }> };

export const POST = async (request: Request, context: RecapRouteContext) =>
  handleCreateRecap(request, (await context.params).id);
