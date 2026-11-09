import { handleListBookmarks } from "@/server/bookmarks/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleListBookmarks(request);
