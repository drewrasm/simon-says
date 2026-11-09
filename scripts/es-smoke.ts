import assert from "node:assert/strict";
import { errors } from "@elastic/elasticsearch";
import { elasticClient, elasticConfig, reportFailure } from "./es-config";

async function main() {
  const config = elasticConfig();
  if (config.node !== "http://localhost:9200") {
    throw new Error("es:smoke refuses every URL except http://localhost:9200");
  }
  if (config.inferenceId !== ".multilingual-e5-small-elasticsearch") {
    throw new Error(
      "Local smoke requires ELASTICSEARCH_INFERENCE_ID=.multilingual-e5-small-elasticsearch",
    );
  }
  const client = elasticClient(config);
  const index = "simon-says-segments";
  const sessionId = "es-smoke-c1b";
  const texts = [
    "Solar panels convert sunlight into electricity and renewable energy.",
    "A vegetable soup recipe uses carrots, onions, and potatoes.",
    "Hiking boots protect your feet on rocky mountain trails.",
  ];
  const segments = texts.map((text, i) => ({
    sessionId,
    epoch: 1,
    windowId: "window-1",
    segmentId: `segment-${i + 1}`,
    revision: 1,
    startMs: i * 1000,
    endMs: (i + 1) * 1000,
    timing: { kind: "estimated", uncertaintyMs: 100 },
    text,
    provenance: "live",
    expiresAt: "2099-01-01T00:00:00.000Z",
  }));
  const samples = segments.map((document) => ({
    id: `${document.sessionId}:${document.epoch}:${document.segmentId}:${document.revision}`,
    document,
  }));
  const first = samples[0];
  assert.ok(first, "Smoke requires at least one sample");
  const ids = samples.map((sample) => sample.id);
  const observationId = `${sessionId}:1:observation-1`;
  try {
    console.log(`Local smoke: ${config.node}; inference=${config.inferenceId}`);
    for (const { id, document } of samples) {
      await client.index({
        index,
        id,
        document,
        require_alias: true,
        refresh: "wait_for",
      });
    }
    console.log(
      "Indexed 3 synthetic finalized segments with deterministic IDs",
    );
    await client.index({
      index,
      id: first.id,
      document: first.document,
      require_alias: true,
      refresh: "wait_for",
    });
    const count = await client.count({ index, query: { term: { sessionId } } });
    assert.equal(count.count, 3);
    console.log("Same-ID retry: 3 documents (no duplicate)");
    // Production ingest must use create and compare on conflict to reject changed revisions.
    await assert.rejects(
      client.create({
        index,
        id: first.id,
        document: first.document,
        require_alias: true,
      }),
      (error: unknown) =>
        error instanceof errors.ResponseError && error.statusCode === 409,
    );
    console.log("Create-only retry: HTTP 409 (immutable revision protected)");
    const overlap = await client.search({
      index,
      _source: false,
      sort: [{ startMs: "asc" }],
      query: {
        bool: {
          filter: [
            { term: { sessionId } },
            { range: { startMs: { lt: 2000 } } },
            { range: { endMs: { gt: 500 } } },
          ],
        },
      },
    });
    assert.deepEqual(
      overlap.hits.hits.map((hit) => hit._id),
      ids.slice(0, 2),
    );
    console.log(
      "Overlap [500, 2000): segment-1, segment-2; boundary segment-3 excluded",
    );
    const semantic = await client.search({
      index,
      _source: false,
      size: 3,
      query: {
        bool: {
          filter: [{ term: { sessionId } }],
          must: [
            {
              semantic: {
                field: "text_semantic",
                query: "electricity from sunlight",
              },
            },
          ],
        },
      },
    });
    assert.equal(semantic.hits.hits[0]?._id, first.id);
    console.log("Semantic query: segment-1 ranked first");
    await assert.rejects(
      client.index({
        index,
        id: `${sessionId}:1:unknown:1`,
        require_alias: true,
        document: { ...first.document, unknownField: true },
      }),
      (error: unknown) =>
        error instanceof errors.ResponseError &&
        error.statusCode === 400 &&
        JSON.stringify(error.body.error).includes(
          "strict_dynamic_mapping_exception",
        ),
    );
    console.log("dynamic: strict rejected unknownField: HTTP 400");
    await client.index({
      index: "simon-says-observations",
      id: observationId,
      require_alias: true,
      refresh: "wait_for",
      document: {
        sessionId,
        epoch: 1,
        observationId: "observation-1",
        frameId: "frame-1",
        checksum: "synthetic-checksum",
        objectKey: "smoke/frame-1.png",
        captureState: "captured",
        width: 1280,
        height: 720,
        captureMs: 500,
        glossaryTerms: ["Solar energy"],
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    });
    const glossary = await client.search({
      index: "simon-says-observations",
      _source: false,
      query: {
        bool: {
          filter: [{ term: { sessionId } }],
          must: [{ match: { "glossaryTerms.text": "solar" } }],
        },
      },
    });
    assert.equal(glossary.hits.hits[0]?._id, observationId);
    console.log("Observation ID and glossaryTerms.text query verified");
    console.log("PASS");
  } finally {
    try {
      // Only this script's reserved synthetic IDs; never delete an index or another session.
      for (const id of [...ids, `${sessionId}:1:unknown:1`]) {
        await client.delete(
          { index, id, refresh: "wait_for" },
          { ignore: [404] },
        );
      }
      await client.delete(
        {
          index: "simon-says-observations",
          id: observationId,
          refresh: "wait_for",
        },
        { ignore: [404] },
      );
      console.log("Cleaned up reserved smoke documents");
    } finally {
      await client.close();
    }
  }
}

main().catch(reportFailure);
