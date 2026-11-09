import { handleSearch } from "@/server/search/http";

export const runtime = "nodejs";
type SearchRouteContext = { params: Promise<{ id: string }> };

export const POST = async (request: Request, context: SearchRouteContext) =>
  handleSearch(request, (await context.params).id);
