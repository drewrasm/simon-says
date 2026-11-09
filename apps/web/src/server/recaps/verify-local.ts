import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createDatabaseClient } from "@simon-says/db/client";
import {
  createSessionResponseSchema,
  joinSessionResponseSchema,
} from "@simon-says/contracts/session";
import {
  createRecapResponseSchema,
  recapResponseSchema,
} from "@simon-says/contracts/recap";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:18084");
assert(
  ["localhost", "127.0.0.1"].includes(base.hostname),
  "Local verification only",
);
const database = createDatabaseClient();
const principalIds: string[] = [];
let sessionId: string | undefined;

const send = async (
  path: string,
  options: { cookie?: string; body?: unknown; method?: string } = {},
) => {
  const response = await fetch(new URL(path, base), {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: {
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  return response;
};
const cookieFrom = (response: Response) => {
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert(cookie, "Expected a new signed identity cookie");
  return cookie;
};

try {
  const created = await send("/api/sessions", {
    body: { title: "Synthetic recap HTTP verification" },
  });
  assert.equal(created.status, 201);
  const hostCookie = cookieFrom(created);
  const session = createSessionResponseSchema.parse(await created.json());
  sessionId = session.sessionId;
  const host = await database.session.findUniqueOrThrow({
    where: { id: sessionId },
  });
  principalIds.push(host.hostPrincipalId);
  const attendees = [];
  for (let index = 0; index < 2; index++) {
    const joined = await send("/api/join", {
      body: { inviteCode: session.inviteCode },
    });
    assert.equal(joined.status, 200);
    const cookie = cookieFrom(joined);
    const membership = joinSessionResponseSchema.parse(await joined.json());
    const row = await database.membership.findUniqueOrThrow({
      where: { id: membership.membershipId },
    });
    principalIds.push(row.principalId);
    attendees.push({ cookie, principalId: row.principalId });
  }
  const attendeeA = attendees[0];
  const attendeeB = attendees[1];
  assert(attendeeA && attendeeB);
  const selectedId = randomUUID();
  const unselectedId = randomUUID();
  const otherOwnerId = randomUUID();
  for (const [id, attendee, label] of [
    [selectedId, attendeeA, "selected-A"],
    [unselectedId, attendeeA, "unselected-A"],
    [otherOwnerId, attendeeB, "selected-B"],
  ] satisfies [string, typeof attendeeA, string][]) {
    const saved = await send(`/api/bookmarks/${id}`, {
      cookie: attendee.cookie,
      method: "PUT",
      body: {
        sessionId,
        operationId: randomUUID(),
        expectedRevision: null,
        anchor: { kind: "live", markedAtMs: 3_000 },
        note: "Synthetic owner note excluded from model input",
      },
    });
    assert.equal(saved.status, 201);
    await database.bookmark.update({
      where: { id },
      data: {
        completeness: "incomplete",
        evidence: {
          segments: [
            {
              segmentId: label,
              revision: 1,
              range: { startMs: 1_000, endMs: 3_000 },
              text: `Synthetic ${label} evidence: shorter meetings leave more time to build useful software.`,
            },
          ],
          frames: [],
        },
      },
    });
  }
  const request = {
    operationId: randomUUID(),
    bookmarks: [{ bookmarkId: selectedId, expectedRevision: 1 }],
  };
  const startedAt = Date.now();
  const started = await send(`/api/sessions/${sessionId}/recaps`, {
    cookie: attendeeA.cookie,
    body: request,
  });
  assert.equal(started.status, 201);
  const { id } = createRecapResponseSchema.parse(await started.json());
  const postMs = Date.now() - startedAt;
  const retried = await send(`/api/sessions/${sessionId}/recaps`, {
    cookie: attendeeA.cookie,
    body: request,
  });
  assert.equal(retried.status, 200);
  assert.equal(createRecapResponseSchema.parse(await retried.json()).id, id);
  const poll = async () => {
    for (let attempt = 0; attempt < 300; attempt++) {
      const response = await send(`/api/me/recaps/${id}`, {
        cookie: attendeeA.cookie,
      });
      assert.equal(response.status, 200);
      const recap = recapResponseSchema.parse(await response.json());
      if (recap.status !== "pending" && recap.status !== "running")
        return recap;
      await delay(200);
    }
    throw new Error("Recap polling exceeded the generation budget");
  };
  const recap = await poll();
  if (process.env.OPENAI_API_KEY) {
    assert.equal(
      recap.status,
      "ready",
      `Real generation status: ${recap.status}/${recap.failureReason}`,
    );
    assert(recap.takeaways.length);
    for (const citation of recap.takeaways.flatMap(
      (takeaway) => takeaway.citations,
    )) {
      assert.equal(citation.bookmarkId, selectedId);
      assert.equal(citation.segmentId, "selected-A");
      assert.equal(citation.segmentRevision, 1);
      assert(
        "Synthetic selected-A evidence: shorter meetings leave more time to build useful software.".includes(
          citation.excerpt,
        ),
      );
    }
    const exported = await send(`/api/me/recaps/${id}/export`, {
      cookie: attendeeA.cookie,
    });
    assert.equal(exported.status, 200);
    assert((await exported.text()).includes(selectedId));
  } else {
    assert.equal(recap.status, "failed");
    assert.equal(recap.failureReason, "generation_failed");
    assert.deepEqual(recap.takeaways, []);
    const exported = await send(`/api/me/recaps/${id}/export`, {
      cookie: attendeeA.cookie,
    });
    assert.equal(exported.status, 409);
  }
  for (const cookie of [attendeeB.cookie, hostCookie]) {
    for (const suffix of ["", "/export"]) {
      assert.equal(
        (await send(`/api/me/recaps/${id}${suffix}`, { cookie })).status,
        404,
      );
    }
  }
  const crossOwnerCreate = await send(`/api/sessions/${sessionId}/recaps`, {
    cookie: attendeeB.cookie,
    body: { ...request, operationId: randomUUID() },
  });
  assert.equal(crossOwnerCreate.status, 404);
  const cards = await send(`/api/me/bookmarks?sessionId=${sessionId}`, {
    cookie: attendeeA.cookie,
  });
  assert.equal(cards.status, 200);
  assert.equal(
    await database.bookmark.count({
      where: { sessionId, ownerPrincipalId: attendeeA.principalId },
    }),
    2,
  );
  const malformed = await send("/api/sessions/malformed/recaps", {
    cookie: attendeeA.cookie,
    body: request,
  });
  assert.equal(malformed.status, 404);
  const empty = await send(`/api/sessions/${sessionId}/recaps`, {
    cookie: attendeeA.cookie,
    body: { operationId: randomUUID(), bookmarks: [] },
  });
  assert.equal(empty.status, 400);
  assert.equal(await database.recap.count({ where: { sessionId } }), 1);
  console.log(
    JSON.stringify({
      evidence:
        "synthetic resolved passages inserted directly into local Postgres; Elasticsearch unavailable",
      model: process.env.OPENAI_API_KEY
        ? "real OpenAI generation verified"
        : "no-key failure verified; real generation unverified",
      status: recap.status,
      failureReason: recap.failureReason,
      postMs,
      operationRetryReusedId: true,
      crossOwnerAndHostReadExport: 404,
      crossOwnerCreate: 404,
      bookmarksPreserved: true,
      emptySelection: 400,
      noStore: true,
    }),
  );
} finally {
  if (sessionId)
    await database.session.deleteMany({ where: { id: sessionId } });
  if (principalIds.length)
    await database.principal.deleteMany({
      where: { id: { in: principalIds } },
    });
  await database.$disconnect();
}
