import "server-only";

import { z } from "zod";
import {
  bookmarkResponseSchema,
  listBookmarksResponseSchema,
  revisionConflictErrorSchema,
  type BookmarkResponse,
  type PutBookmarkRequest,
} from "@simon-says/contracts/bookmark";
import { getDatabase } from "../access/database";
import { AccessError } from "../access/errors";
import { requireMembership } from "../access/membership";
import { requestedRange, resolveEvidence } from "../evidence/resolve";

export type BookmarkRecord = NonNullable<
  Awaited<ReturnType<ReturnType<typeof getDatabase>["bookmark"]["findUnique"]>>
>;
type OwnerOptions = { principalId: string; id: string };
type PutOptions = OwnerOptions & { request: PutBookmarkRequest };
type ListOptions = { principalId: string; sessionId: string };

export class RevisionConflict extends Error {
  constructor(
    public readonly body: z.infer<typeof revisionConflictErrorSchema>,
  ) {
    super("revision_conflict");
  }
}

const conflict = (
  id: string,
  expectedRevision: number | null,
  currentRevision: number | null,
): never => {
  throw new RevisionConflict(
    revisionConflictErrorSchema.parse({
      error: "revision_conflict",
      id,
      expectedRevision,
      currentRevision,
    }),
  );
};

const requireId = (id: string) => {
  if (!z.uuid().safeParse(id).success) throw new AccessError(404, "not_found");
};

const requireOwner = (
  record: BookmarkRecord,
  principalId: string,
  sessionId = record.sessionId,
) => {
  if (
    record.ownerPrincipalId !== principalId ||
    record.sessionId !== sessionId
  ) {
    throw new AccessError(404, "not_found");
  }
};

const toResponse = (record: BookmarkRecord): BookmarkResponse =>
  bookmarkResponseSchema.parse({
    id: record.id,
    sessionId: record.sessionId,
    revision: record.revision,
    anchor:
      record.anchorKind === "live"
        ? { kind: "live", markedAtMs: record.markedAtMs }
        : {
            kind: "paragraph",
            segmentId: record.segmentId,
            segmentRevision: record.segmentRevision,
            range: {
              startMs: record.requestedStartMs,
              endMs: record.requestedEndMs,
            },
          },
    requestedRange: {
      startMs: record.requestedStartMs,
      endMs: record.requestedEndMs,
    },
    actualRange:
      record.actualStartMs === null || record.actualEndMs === null
        ? null
        : { startMs: record.actualStartMs, endMs: record.actualEndMs },
    clockUncertaintyMs: record.clockUncertaintyMs,
    completeness: record.completeness,
    evidence: record.evidence ?? { segments: [], frames: [] },
    note: record.note,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });

const resolutionData = (
  resolution: Awaited<ReturnType<typeof resolveEvidence>>,
) => ({
  evidence: resolution.evidence,
  actualStartMs: resolution.actualRange?.startMs ?? null,
  actualEndMs: resolution.actualRange?.endMs ?? null,
  completeness: resolution.completeness,
  clockUncertaintyMs: resolution.clockUncertaintyMs,
});

const uniqueConflict = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "P2002";

export const putBookmark = async ({ principalId, id, request }: PutOptions) => {
  requireId(id);
  await requireMembership({ principalId, sessionId: request.sessionId });
  const database = getDatabase();
  const existing = await database.bookmark.findUnique({ where: { id } });
  if (existing) {
    requireOwner(existing, principalId, request.sessionId);
    if (existing.operationId === request.operationId)
      return { bookmark: toResponse(existing), status: 200 };
    if (
      request.expectedRevision === null ||
      existing.revision !== request.expectedRevision
    ) {
      conflict(id, request.expectedRevision, existing.revision);
    }
  } else if (request.expectedRevision !== null) {
    throw new AccessError(404, "not_found");
  }

  const range = existing
    ? { startMs: existing.requestedStartMs, endMs: existing.requestedEndMs }
    : requestedRange(request.anchor);
  const resolution = await resolveEvidence({
    sessionId: request.sessionId,
    range,
  });
  const materialized =
    resolution.completeness === "pending"
      ? { completeness: "pending" as const }
      : resolutionData(resolution);

  try {
    if (!existing) {
      const record = await database.bookmark.create({
        data: {
          id,
          ownerPrincipalId: principalId,
          sessionId: request.sessionId,
          operationId: request.operationId,
          anchorKind: request.anchor.kind,
          ...(request.anchor.kind === "live"
            ? { markedAtMs: request.anchor.markedAtMs }
            : {
                segmentId: request.anchor.segmentId,
                segmentRevision: request.anchor.segmentRevision,
              }),
          requestedStartMs: range.startMs,
          requestedEndMs: range.endMs,
          ...(request.note === undefined ? {} : { note: request.note }),
          ...resolutionData(resolution),
        },
      });
      return { bookmark: toResponse(record), status: 201 };
    }

    const [record] = await database.bookmark.updateManyAndReturn({
      where: {
        id,
        ownerPrincipalId: principalId,
        sessionId: request.sessionId,
        revision: request.expectedRevision ?? 0,
      },
      data: {
        revision: { increment: 1 },
        operationId: request.operationId,
        ...(request.note === undefined ? {} : { note: request.note }),
        ...materialized,
      },
    });
    if (record) return { bookmark: toResponse(record), status: 200 };
  } catch (error) {
    if (!uniqueConflict(error)) throw error;
  }

  const current = await database.bookmark.findUnique({ where: { id } });
  if (current) {
    requireOwner(current, principalId, request.sessionId);
    if (current.operationId === request.operationId)
      return { bookmark: toResponse(current), status: 200 };
  } else if (existing) {
    throw new AccessError(404, "not_found");
  }
  return conflict(id, request.expectedRevision, current?.revision ?? null);
};

export const listBookmarks = async ({
  principalId,
  sessionId,
}: ListOptions) => {
  await requireMembership({ principalId, sessionId });
  const database = getDatabase();
  const records = await database.bookmark.findMany({
    where: { ownerPrincipalId: principalId, sessionId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const retryIds = new Set(
    records
      .filter((r) => r.completeness === "pending")
      .slice(0, 5)
      .map((r) => r.id),
  );
  const bookmarks = await Promise.all(
    records.map(async (record) => {
      if (!retryIds.has(record.id)) return toResponse(record);
      const resolution = await resolveEvidence({
        sessionId,
        range: {
          startMs: record.requestedStartMs,
          endMs: record.requestedEndMs,
        },
      });
      if (resolution.completeness === "pending") return toResponse(record);

      const [updated] = await database.bookmark.updateManyAndReturn({
        where: {
          id: record.id,
          ownerPrincipalId: principalId,
          revision: record.revision,
          completeness: "pending",
        },
        data: resolutionData(resolution),
      });
      if (updated) return toResponse(updated);
      const current = await database.bookmark.findFirst({
        where: { id: record.id, ownerPrincipalId: principalId, sessionId },
      });
      return current ? toResponse(current) : null;
    }),
  );
  return listBookmarksResponseSchema.parse({
    bookmarks: bookmarks.filter((b) => b !== null),
  });
};

export const deleteBookmark = async ({ principalId, id }: OwnerOptions) => {
  requireId(id);
  const database = getDatabase();
  const record = await database.bookmark.findUnique({ where: { id } });
  if (!record) return;
  requireOwner(record, principalId);
  await requireMembership({ principalId, sessionId: record.sessionId });
  await database.bookmark.deleteMany({
    where: { id, ownerPrincipalId: principalId },
  });
};
