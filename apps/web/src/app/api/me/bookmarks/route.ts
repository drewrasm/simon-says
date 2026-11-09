import { handleListBookmarks } from "@/server/bookmarks/http";

export const runtime = "nodejs";
export const GET = handleListBookmarks;
