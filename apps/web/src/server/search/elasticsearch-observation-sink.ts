import "server-only";
import { isDeepStrictEqual } from "node:util";
import { errors, type estypes } from "@elastic/elasticsearch";
import {
  observationDocumentId,
  screenObservationSchema,
  type ScreenObservation,
} from "@simon-says/contracts/screen";
import type { ObservationSink } from "../frames/upload";
import type { CaptionTelemetry } from "../captions/telemetry";

type RequestOptions = {
  signal: AbortSignal;
  requestTimeout: number;
  maxRetries: number;
};
export interface ObservationWriteClient {
  bulk(
    params: estypes.BulkRequest,
    options: RequestOptions,
  ): Promise<estypes.BulkResponse>;
  get(
    params: estypes.GetRequest,
    options: RequestOptions,
  ): Promise<estypes.GetResponse<unknown>>;
}

// The strict v1 mapping deliberately stores source identity/time and object metadata,
// not upload transport fields. Its long captureMs uses whole session milliseconds.
const observationDocumentSchema = screenObservationSchema
  .omit({
    seq: true,
    captureSampleOffset: true,
    mimeType: true,
  })
  .strip()
  .extend({
    epoch: screenObservationSchema.shape.epoch.max(0x7fff_ffff),
    captureMs: screenObservationSchema.shape.captureMs.int(),
  });

const index = "simon-says-observations";

function transient(error: unknown): boolean {
  if (error instanceof errors.ResponseError)
    return error.statusCode === 429 || (error.statusCode ?? 0) >= 500;
  return (
    error instanceof errors.ConnectionError ||
    error instanceof errors.NoLivingConnectionsError ||
    error instanceof errors.TimeoutError
  );
}

/** Create-only observations; retries verify the complete mapped source on conflict. */
export class ElasticsearchObservationSink implements ObservationSink {
  constructor(
    private readonly client: ObservationWriteClient,
    private readonly telemetry?: CaptionTelemetry,
    private readonly budgetMs = 3000,
  ) {}

  async put(observation: ScreenObservation): Promise<void> {
    const started = performance.now();
    const abort = new AbortController();
    const deadline = setTimeout(() => abort.abort(), this.budgetMs);
    try {
      const source = screenObservationSchema.parse(observation);
      const documents = [
        observationDocumentSchema.parse({
          ...source,
          captureMs: Math.floor(source.captureMs),
        }),
      ];
      let attempt = 0;
      for (;;) {
        try {
          const response = await this.client.bulk(
            {
              refresh: false,
              require_alias: true,
              operations: documents.flatMap((document) => [
                {
                  create: { _index: index, _id: observationDocumentId(source) },
                },
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
            throw new Error("observation_sink_invalid_response");
          let retry = false;
          for (const [position, item] of response.items.entries()) {
            const result = item.create;
            const document = documents[position];
            if (!result || !document)
              throw new Error("observation_sink_invalid_response");
            if (result.status === 409) {
              const existing = await this.client.get(
                {
                  index,
                  id: observationDocumentId(source),
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
              // Compare every mapped field, including expiry, checksum and object identity.
              const parsed = observationDocumentSchema.safeParse(
                existing._source,
              );
              if (!parsed.success || !isDeepStrictEqual(parsed.data, document))
                throw new Error("observation_conflict");
            } else if (result.status === 429 || result.status >= 500) {
              retry = true;
            } else if (result.status < 200 || result.status >= 300) {
              throw new Error("observation_sink_rejected");
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
          throw new Error("observation_sink_budget_exhausted");
        this.telemetry?.("es_write_retries", 1);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    } catch {
      this.telemetry?.("es_write_failures", 1);
      // SDK errors can carry source bodies and credentials. Expose only a fixed code.
      throw new Error("observation_sink_failed");
    } finally {
      clearTimeout(deadline);
      this.telemetry?.("es_write_latency_ms", performance.now() - started);
    }
  }
}
