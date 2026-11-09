import {
  handleDeleteBookmark,
  handlePutBookmark,
} from "@/server/bookmarks/http";

export const runtime = "nodejs";
type BookmarkRouteContext = { params: Promise<{ id: string }> };

export const PUT = async (request: Request, context: BookmarkRouteContext) =>
  handlePutBookmark(request, (await context.params).id);

export const DELETE = async (request: Request, context: BookmarkRouteContext) =>
  handleDeleteBookmark(request, (await context.params).id);
