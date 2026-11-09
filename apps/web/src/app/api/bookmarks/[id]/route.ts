import { handlePutBookmark } from "@/server/bookmarks/http";

export const runtime = "nodejs";
type BookmarkRouteContext = { params: Promise<{ id: string }> };

export const PUT = async (request: Request, context: BookmarkRouteContext) =>
  handlePutBookmark(request, (await context.params).id);
