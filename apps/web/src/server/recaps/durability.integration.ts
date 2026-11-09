import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import type { UpdateOptions } from "pg-boss";
import { getDatabase } from "../access/database";
import { getJobs, startJobs, stopJobs } from "../jobs/runtime";
import { syntheticRecapOutput, syntheticRecapSelection } from "./fixtures";
import { generateTakeaways } from "./model";
import { recapDeadLetterQueue, recapQueue } from "./queue";
import { createRecap, generateRecap, getRecap } from "./service";
import {
  createRecapQueues,
  enqueueOrphanedRecaps,
  reconcileRecapsEvery,
  registerRecapWorkers,
} from "./worker";

vi.mock("server-only", () => ({}));
vi.mock("./model", async (original) => ({
  ...(await original<typeof import("./model")>()),
  generateTakeaways: vi.fn(),
}));

const database = getDatabase();
const model = vi.mocked(generateTakeaways);
const host = randomUUID();
const owner = randomUUID();
const sessionId = randomUUID();
const timeoutMs = 300;
const hang = () => new Promise<never>(() => {});
let selection = syntheticRecapSelection();

/** Creates a recap through the real path, then shortens its job's delays before any worker runs. */
const queuedRecap = async (options: UpdateOptions = {}) => {
  const {
    response: { id },
  } = await createRecap({
    principalId: owner,
    sessionId,
    request: {
      operationId: randomUUID(),
      bookmarks: [{ bookmarkId: selection.id, expectedRevision: 1 }],
    },
  });
  await getJobs().update(recapQueue, undefined, {
    id,
    retryDelay: 1,
    retryBackoff: false,
    ...options,
  });
  return id;
};

/** Leaves the database exactly as a pod killed mid-generation would: an active claim and a running recap. */
const abandonAttempt = async (id: string) => {
  const [job] = await getJobs().fetch(recapQueue);
  expect(job?.id).toBe(id);
  await database.recap.update({ where: { id }, data: { status: "running" } });
};

const settled = (id: string) =>
  vi.waitFor(
    async () => {
      const recap = await getRecap({ principalId: owner, id });
      expect(["pending", "running"]).not.toContain(recap.status);
      return recap;
    },
    { timeout: 20_000, interval: 100 },
  );

let stopReconciling: (() => void) | undefined;
const startWorkers = async () => {
  stopReconciling = await registerRecapWorkers(getJobs(), { timeoutMs });
};

const job = async (id: string) =>
  (await getJobs().findJobs(recapQueue, { id }))[0];

beforeAll(async () => {
  await startJobs({
    connectionString: process.env.DATABASE_URL!,
    register: createRecapQueues,
    overrides: { superviseIntervalSeconds: 1, monitorIntervalSeconds: 1 },
  });
  await database.principal.createMany({
    data: [host, owner].map((id) => ({ id })),
  });
  await database.session.create({
    data: {
      id: sessionId,
      hostPrincipalId: host,
      hostLinkTokenHash: randomUUID(),
      inviteCode: randomUUID(),
      memberships: {
        create: [
          { principalId: host, role: "host" },
          { principalId: owner, role: "attendee" },
        ],
      },
    },
  });
});
beforeEach(async () => {
  vi.resetAllMocks();
  selection = syntheticRecapSelection();
  // Synthetic resolved evidence is inserted directly: Elasticsearch is unavailable.
  await database.bookmark.create({
    data: {
      id: selection.id,
      ownerPrincipalId: owner,
      sessionId,
      operationId: randomUUID(),
      anchorKind: "live",
      markedAtMs: 3_000,
      requestedStartMs: 0,
      requestedEndMs: 3_000,
      clockUncertaintyMs: 0,
      completeness: "incomplete",
      evidence: selection.evidence,
    },
  });
});
afterEach(async () => {
  stopReconciling?.();
  stopReconciling = undefined;
  await getJobs().offWork(recapQueue);
  await getJobs().offWork(recapDeadLetterQueue);
  const recaps = await database.recap.findMany({
    where: { sessionId },
    select: { id: true },
  });
  const ids = recaps.map((recap) => recap.id);
  if (ids.length) {
    await getJobs().deleteJob(recapQueue, ids);
    const lost = (await getJobs().findJobs(recapDeadLetterQueue))
      .filter((dead) =>
        ids.includes((dead.data as { recapId: string }).recapId),
      )
      .map((dead) => dead.id);
    if (lost.length) await getJobs().deleteJob(recapDeadLetterQueue, lost);
  }
  await database.recap.deleteMany({ where: { sessionId } });
  await database.bookmark.deleteMany({ where: { sessionId } });
});
afterAll(async () => {
  try {
    await database.session.deleteMany({ where: { id: sessionId } });
    await database.principal.deleteMany({
      where: { id: { in: [host, owner] } },
    });
  } finally {
    await stopJobs(1000);
    await database.$disconnect();
  }
});

it("retries a timed-out attempt and completes within the budget", async () => {
  model
    .mockImplementationOnce(hang)
    .mockResolvedValue(syntheticRecapOutput(selection.id));
  const id = await queuedRecap();
  await startWorkers();

  expect(await settled(id)).toMatchObject({ status: "ready" });
  expect(model).toHaveBeenCalledTimes(2);
  expect(model.mock.calls[0]?.[0].abortSignal.aborted).toBe(true);
  expect(await job(id)).toMatchObject({ state: "completed", retryCount: 1 });
});

