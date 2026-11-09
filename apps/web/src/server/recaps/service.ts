import "server-only";

import { z } from "zod";
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
import { generateTakeaways, modelRecapSchema } from "./model";

const snapshotSchema = createRecapRequestSchema.shape.bookmarks;
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
const generationTimeoutMs = 45_000;
const interruptedAfterMs = 90_000;

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
      return transaction.recap.create({
        data: {
          ownerPrincipalId: principalId,
          sessionId,
          operationId: request.operationId,
          bookmarkSnapshot: request.bookmarks,
          status: "pending",
        },
      });
    });
    return { response: createRecapResponseSchema.parse(record), created: true };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "P2002"))
      throw error;
    const winner = await database.recap.findUnique({ where: operation });
    if (!winner || winner.sessionId !== sessionId)
      throw new AccessError(404, "not_found");
    return {
      response: createRecapResponseSchema.parse(winner),
      created: false,
    };
  }
};

const frameShownAt = (
  frames: SelectedBookmark["evidence"]["frames"],
  atMs: number,
) =>
  frames.reduce<(typeof frames)[number] | undefined>(
    (shown, frame) =>
      frame.capturedAtMs <= atMs &&
      frame.capturedAtMs >= (shown?.capturedAtMs ?? -1)
        ? frame
        : shown,
    undefined,
  )?.frameId ?? null;

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
          frameId: frameShownAt(bookmark.evidence.frames, segment.range.endMs),
        },
      ];
    });
    return citations.length ? [{ text: takeaway.text, citations }] : [];
  });

export const generateRecap = async (id: string) => {
  const database = getDatabase();
  const claimed = await database.recap.updateMany({
    where: { id, status: "pending" },
    data: { status: "running" },
  });
  if (!claimed.count) return;
  const record = await database.recap.findUniqueOrThrow({ where: { id } });
  const controller = new AbortController();
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
        where: { id, status: "running" },
        data: { status: "stale" },
      });
      return;
    }
    const bookmarks = records.map((bookmark) => ({
      id: bookmark.id,
      revision: bookmark.revision,
      evidence: evidenceSchema.parse(
        bookmark.evidence ?? { segments: [], frames: [] },
      ),
    }));
    const passages = bookmarks.flatMap((bookmark) =>
      bookmark.evidence.segments
        .filter((segment) => segment.text.trim())
        .map((segment) => ({
          bookmarkId: bookmark.id,
          segmentId: segment.segmentId,
          segmentRevision: segment.revision,
          text: segment.text,
        })),
    );
    if (!passages.length) {
      await database.recap.updateMany({
        where: { id, status: "running" },
        data: { status: "failed", failureReason: "no_resolved_evidence" },
      });
      return;
    }
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("generation_timeout"));
      }, generationTimeoutMs);
    });
    const output = modelRecapSchema.parse(
      await Promise.race([
        generateTakeaways({ passages, abortSignal: controller.signal }),
        timeout,
      ]),
    );
    const takeaways = validateTakeaways(output, bookmarks);
    await requireMembership({
      principalId: record.ownerPrincipalId,
      sessionId: record.sessionId,
    });
    await database.$transaction(
      async (transaction) => {
        const current = await transaction.bookmark.findMany({
          where: bookmarkFilter(record, snapshot),
          select: { id: true, revision: true },
        });
        const stale = !revisionsMatch(snapshot, current);
        await transaction.recap.updateMany({
          where: { id, status: "running" },
          data: {
            status: stale ? "stale" : takeaways.length ? "ready" : "failed",
            takeaways: stale ? [] : takeaways,
            failureReason:
              stale || takeaways.length ? null : "no_valid_citations",
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch {
    await database.recap.updateMany({
      where: { id, status: "running" },
      data: {
        status: "failed",
        failureReason: controller.signal.aborted
          ? "generation_timeout"
          : "generation_failed",
      },
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
};

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
  const stale = !revisionsMatch(snapshot, current);
  const interrupted =
    (record.status === "pending" || record.status === "running") &&
    Date.now() - record.updatedAt.getTime() > interruptedAfterMs;
  if ((stale && record.status !== "stale") || interrupted) {
    await database.recap.updateMany({
      where: stale
        ? { id }
        : { id, status: record.status, updatedAt: record.updatedAt },
      data: {
        status: stale ? "stale" : "failed",
        takeaways: [],
        failureReason: stale ? null : "background_interrupted",
      },
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
            `Source: bookmark ${citation.bookmarkId}; segment ${citation.segmentId} revision ${citation.segmentRevision}; ${citation.range.startMs}–${citation.range.endMs} ms${citation.frameId ? `; frame ${citation.frameId}` : ""}`,
          ].join("\n"),
        ),
      ]),
    ].join("\n\n") + "\n"
  );
};
