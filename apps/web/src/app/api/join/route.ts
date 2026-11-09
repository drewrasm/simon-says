import { handleJoinSession } from "@/server/access/http";

export const runtime = "nodejs";
export const POST = (request: Request) => handleJoinSession(request);
