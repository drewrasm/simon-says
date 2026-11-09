import "server-only";
import { createHash } from "node:crypto";
import {
  frameUploadMetadataSchema,
  screenIdSchema,
  observationDocumentId,
  type ScreenObservation,
} from "@simon-says/contracts/screen";

export interface HostFrameAccess {
  /** Must check host membership, ended state, and the current lease/epoch. */
  authorize(
    request: Request,
    sessionId: string,
    epoch: number,
  ): Promise<"allowed" | "unauthorized" | "stale_epoch">;
}
export interface FrameStore {
  put(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
}
export interface ObservationSink {
  /** Upsert by observationDocumentId; await persistence before acknowledging. */
  put(observation: ScreenObservation): Promise<void>;
}
export class InMemoryObservationSink implements ObservationSink {
  readonly observations = new Map<string, ScreenObservation>();
  async put(observation: ScreenObservation): Promise<void> {
    this.observations.set(observationDocumentId(observation), observation);
  }
}
export const MAX_FRAME_BYTES = 1_500_000;

/** Bounded body reader; Content-Length alone is not a trusted size check. */
async function readFrame(request: Request): Promise<Uint8Array | undefined> {
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_FRAME_BYTES) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
    return length ? Buffer.concat(chunks, length) : undefined;
  } finally {
    reader.releaseLock();
  }
}

/** Single-process prototype. Durable epoch fencing/idempotency must replace this before production. */
export function createFrameUpload(deps: {
  access: HostFrameAccess;
  store: FrameStore;
  sink: ObservationSink;
}) {
  const records = new Map<
    string,
    { fingerprint: string; result: Promise<ScreenObservation> }
  >();
  let active = 0;
  return async (request: Request, sessionId: string): Promise<Response> => {
    const reply = (status: number, error: string) =>
      Response.json(
        { error },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    if (!screenIdSchema.safeParse(sessionId).success)
      return reply(400, "invalid_session");
    let raw: unknown;
    try {
      raw = JSON.parse(request.headers.get("X-Frame-Metadata") ?? "");
    } catch {
      return reply(400, "invalid_metadata");
    }
    const parsed = frameUploadMetadataSchema.safeParse(raw);
    if (!parsed.success) return reply(400, "invalid_metadata");
    const metadata = parsed.data;
    if (
      request.headers.get("Content-Type") !== metadata.mimeType ||
      metadata.captureState !== "live"
    )
      return reply(400, "invalid_frame");
    const access = await deps.access.authorize(
      request,
      sessionId,
      metadata.epoch,
    );
    if (access !== "allowed")
      return reply(access === "stale_epoch" ? 409 : 403, access);
    if (Number(request.headers.get("Content-Length")) > MAX_FRAME_BYTES)
      return reply(413, "frame_too_large");
    if (active >= 4) return reply(503, "overloaded");
    active++;
    try {
      const bytes = await readFrame(request);
      if (!bytes) return reply(413, "invalid_frame_size");
      if (
        createHash("sha256").update(bytes).digest("hex") !== metadata.checksum
      )
        return reply(400, "bad_checksum");
      // MIME signatures reject accidentally mislabeled binary uploads. Dimensions are host metadata.
      const image = Buffer.from(bytes);
      const signature =
        metadata.mimeType === "image/webp"
          ? image.toString("ascii", 0, 4) === "RIFF" &&
            image.toString("ascii", 8, 12) === "WEBP"
          : image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
      if (!signature) return reply(400, "invalid_image");
      const key = `${sessionId}:${metadata.epoch}:${metadata.seq}`;
      const fingerprint = JSON.stringify(metadata);
      const existing = records.get(key);
      if (existing && existing.fingerprint !== fingerprint)
        return reply(409, "sequence_conflict");
      if (!existing && records.size >= 10_000)
        return reply(503, "observation_capacity");
      const persist = async (): Promise<ScreenObservation> => {
        const extension = metadata.mimeType === "image/webp" ? "webp" : "jpg";
        const objectKey = `sessions/${sessionId}/frames/${metadata.epoch}/${metadata.seq}-${metadata.checksum}.${extension}`;
        await deps.store.put(objectKey, bytes, metadata.mimeType);
        // Recheck the lease after storage latency, before acknowledging the observation.
        if (
          (await deps.access.authorize(request, sessionId, metadata.epoch)) !==
          "allowed"
        )
          throw new Error("Lease changed");
        const observation: ScreenObservation = {
          ...metadata,
          sessionId,
          observationId: `frame-${metadata.seq}`,
          frameId: `frame-${metadata.seq}`,
          captureMs: metadata.captureSampleOffset / 24,
          objectKey,
          glossaryTerms: [],
          expiresAt: null,
        };
        await deps.sink.put(observation);
        return observation;
      };
      const result = existing?.result ?? persist();
      if (!existing) records.set(key, { fingerprint, result });
      let observation: ScreenObservation;
      try {
        observation = await result;
      } catch {
        records.delete(key);
        return reply(503, "frame_persistence_unavailable");
      }
      return Response.json(
        { observationId: observation.observationId },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return reply(400, "incomplete_frame");
    } finally {
      active--;
    }
  };
}

/** Explicit local-only bridge until S3/Track 3 supplies real session access. */
export function devFrameAccess(
  env: Readonly<Record<string, string | undefined>>,
): HostFrameAccess {
  return {
    async authorize(request, sessionId, epoch) {
      const url = new URL(request.url);
      const origin = request.headers.get("Origin");
      if (
        env.NODE_ENV === "production" ||
        !env.CAPTIONS_DEV_SESSION ||
        sessionId !== env.CAPTIONS_DEV_SESSION ||
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
        (origin && origin !== url.origin)
      )
        return "unauthorized";
      return epoch === Number(env.CAPTIONS_DEV_EPOCH ?? "1")
        ? "allowed"
        : "stale_epoch";
    },
  };
}