it("fails cleanly with a content-free code once every attempt times out", async () => {
  model.mockImplementation(hang);
  const id = await queuedRecap();
  await startWorkers();

  expect(await settled(id)).toMatchObject({
    status: "failed",
    failureReason: "generation_timeout",
    takeaways: [],
  });
  expect(model).toHaveBeenCalledTimes(3);
  const failed = await vi.waitFor(async () => {
    const current = await job(id);
    expect(current?.state).toBe("failed");
    return current;
  });
  expect(failed).toMatchObject({ retryCount: 2 });
  expect(failed?.output).toMatchObject({ message: "generation_timeout" });
  const stored = JSON.stringify(failed);
  expect(stored).not.toContain(selection.evidence.segments[0]!.text);
  expect(stored).not.toContain("shorter meetings");
  // The dead-letter handler leaves the recorded reason alone.
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  expect(await getRecap({ principalId: owner, id })).toMatchObject({
    failureReason: "generation_timeout",
  });
});

it("recovers an attempt lost when its pod died mid-generation", async () => {
  model.mockResolvedValue(syntheticRecapOutput(selection.id));
  const id = await queuedRecap({ expireInSeconds: 1 });
  await abandonAttempt(id);
  expect(await getRecap({ principalId: owner, id })).toMatchObject({
    status: "running",
  });

  await startWorkers();
  expect(await settled(id)).toMatchObject({ status: "ready" });
  expect(model).toHaveBeenCalledTimes(1);
  expect(await job(id)).toMatchObject({ state: "completed", retryCount: 1 });
});

it("marks a recap failed when its final attempt is lost", async () => {
  const id = await queuedRecap({ expireInSeconds: 1, retryLimit: 0 });
  await abandonAttempt(id);

  await startWorkers();
  expect(await settled(id)).toMatchObject({
    status: "failed",
    failureReason: "background_interrupted",
  });
  expect(model).not.toHaveBeenCalled();
  // Finalization keeps retrying at a fixed pace through a database outage.
  const [deadLetter] = await getJobs().findJobs(recapDeadLetterQueue, {
    data: { recapId: id },
  });
  expect(deadLetter).toMatchObject({
    retryLimit: 60,
    retryDelay: 60,
    retryBackoff: false,
  });
});

it("ignores a superseded attempt that finishes while its retry runs", async () => {
  const id = await queuedRecap();
  const paused = () => {
    let release: () => void = () => {};
    let entered: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return {
      started,
      gate,
      entered: () => entered(),
      release: () => release(),
    };
  };
  const superseded = paused();
  const retry = paused();
  model
    .mockImplementationOnce(async () => {
      superseded.entered();
      await superseded.gate;
      return { takeaways: [] };
    })
    .mockImplementationOnce(async () => {
      retry.entered();
      await retry.gate;
      return syntheticRecapOutput(selection.id);
    });
  const attempt = (retryCount: number) => ({
    signal: new AbortController().signal,
    retryCount,
    timeoutMs: 10_000,
  });

  const first = generateRecap(id, attempt(0));
  await superseded.started;
  const second = generateRecap(id, attempt(1));
  await retry.started;
  superseded.release();
  await first;
  expect(await getRecap({ principalId: owner, id })).toMatchObject({
    status: "running",
  });
  retry.release();
  await second;

  expect(await getRecap({ principalId: owner, id })).toMatchObject({
    status: "ready",
    takeaways: [{ text: "Shorter meetings leave more building time." }],
  });
});

it("never lets a delayed older attempt take a recap back from its retry", async () => {
  const id = await queuedRecap();
  let release: () => void = () => {};
  let entered: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  model.mockImplementationOnce(async () => {
    entered();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return syntheticRecapOutput(selection.id);
  });
  const attempt = (retryCount: number) => ({
    signal: new AbortController().signal,
    retryCount,
    timeoutMs: 10_000,
  });

  const retry = generateRecap(id, attempt(1));
  await started;
  await generateRecap(id, attempt(0));
  release();
  await retry;

  expect(model).toHaveBeenCalledTimes(1);
  expect(await getRecap({ principalId: owner, id })).toMatchObject({
    status: "ready",
  });
});

it("gives a job to an active recap the previous image created without one", async () => {
  model.mockResolvedValue(syntheticRecapOutput(selection.id));
  const { id } = await database.recap.create({
    data: {
      ownerPrincipalId: owner,
      sessionId,
      operationId: randomUUID(),
      bookmarkSnapshot: [{ bookmarkId: selection.id, expectedRevision: 1 }],
      status: "running",
      updatedAt: new Date(Date.now() - 91_000),
    },
  });
  const inFlight = await database.recap.create({
    data: {
      ownerPrincipalId: owner,
      sessionId,
      operationId: randomUUID(),
      bookmarkSnapshot: [{ bookmarkId: selection.id, expectedRevision: 1 }],
      status: "running",
    },
  });

  await enqueueOrphanedRecaps(getJobs());
  await enqueueOrphanedRecaps(getJobs());
  expect(await getJobs().findJobs(recapQueue, { id })).toHaveLength(1);
  // A previous-image pod may still be generating a recently claimed recap.
  expect(await getJobs().findJobs(recapQueue, { id: inFlight.id })).toEqual([]);
  await database.recap.delete({ where: { id: inFlight.id } });
  await startWorkers();
  expect(await settled(id)).toMatchObject({ status: "ready" });
});

it("keeps reconciling, so a recap created after startup still gets a job", async () => {
  model.mockResolvedValue(syntheticRecapOutput(selection.id));
  await startWorkers();
  const stop = reconcileRecapsEvery(getJobs(), 200);
  try {
    const { id } = await database.recap.create({
      data: {
        ownerPrincipalId: owner,
        sessionId,
        operationId: randomUUID(),
        bookmarkSnapshot: [{ bookmarkId: selection.id, expectedRevision: 1 }],
        status: "pending",
        updatedAt: new Date(Date.now() - 91_000),
      },
    });
    expect(await settled(id)).toMatchObject({ status: "ready" });
  } finally {
    stop();
  }
});
