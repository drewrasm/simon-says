import "server-only";
import {
  createFrameUpload,
  devFrameAccess,
  InMemoryObservationSink,
} from "@/server/frames/upload";
import { s3FrameStore } from "@/server/frames/s3";

export const runtime = "nodejs";
let upload: ReturnType<typeof createFrameUpload> | undefined;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  // Fail closed before initializing storage; this is not production host authentication.
  if (
    process.env.NODE_ENV === "production" ||
    !process.env.CAPTIONS_DEV_SESSION
  )
    return new Response(null, { status: 404 });
  try {
    upload ??= createFrameUpload({
      access: devFrameAccess(process.env),
      store: s3FrameStore(process.env),
      sink: new InMemoryObservationSink(),
    });
    return await upload(request, (await context.params).id);
  } catch {
    return Response.json(
      { error: "frame_service_unavailable" },
      { status: 503 },
    );
  }
}
