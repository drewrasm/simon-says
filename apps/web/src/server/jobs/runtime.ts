import "server-only";

import { setTimeout as delay } from "node:timers/promises";
import { PgBoss, type ConstructorOptions } from "pg-boss";

declare global {
  // Next route handlers and the custom server load separate module graphs in one process.
  var simonSaysJobs: PgBoss | undefined;
}

type StartJobsOptions = {
  connectionString: string;
  register: (jobs: PgBoss) => Promise<unknown>;
  /** Tests shorten supervision intervals. */
  overrides?: ConstructorOptions;
};

const maxRetryMs = 30_000;
let stopRequested = false;

const startOnce = async ({
  connectionString,
  register,
  overrides,
}: StartJobsOptions) => {
  // Expired attempts are found within 15 seconds instead of pg-boss's default minute.
  const jobs = new PgBoss({
    connectionString,
    schema: "pgboss",
    migrate: false,
    max: 3,
    application_name: "simon-says-jobs",
    superviseIntervalSeconds: 15,
    monitorIntervalSeconds: 15,
    ...overrides,
  });
  // Error events can carry SQL parameters, so only a fixed line is logged.
  jobs.on("error", () => console.error("jobs: error"));

  try {
    await jobs.start();
    await register(jobs);
    return jobs;
  } catch (error) {
    await jobs.stop({ graceful: false }).catch(() => undefined);
    throw error;
  }
};

/**
 * Retries with backoff until jobs start or `stopJobs` is called, so a pod that booted while
 * Postgres was unavailable starts its workers once it recovers. The db-migrate Job installs the
 * `pgboss` schema; pods never migrate it.
 */
export const startJobs = async (options: StartJobsOptions) => {
  stopRequested = false;
  for (
    let retryMs = 1_000;
    !stopRequested;
    retryMs = Math.min(retryMs * 2, maxRetryMs)
  ) {
    try {
      const jobs = await startOnce(options);
      if (stopRequested) {
        await jobs.stop({ graceful: false });
        return undefined;
      }
      globalThis.simonSaysJobs = jobs;
      return jobs;
    } catch {
      console.error("jobs: start failed; retrying");
      await delay(retryMs, undefined, { ref: false });
    }
  }
  return undefined;
};

export const getJobs = () => {
  const jobs = globalThis.simonSaysJobs;
  if (!jobs) throw new Error("jobs_unavailable");
  return jobs;
};

/** Unfinished jobs are failed into retry, so another pod picks them up. */
export const stopJobs = async (timeoutMs: number) => {
  stopRequested = true;
  const jobs = globalThis.simonSaysJobs;
  globalThis.simonSaysJobs = undefined;
  await jobs?.stop({ graceful: true, timeout: timeoutMs });
};
