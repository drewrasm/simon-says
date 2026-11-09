import "server-only";

import { z } from "zod";
import {
  startPrivateSpan,
  type PrivateErrorCode,
} from "../telemetry/private-flow";
import { bookmarkResponseSchema } from "@simon-says/contracts/bookmark";
import {
  createRecapRequestSchema,
  createRecapResponseSchema,
  recapResponseSchema,
  type CreateRecapRequest,
  type RecapTakeaway,
} from "@simon-says/contracts/recap";
import { getDatabase } from "../access/database";
import { AccessError } from "../access/errors";
import { requireMembership } from "../access/membership";
import { RevisionConflict } from "../bookmarks/service";
import {
  generateTakeaways,
  modelRecapSchema,
  type SelectedPassage,
} from "./model";
import { enqueueRecap, recapJobOptions } from "./queue";

// Stored snapshots are not re-limited by the request maximum.
const snapshotSchema = z.array(
  createRecapRequestSchema.shape.bookmarks.element,
);
const evidenceSchema = bookmarkResponseSchema.shape.evidence;
type RecapRecord = NonNullable<
  Awaited<ReturnType<ReturnType<typeof getDatabase>["recap"]["findUnique"]>>
>;
type BookmarkSnapshot = z.infer<typeof snapshotSchema>;
type SelectedBookmark = {
  id: string;
  revision: number;
  evidence: z.infer<typeof evidenceSchema>;
};
type OwnerOptions = { principalId: string; id: string };
type CreateOptions = {
  principalId: string;
  sessionId: string;
  request: CreateRecapRequest;
};
type AttemptFailure =
  "generation_failed" | "generation_timeout" | "background_interrupted";
type AttemptOptions = {
  signal: AbortSignal;
  /** pg-boss counts attempts from zero and never reuses a count for a job. */
  retryCount: number;
  timeoutMs?: number;
};
const generationTimeoutMs = 45_000;
// Longer than any attempt plus its backoff; a recap stranded by a recovery failure stops blocking new ones.
const activeForMs = 10 * 60_000;
const maxPassageCharacters = 60_000;

/** A retryable attempt failure, identified only by a content-free code. */
export class RecapAttemptError extends Error {
  constructor(public readonly code: AttemptFailure) {
    super(code);
  }
}

const requireId = (id: string) => {
  if (!z.uuid().safeParse(id).success) throw new AccessError(404, "not_found");
};

const revisionsMatch = (
  snapshot: BookmarkSnapshot,
  bookmarks: { id: string; revision: number }[],
) =>
  snapshot.every((selected) =>
    bookmarks.some(
      (bookmark) =>
        bookmark.id === selected.bookmarkId &&
        bookmark.revision === selected.expectedRevision,
    ),
  );

const bookmarkFilter = (record: RecapRecord, snapshot: BookmarkSnapshot) => ({
  id: { in: snapshot.map((bookmark) => bookmark.bookmarkId) },
  ownerPrincipalId: record.ownerPrincipalId,
  sessionId: record.sessionId,
});

