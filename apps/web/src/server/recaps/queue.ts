import "server-only";

import { fromPrisma, type PrismaTransactionLike } from "pg-boss";
import { getJobs } from "../jobs/runtime";

export const recapQueue = "recap.generate";
export const recapDeadLetterQueue = "recap.failed";
export type RecapJob = { recapId: string };

/** Each retry is a paid model call; expiry outlasts the 45-second model budget. */
export const recapJobOptions = {
  retryLimit: 2,
  retryDelay: 5,
  retryBackoff: true,
  retryDelayMax: 60,
  expireInSeconds: 90,
  deadLetter: recapDeadLetterQueue,
};

/** Commits with the caller's transaction, so a recap row never exists without its job. */
export const enqueueRecap = (
  transaction: PrismaTransactionLike,
  recapId: string,
) =>
  getJobs().send(recapQueue, { recapId } satisfies RecapJob, {
    ...recapJobOptions,
    id: recapId,
    db: fromPrisma(transaction),
  });
