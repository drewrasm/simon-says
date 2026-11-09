import "server-only";

import {
  bookmarkResponseSchema,
  type BookmarkResponse,
  type PutBookmarkRequest,
} from "@simon-says/contracts/bookmark";
import { z } from "zod";
import { getDatabase } from "../access/database";
import { AccessError } from "../access/errors";
import { requireMembership } from "../access/membership";

/** A live mark covers the previous 30 seconds (contracts: Bookmarks). */
export const LIVE_WINDOW_MS = 30_000;
/**
 * The session clock is approximate until Track 2's capture clock exists: it is
 * measured from session creation, not from the first captured audio.
 */
export const APPROXIMATE_CLOCK_UNCERTAINTY_MS = 5_000;
/** Marks may not claim a time later than the server's view of the session clock. */
const FUTURE_TOLERANCE_MS = 5_000;

export class RevisionConflictError extends Error {
  constructor(
    public readonly id: string,
    public readonly expectedRevision: number | null,
    public readonly currentRevision: number | null,
  ) {
    super("revision_conflict");
  }
}

/** Approximate session-clock milliseconds: time since the session was created. */
export const sessionElapsedMs = (createdAt: Date, now = Date.now()) =>
  Math.max(0, now - createdAt.getTime());

type BookmarkRow = NonNullable<
  Awaited<ReturnType<ReturnType<typeof getDatabase>["bookmark"]["findUnique"]>>
>;

const evidenceSchema = bookmarkResponseSchema.shape.evidence;
const emptyEvidence = { segments: [], frames: [] };

export const toBookmarkResponse = (row: BookmarkRow): BookmarkResponse => {
  const requestedRange = {
    startMs: row.requestedStartMs,
    endMs: row.requestedEndMs,
  };
  const anchor =
    row.anchorKind === "live"
      ? {
          kind: "live" as const,
          markedAtMs: row.markedAtMs ?? row.requestedEndMs,
        }
      : {
          kind: "paragraph" as const,
          segmentId: row.segmentId ?? "",
          segmentRevision: row.segmentRevision ?? 1,
          range: requestedRange,
        };
  const evidence = evidenceSchema.safeParse(row.evidence);

  // Parse on the way out so a malformed row never reaches a client.
  return bookmarkResponseSchema.parse({
    id: row.id,
    sessionId: row.sessionId,
    revision: row.revision,
    anchor,
    requestedRange,
    actualRange:
      row.actualStartMs !== null && row.actualEndMs !== null
        ? { startMs: row.actualStartMs, endMs: row.actualEndMs }
        : null,
    clockUncertaintyMs: row.clockUncertaintyMs,
    completeness: row.completeness,
    evidence: evidence.success ? evidence.data : emptyEvidence,
    note: row.note ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
};

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "P2002";

export type PutNoteOptions = {
  principalId: string | null | undefined;
  bookmarkId: string;
  request: PutBookmarkRequest;
  now?: number;
};

/**
 * Owner-only, idempotent creation of a live-anchored note. Retries with the same
 * `operationId` return the saved bookmark. Paragraph anchors and updates need
 * caption resolution and revision handling that do not exist yet.
 */
export const putNote = async ({
  principalId,
  bookmarkId,
  request,
  now = Date.now(),
}: PutNoteOptions) => {
  if (!z.uuid().safeParse(bookmarkId).success) {
    throw new AccessError(404, "not_found");
  }
  const membership = await requireMembership({
    sessionId: request.sessionId,
    principalId,
  });
  const ownerPrincipalId = membership.principalId;

  if (request.anchor.kind !== "live" || request.expectedRevision !== null) {
    throw new AccessError(400, "invalid_request");
  }
  const note = request.note?.trim();
  if (!note) throw new AccessError(400, "invalid_request");

  const { markedAtMs } = request.anchor;
  if (
    markedAtMs >
    sessionElapsedMs(membership.session.createdAt, now) + FUTURE_TOLERANCE_MS
  ) {
    throw new AccessError(400, "invalid_request");
  }

  const database = getDatabase();
  const findRetry = () =>
    database.bookmark.findUnique({
      where: {
        ownerPrincipalId_operationId: {
          ownerPrincipalId,
          operationId: request.operationId,
        },
      },
    });

  const answerRetry = (retry: BookmarkRow) => {
    // The same operation saved under another ID is not this bookmark.
    if (retry.id !== bookmarkId) {
      throw new RevisionConflictError(bookmarkId, null, null);
    }
    return toBookmarkResponse(retry);
  };

  const resolveExisting = async () => {
    const retry = await findRetry();
    if (retry) return answerRetry(retry);
    const byId = await database.bookmark.findUnique({
      where: { id: bookmarkId },
    });
    // Another owner's ID looks absent; the owner's own ID already exists.
    throw new RevisionConflictError(
      bookmarkId,
      null,
      byId && byId.ownerPrincipalId === ownerPrincipalId ? byId.revision : null,
    );
  };

  const retry = await findRetry();
  if (retry) return answerRetry(retry);

  try {
    const row = await database.bookmark.create({
      data: {
        id: bookmarkId,
        ownerPrincipalId,
        sessionId: request.sessionId,
        operationId: request.operationId,
        anchorKind: "live",
        markedAtMs,
        requestedStartMs: Math.max(0, markedAtMs - LIVE_WINDOW_MS),
        requestedEndMs: markedAtMs,
        clockUncertaintyMs: APPROXIMATE_CLOCK_UNCERTAINTY_MS,
        note,
      },
    });
    return toBookmarkResponse(row);
  } catch (error) {
    // A concurrent retry or a reused ID: answer from what is stored.
    if (isUniqueViolation(error)) return resolveExisting();
    throw error;
  }
};

export type ListNotesOptions = {
  principalId: string | null | undefined;
  sessionId: string;
};

/** The caller's own bookmarks in one session, newest first. */
export const listNotes = async ({
  principalId,
  sessionId,
}: ListNotesOptions) => {
  const membership = await requireMembership({ sessionId, principalId });
  const rows = await getDatabase().bookmark.findMany({
    where: { ownerPrincipalId: membership.principalId, sessionId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toBookmarkResponse);
};
