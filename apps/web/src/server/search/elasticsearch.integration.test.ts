import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { Client } from "@elastic/elasticsearch";
import { MockTranscriptionModelV4 } from "ai/test";
import { expect, it } from "vitest";
import {
  segmentDocumentId,
  type CaptionEvent,
} from "@simon-says/contracts/caption";
import { ElasticsearchSegmentSink } from "./elasticsearch-segment-sink";
import { CaptionAssembler } from "../captions/assembler";
import { EventHub } from "../captions/event-hub";
import { WindowManager } from "../captions/window-manager";

it("local ES: fake-model pipeline persists revisions before final and supports overlap queries", async (context) => {
  if (process.env.ES_LOCAL_INTEGRATION !== "1") {
    context.skip(
      "Local Elasticsearch integration disabled; run pnpm es:test:local (localhost:9200 only).",
    );
    return;
  }
  const local = parseEnv(
    await readFile(`${homedir()}/simon-says-elastic-local/.env`, "utf8"),
  );
  local.ES_LOCAL_URL = local.ES_LOCAL_URL?.replace(
    "${ES_LOCAL_PORT}",
    local.ES_LOCAL_PORT ?? "",
  );
  if (local.ES_LOCAL_URL !== "http://localhost:9200" || !local.ES_LOCAL_API_KEY)
    throw new Error(
      "Local integration requires ES_LOCAL_URL=http://localhost:9200 and ES_LOCAL_API_KEY.",
    );
  const client = new Client({
    node: local.ES_LOCAL_URL,
    auth: { apiKey: local.ES_LOCAL_API_KEY },
    requestTimeout: 1000,
    maxRetries: 0,
  });
  const sessionId = `sink-local-${randomUUID()}`;
  const ids: string[] = [];
  let reachable = false;
  try {
    try {
      await client.info();
      reachable = true;
    } catch {
      context.skip(
        "Local Elasticsearch is unreachable at http://localhost:9200; start ~/simon-says-elastic-local/start.sh.",
      );
      return;
    }
    const hub = new EventHub(sessionId);
    const events: CaptionEvent[] = [];
    hub.subscribe((event) => events.push(event));
    const fake = new MockTranscriptionModelV4({
      doStream: async ({ audio }) => ({
        stream: new ReadableStream({
          async start(controller) {
            const reader = audio.getReader();
            while (!(await reader.read()).done) {
              /* drain synthetic PCM */
            }
            reader.releaseLock();
            controller.enqueue({
              type: "transcript-final",
              text: "Synthetic Elasticsearch captions. Local evidence only.",
            });
            controller.enqueue({
              type: "finish",
              text: "Synthetic Elasticsearch captions. Local evidence only.",
              segments: [],
            });
            controller.close();
          },
        }),
      }),
    });
    if (!fake.doStream) throw new Error("missing_fake_stream");
    const sink = new ElasticsearchSegmentSink(client);
    const manager = new WindowManager({
      hub,
      epoch: 1,
      assembler: new CaptionAssembler(hub, sink, 1),
      model: {
        specificationVersion: "v4",
        provider: fake.provider,
        modelId: fake.modelId,
        doGenerate: fake.doGenerate,
        doStream: fake.doStream,
      },
    });
    manager.push({
      epoch: 1,
      seq: 0,
      sampleOffset: 0,
      samples: new Int16Array(2400),
    });
    await manager.finish();
    const finals = events.filter((event) => event.kind === "caption.final");
    expect(finals).toHaveLength(1);
    const segments = finals.flatMap((event) => event.segments);
    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      const id = segmentDocumentId(segment);
      ids.push(id);
      const stored = await client.get({ index: "simon-says-segments", id });
      expect(stored._source).toMatchObject(segment);
      expect(Object.keys(stored._source ?? {}).sort()).toEqual(
        Object.keys(segment).sort(),
      );
    }
    await sink.writeSegments(segments); // real 409 verification, no duplicate revisions
    await client.indices.refresh({ index: "simon-says-segments" });
    const found = await client.search({
      index: "simon-says-segments",
      query: {
        bool: {
          filter: [
            { term: { sessionId } },
            { range: { startMs: { lt: 100 } } },
            { range: { endMs: { gt: 0 } } },
          ],
        },
      },
    });
    expect(found.hits.hits.map((hit) => hit._id).sort()).toEqual(ids.sort());
    console.log(
      `Local ES integration: ${ids.length} deterministic revisions, exact mapped fields, idempotent replay, overlap query passed; fake model only.`,
    );
  } finally {
    // Also cleans partial writes after a failed finalization.
    if (reachable)
      await client.deleteByQuery({
        index: "simon-says-segments",
        query: { term: { sessionId } },
        refresh: true,
      });
    await client.close();
  }
}, 30000);
