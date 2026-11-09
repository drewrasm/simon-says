import type { BookmarkResponse } from "@simon-says/contracts/bookmark";
import { Badge } from "@simon-says/ui/components/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@simon-says/ui/components/empty";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@simon-says/ui/components/tabs";
import { ScissorsIcon, SquarePenIcon } from "lucide-react";
import { formatTalkTime } from "../talk-time";

/** Newest first, by creation time then ID, so the list order is stable. */
export const newestFirst = (bookmarks: BookmarkResponse[]) =>
  [...bookmarks].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );

/** A clip quotes captured speech; a note is the attendee's own words only. */
const isClip = (bookmark: BookmarkResponse) =>
  bookmark.evidence.segments.length > 0;

const pinTime = (bookmark: BookmarkResponse) =>
  bookmark.anchor.kind === "live"
    ? formatTalkTime(bookmark.anchor.markedAtMs)
    : `${formatTalkTime(bookmark.requestedRange.startMs)} – ${formatTalkTime(bookmark.requestedRange.endMs)}`;

const NoteCard = ({ bookmark }: { bookmark: BookmarkResponse }) => {
  const clip = isClip(bookmark);
  const quote = bookmark.evidence.segments.map(({ text }) => text).join(" ");
  return (
    <article className="flex flex-col gap-2.5 rounded-xl border bg-card p-4">
      <div>
        <Badge variant="secondary" className="gap-1.5 tabular-nums">
          {clip ? (
            <ScissorsIcon aria-hidden="true" />
          ) : (
            <SquarePenIcon aria-hidden="true" />
          )}
          {clip ? pinTime(bookmark) : `Note · ${pinTime(bookmark)}`}
        </Badge>
      </div>
      {clip ? (
        <blockquote className="text-[15px] leading-relaxed text-muted-foreground">
          “{quote}”
        </blockquote>
      ) : null}
      {bookmark.note ? (
        <p
          className={
            clip
              ? "border-t pt-2.5 text-[15px] leading-relaxed"
              : "text-base leading-relaxed whitespace-pre-wrap"
          }
        >
          {bookmark.note}
        </p>
      ) : null}
    </article>
  );
};

const EMPTY = {
  all: [
    "No notes yet",
    "Tap New note to save a thought pinned to this moment.",
  ],
  clips: [
    "No clips yet",
    "Clips of what was said arrive once live captions start.",
  ],
  notes: [
    "No notes yet",
    "Tap New note to save a thought pinned to this moment.",
  ],
} as const;

const List = ({
  bookmarks,
  filter,
}: {
  bookmarks: BookmarkResponse[];
  filter: keyof typeof EMPTY;
}) => {
  if (bookmarks.length === 0) {
    const [title, description] = EMPTY[filter];
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {bookmarks.map((bookmark) => (
        <NoteCard key={bookmark.id} bookmark={bookmark} />
      ))}
    </div>
  );
};

/** The attendee's private notes and clips, filterable like the design's tabs. */
export const NotesList = ({
  bookmarks: unordered,
}: {
  bookmarks: BookmarkResponse[];
}) => {
  const bookmarks = newestFirst(unordered);
  const clips = bookmarks.filter(isClip);
  const notes = bookmarks.filter((bookmark) => !isClip(bookmark));
  return (
    <Tabs defaultValue="all" className="flex flex-col gap-3">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="all">All {bookmarks.length}</TabsTrigger>
        <TabsTrigger value="clips">Clips {clips.length}</TabsTrigger>
        <TabsTrigger value="notes">Notes {notes.length}</TabsTrigger>
      </TabsList>
      <TabsContent value="all">
        <List bookmarks={bookmarks} filter="all" />
      </TabsContent>
      <TabsContent value="clips">
        <List bookmarks={clips} filter="clips" />
      </TabsContent>
      <TabsContent value="notes">
        <List bookmarks={notes} filter="notes" />
      </TabsContent>
    </Tabs>
  );
};
