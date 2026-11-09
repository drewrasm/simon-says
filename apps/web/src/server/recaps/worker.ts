import "server-only";

import type { PgBoss } from "pg-boss";
import { getDatabase } from "../access/database";
import {
  recapDeadLetterQueue,
  recapJobOptions,
  recapQueue,
  type RecapJob,
} from "./queue";
import {
  failInterruptedRecap,
  generateRecap,
  RecapAttemptError,
} from "./service";

type WorkerOptions = { timeoutMs?: number };

const reconcileEveryMs = 5 * 60_000;
// The previous image's after() gives up within its 45-second model budget and 90-second window.
const previousImageBusyMs = 90_000;
// Finalizing a lost attempt is one small update, so it retries every minute for about an hour
// through a database outage. pg-boss does not copy a delay cap onto dead-letter jobs, so backoff
// would grow without bound.
const deadLetterRetries = {
  retryLimit: 60,
  retryDelay: 60,
  retryBackoff: false,
};

// pg-boss stores thrown messages and stacks in Postgres, so only fixed codes leave a handler.
const contentFree = async (work: () => Promise<unknown>) => {
  try {
    await work();
  } catch (error) {
    throw new Error(
      error instanceof RecapAttemptError ? error.code : "job_failed",
    );
  }
};

/**
 * Gives a job to any active recap without one. Enqueueing is transactional, so only an image
 * from before durable jobs, still running during a rollout, can leave one behind.
 */
export const enqueueOrphanedRecaps = async (jobs: PgBoss) => {
  const active = await getDatabase().recap.findMany({
    where: {
      status: { in: ["pending", "running"] },
      // Anything newer may still be generating on a previous-image pod; a later pass adopts it.
      updatedAt: { lt: new Date(Date.now() - previousImageBusyMs) },
    },
    select: { id: true },
  });
  // An existing job ID is left untouched.
  for (const { id } of active)
    await jobs.send(recapQueue, { recapId: id } satisfies RecapJob, {
      ...recapJobOptions,
      id,
    });
};

/** The dead-letter queue must exist before jobs that name it. */
export const createRecapQueues = async (jobs: PgBoss) => {
  await jobs.createQueue(recapDeadLetterQueue);
  // createQueue leaves an existing queue alone, so settings converge here.
  await jobs.updateQueue(recapDeadLetterQueue, deadLetterRetries);
  await jobs.createQueue(recapQueue);
};

/** Repeats reconciliation until stopped; a failed pass is retried at the next one. */
export const reconcileRecapsEvery = (jobs: PgBoss, everyMs: number) => {
  const timer = setInterval(
    () =>
      void enqueueOrphanedRecaps(jobs).catch(() =>
        console.error("jobs: recap reconciliation failed"),
      ),
    everyMs,
  );
  timer.unref();
  return () => clearInterval(timer);
};

/** At most four model calls run at once per pod. Returns a function that stops reconciliation. */
export const registerRecapWorkers = async (
  jobs: PgBoss,
  { timeoutMs }: WorkerOptions = {},
) => {
  await createRecapQueues(jobs);

  await jobs.work<RecapJob>(
    recapQueue,
    { localConcurrency: 4 },
    async ([job]) => {
      if (!job) return;
      await contentFree(() =>
        generateRecap(job.data.recapId, {
          signal: job.signal,
          retryCount: job.retryCount,
          ...(timeoutMs ? { timeoutMs } : {}),
        }),
      );
    },
  );
  // A final attempt lost to a crash or expiry never wrote its own failure.
  await jobs.work<RecapJob>(recapDeadLetterQueue, async ([job]) => {
    if (!job) return;
    await contentFree(() => failInterruptedRecap(job.data.recapId));
  });

  await enqueueOrphanedRecaps(jobs);
  const stopReconciling = reconcileRecapsEvery(jobs, reconcileEveryMs);
  jobs.once("stopped", stopReconciling);
  return stopReconciling;
};