export const createRecap = async ({
  principalId,
  sessionId,
  request,
}: CreateOptions) => {
  requireId(sessionId);
  await requireMembership({ principalId, sessionId });
  const database = getDatabase();
  const operation = {
    ownerPrincipalId_operationId: {
      ownerPrincipalId: principalId,
      operationId: request.operationId,
    },
  };
  const existing = await database.recap.findUnique({ where: operation });
  if (existing) {
    if (existing.sessionId !== sessionId)
      throw new AccessError(404, "not_found");
    return {
      response: createRecapResponseSchema.parse(existing),
      created: false,
    };
  }
  if (
    new Set(request.bookmarks.map((b) => b.bookmarkId)).size !==
    request.bookmarks.length
  ) {
    throw new AccessError(400, "invalid_request");
  }

  try {
    const record = await database.$transaction(async (transaction) => {
      const bookmarks = await transaction.bookmark.findMany({
        where: {
          ownerPrincipalId: principalId,
          sessionId,
          id: { in: request.bookmarks.map((b) => b.bookmarkId) },
        },
        select: { id: true, revision: true },
      });
      for (const selected of request.bookmarks) {
        const bookmark = bookmarks.find((b) => b.id === selected.bookmarkId);
        if (!bookmark) throw new AccessError(404, "not_found");
        if (bookmark.revision !== selected.expectedRevision) {
          throw new RevisionConflict({
            error: "revision_conflict",
            id: bookmark.id,
            expectedRevision: selected.expectedRevision,
            currentRevision: bookmark.revision,
          });
        }
      }

      // Serializes concurrent creates for one owner and session so only one can become active.
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${principalId.toLowerCase()}), hashtext(${sessionId.toLowerCase()}))`;
      const active = await transaction.recap.count({
        where: {
          ownerPrincipalId: principalId,
          sessionId,
          status: { in: ["pending", "running"] },
          updatedAt: { gt: new Date(Date.now() - activeForMs) },
        },
      });
      if (active) throw new AccessError(429, "recap_in_progress");

      const recap = await transaction.recap.create({
        data: {
          ownerPrincipalId: principalId,
          sessionId,
          operationId: request.operationId,
          bookmarkSnapshot: request.bookmarks,
          status: "pending",
        },
      });
      await enqueueRecap(transaction, recap.id);
      return recap;
    });
    return { response: createRecapResponseSchema.parse(record), created: true };
  } catch (error) {
    const duplicate =
      error instanceof Error && "code" in error && error.code === "P2002";
    // A concurrent retry of the same operation sees its winner as the active recap.
    const busy = error instanceof AccessError && error.status === 429;
    if (!duplicate && !busy) throw error;

    const winner = await database.recap.findUnique({ where: operation });
    if (!winner && busy) throw error;
    if (!winner || winner.sessionId !== sessionId)
      throw new AccessError(404, "not_found");
    return {
      response: createRecapResponseSchema.parse(winner),
      created: false,
    };
  }
};

export const validateTakeaways = (
  output: z.infer<typeof modelRecapSchema>,
  bookmarks: SelectedBookmark[],
): RecapTakeaway[] =>
  output.takeaways.flatMap((takeaway) => {
    const citations = takeaway.citations.flatMap((citation) => {
      const bookmark = bookmarks.find((b) => b.id === citation.bookmarkId);
      const segment = bookmark?.evidence.segments.find(
        (s) =>
          s.segmentId === citation.segmentId &&
          s.revision === citation.segmentRevision,
      );
      if (!bookmark || !segment || !citation.excerpt.trim()) return [];
      const offset = segment.text.indexOf(citation.excerpt);
      if (offset < 0) return [];
      return [
        {
          bookmarkId: bookmark.id,
          segmentId: segment.segmentId,
          segmentRevision: segment.revision,
          range: segment.range,
          excerpt: segment.text.slice(offset, offset + citation.excerpt.length),
        },
      ];
    });
    return citations.length ? [{ text: takeaway.text, citations }] : [];
  });

// Budgets the serialized prompt and keeps whole passages in selection order so cited excerpts stay verbatim.
// Overlapping bookmarks share segments; each is sent once and lists every bookmark that holds it.
export const limitPassages = (passages: SelectedPassage[]) => {
  const bySegment = new Map<string, SelectedPassage>();
  for (const passage of passages) {
    const segment = `${passage.segmentId}:${passage.segmentRevision}`;
    const sent = bySegment.get(segment);
    if (sent) (sent.alsoBookmarkIds ??= []).push(passage.bookmarkId);
    else bySegment.set(segment, { ...passage });
  }

  let characters = 0;
  return [...bySegment.values()].filter((passage) => {
    characters += JSON.stringify(passage).length + 1;
    return characters <= maxPassageCharacters;
  });
};

type AttemptResult = {
  outcome: "success" | "error" | "stale" | "skipped";
  errorCode?: PrivateErrorCode;
};

/**
 * Runs one job attempt. Terminal outcomes return; retryable failures throw a RecapAttemptError
 * after returning the recap to `pending`, or after recording `failed` on the final attempt.
 */
export const generateRecap = async (id: string, options: AttemptOptions) => {
  const finish = startPrivateSpan("recap.generate");
  try {
    finish(await attemptRecap(id, options));
  } catch (error) {
    const code =
      error instanceof RecapAttemptError ? error.code : "generation_failed";
    // The span allowlist has no code for an interrupted attempt.
    finish({
      outcome: "error",
      ...(code === "background_interrupted" ? {} : { errorCode: code }),
    });
    throw error;
  }
};

const attemptRecap = async (
  id: string,
  { signal, retryCount, timeoutMs = generationTimeoutMs }: AttemptOptions,
): Promise<AttemptResult> => {
  const database = getDatabase();
  const attempts = retryCount + 1;
  const finalAttempt = retryCount >= recapJobOptions.retryLimit;
  // `running` is claimed again because a crashed or expired attempt leaves it behind,
  // but only by a newer attempt, so a delayed older attempt cannot take it back.
  const claimed = await database.recap.updateMany({
    where: {
      id,
      status: { in: ["pending", "running"] },
      attempts: { lt: attempts },
    },
    data: { status: "running", attempts },
  });
  if (!claimed.count) return { outcome: "skipped" };
  // Every later write matches this claim, so a superseded attempt cannot overwrite its retry.
  const claim = { id, status: "running" as const, attempts };

  const record = await database.recap.findUniqueOrThrow({ where: { id } });
  const controller = new AbortController();
  let failure: AttemptFailure = "generation_failed";
  const stop = (reason: AttemptFailure) => {
    failure = reason;
    controller.abort();
  };
  const interrupt = () => stop("background_interrupted");
  if (signal.aborted) interrupt();
  else signal.addEventListener("abort", interrupt, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await requireMembership({
      principalId: record.ownerPrincipalId,
      sessionId: record.sessionId,
    });
    const snapshot = snapshotSchema.parse(record.bookmarkSnapshot);
    const records = await database.bookmark.findMany({
      where: bookmarkFilter(record, snapshot),
    });
    if (!revisionsMatch(snapshot, records)) {
      await database.recap.updateMany({
        where: claim,
        data: { status: "stale" },
      });
      return { outcome: "stale" };
    }
    const snapshotOrder = snapshot.map((selected) => selected.bookmarkId);
    const bookmarks = records
      .sort((a, b) => snapshotOrder.indexOf(a.id) - snapshotOrder.indexOf(b.id))
      .map((bookmark) => ({
        id: bookmark.id,
        revision: bookmark.revision,
        evidence: evidenceSchema.parse(bookmark.evidence ?? { segments: [] }),
      }));
    const passages = limitPassages(
      bookmarks.flatMap((bookmark) =>
        bookmark.evidence.segments
          .filter((segment) => segment.text.trim())
          .map((segment) => ({
            bookmarkId: bookmark.id,
            segmentId: segment.segmentId,
            segmentRevision: segment.revision,
            text: segment.text,
          })),
      ),
    );
    if (!passages.length) {
      await database.recap.updateMany({
        where: claim,
        data: { status: "failed", failureReason: "no_resolved_evidence" },
      });
      return { outcome: "error", errorCode: "no_resolved_evidence" };
    }

    const aborted = new Promise<never>((_, reject) => {
      timer = setTimeout(() => stop("generation_timeout"), timeoutMs);
      if (controller.signal.aborted) reject(new Error(failure));
      controller.signal.addEventListener(
        "abort",
        () => reject(new Error(failure)),
        { once: true },
      );
    });
    const output = modelRecapSchema.parse(
      await Promise.race([
        generateTakeaways({ passages, abortSignal: controller.signal }),
        aborted,
      ]),
    );
    const takeaways = validateTakeaways(output, bookmarks);
    await requireMembership({
      principalId: record.ownerPrincipalId,
      sessionId: record.sessionId,
    });
    const stale = await database.$transaction(
      async (transaction) => {
        const current = await transaction.bookmark.findMany({
          where: bookmarkFilter(record, snapshot),
          select: { id: true, revision: true },
        });
        const changed = !revisionsMatch(snapshot, current);
        await transaction.recap.updateMany({
          where: claim,
          data: {
            status: changed ? "stale" : takeaways.length ? "ready" : "failed",
            takeaways: changed ? [] : takeaways,
            failureReason:
              changed || takeaways.length ? null : "no_valid_citations",
          },
        });
        return changed;
      },
      { isolationLevel: "Serializable" },
    );
    if (stale) return { outcome: "stale" };
    return takeaways.length
      ? { outcome: "success" }
      : { outcome: "error", errorCode: "no_valid_citations" };
  } catch (error) {
    // Revoked access is final: a retry would send the passages to the model again.
    const revoked = error instanceof AccessError;
    await database.recap.updateMany({
      where: claim,
      data:
        revoked || finalAttempt
          ? {
              status: "failed",
              failureReason: revoked ? "generation_failed" : failure,
            }
          : { status: "pending" },
    });
    if (!revoked) throw new RecapAttemptError(failure);
    return { outcome: "error", errorCode: "generation_failed" };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", interrupt);
  }
};

/** Dead-letter handler: a final attempt that never recorded its own failure. */
export const failInterruptedRecap = (id: string) =>
  getDatabase().recap.updateMany({
    where: { id, status: { in: ["pending", "running"] } },
    data: { status: "failed", failureReason: "background_interrupted" },
  });

export const getRecap = async ({ principalId, id }: OwnerOptions) => {
  requireId(id);
  const database = getDatabase();
  let record = await database.recap.findUnique({ where: { id } });
  if (!record || record.ownerPrincipalId !== principalId)
    throw new AccessError(404, "not_found");
  await requireMembership({ principalId, sessionId: record.sessionId });
  const snapshot = snapshotSchema.parse(record.bookmarkSnapshot);
  const current = await database.bookmark.findMany({
    where: bookmarkFilter(record, snapshot),
    select: { id: true, revision: true },
  });
  if (!revisionsMatch(snapshot, current) && record.status !== "stale") {
    await database.recap.updateMany({
      where: { id },
      data: { status: "stale", takeaways: [], failureReason: null },
    });
    record = await database.recap.findUniqueOrThrow({ where: { id } });
  }
  return recapResponseSchema.parse({
    id: record.id,
    status: record.status,
    takeaways: record.takeaways,
    failureReason: record.failureReason,
  });
};

const escapeMarkdown = (text: string) =>
  text.replace(/[\\`*_{}\[\]<>#!|~]/g, "\\$&");

export const exportRecapMarkdown = async (options: OwnerOptions) => {
  const recap = await getRecap(options);
  if (recap.status !== "ready") return null;
  return (
    [
      "# My recap",
      ...recap.takeaways.flatMap((takeaway, index) => [
        `## ${index + 1}. ${escapeMarkdown(takeaway.text)}`,
        ...takeaway.citations.map((citation) =>
          [
            ...citation.excerpt
              .split(/\r?\n/)
              .map((line) => `> ${escapeMarkdown(line)}`),
            `Source: bookmark ${citation.bookmarkId}; segment ${citation.segmentId} revision ${citation.segmentRevision}; ${citation.range.startMs}–${citation.range.endMs} ms`,
          ].join("\n"),
        ),
      ]),
    ].join("\n\n") + "\n"
  );
};
