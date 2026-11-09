import { handleCreateSession } from "@/server/access/http";

export const runtime = "nodejs";
export const POST = (request: Request) => handleCreateSession(request);
