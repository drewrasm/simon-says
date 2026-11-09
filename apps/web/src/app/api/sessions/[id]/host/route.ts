import { handleClaimHost } from "@/server/access/http";

export const runtime = "nodejs";
type HostRouteContext = { params: Promise<{ id: string }> };

export const POST = async (request: Request, context: HostRouteContext) =>
  handleClaimHost(request, (await context.params).id);
