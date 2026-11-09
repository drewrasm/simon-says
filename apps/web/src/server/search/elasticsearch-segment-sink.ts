import "server-only";
import { isDeepStrictEqual } from "node:util";
import { errors, type estypes } from "@elastic/elasticsearch";
import {
  segmentDocumentId,
  transcriptSegmentSchema,
  type TranscriptSegment,
} from "@simon-says/contracts/caption";
import type { SegmentSink } from "../captions/segment-sink";
import type { CaptionTelemetry } from "../captions/telemetry";

type RequestOptions = {
  signal: AbortSignal;
  requestTimeout: number;
  maxRetries: number;
};
export interface SegmentWriteClient {
  bulk(
    params: estypes.BulkRequest,
    options: RequestOptions,
  ): Promise<estypes.BulkResponse>;
  get(
    params: estypes.GetRequest,
    options: RequestOptions,
  ): Promise<estypes.GetResponse<unknown>>;
}

const index = "simon-says-segments";

function transient(error: unknown): boolean {
  if (error instanceof errors.ResponseError)
    return error.statusCode === 429 || (error.statusCode ?? 0) >= 500;
  return (
    error instanceof errors.ConnectionError ||
    error instanceof errors.NoLivingConnectionsError ||
    error instanceof errors.TimeoutError
  );
}

/** Create-only revisions. A partial bulk replay verifies existing source before succeeding. */
export class ElasticsearchSegmentSink implements SegmentSink {
  constructor(
    private readonly client: SegmentWriteClient,
    private readonly telemetry?: CaptionTelemetry,
    private readonly budgetMs = 3000,
  ) {}

  async writeSegments(segments: readonly TranscriptSegment[]): Promise<void> {
    const started = performance.now();
    const abort = new AbortController();
    const deadline = setTimeout(() => abort.abort(), this.budgetMs);
    try {
      const documents = segments.map((segment) =>
        transcriptSegmentSchema.parse(segment),
      );
      if (!documents.length) return;
      let attempt = 0;
      for (;;) {
        try {
          const response = await this.client.bulk(
            {
              refresh: false,
              require_alias: true,
              operations: documents.flatMap((document) => [
                { create: { _index: index, _id: segmentDocumentId(document) } },
                document,
              ]),
            },
            {
              signal: abort.signal,
              requestTimeout: Math.max(
                1,
                Math.min(1000, this.budgetMs - (performance.now() - started)),
              ),
              maxRetries: 0,
            },
          );
          if (response.items.length !== documents.length)
            throw new Error("segment_sink_invalid_response");
          let retry = false;
          for (const [position, item] of response.items.entries()) {
            const result = item.create;
            const document = documents[position];
            if (!result || !document)
              throw new Error("segment_sink_invalid_response");
            if (result.status === 409) {
              const existing = await this.client.get(
                {
                  index,
                  id: segmentDocumentId(document),
                  realtime: true,
                },
                {
                  signal: abort.signal,
                  requestTimeout: Math.max(
                    1,
                    Math.min(
                      1000,
                      this.budgetMs - (performance.now() - started),
                    ),
                  ),
                  maxRetries: 0,
                },
              );
              // Compare only declared segment fields: ES may add semantic metadata and
              // lifecycle workers may later attach expiresAt. Never compare just text.
              const parsed = transcriptSegmentSchema.safeParse(
                existing._source,
              );
              if (!parsed.success || !isDeepStrictEqual(parsed.data, document))
                throw new Error("segment_revision_conflict");
            } else if (result.status === 429 || result.status >= 500) {
              retry = true;
            } else if (result.status < 200 || result.status >= 300) {
              throw new Error("segment_sink_rejected");
            }
          }
          if (!retry) return;
        } catch (error) {
          if (!transient(error)) throw error;
        }
        const delay = Math.min(100 * 2 ** Math.min(attempt++, 3), 800);
        if (
          abort.signal.aborted ||
          performance.now() - started + delay >= this.budgetMs
        )
          throw new Error("segment_sink_budget_exhausted");
        this.telemetry?.("es_write_retries", 1);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    } catch {
      this.telemetry?.("es_write_failures", 1);
      // SDK errors can carry source bodies and credentials. Expose only a fixed code.
      throw new Error("segment_sink_failed");
    } finally {
      clearTimeout(deadline);
      this.telemetry?.("es_write_latency_ms", performance.now() - started);
    }
  }
}
