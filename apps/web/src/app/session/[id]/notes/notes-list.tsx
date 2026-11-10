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
import {
  ClockIcon,
  PencilIcon,
  ScissorsIcon,
  SquarePenIcon,
} from "lucide-react";
import { cn } from "cn";
import Link from "next/link";
import { isUnpinned } from "../talk-time";
import { AddNoteInline, RemoveCardButton } from "./note-card-actions";
import { momentLabel, quoteText } from "./notes-entries";
import { SavedTime } from "./saved-time";

/** Newest first, by creation time then ID, so the list order is stable. */
export const newestFirst = (bookmarks: BookmarkResponse[]) =>
  [...bookmarks].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );

/**
 * A clip quotes captured speech: a selected line, a Keep that mark, or a
 * pinned note whose moment has resolved to captions. A note is the
 * attendee's own words only.
 */
export const isClip = (bookmark: BookmarkResponse) =>
  bookmark.anchor.kind === "paragraph" ||
  bookmark.evidence.segments.length > 0 ||
  (bookmark.note === null && !isUnpinned(bookmark));

/**
 * A note can be added once a clip's captions have resolved. A pending Keep that
 * mark with a note would look exactly like a pinned note (same live anchor and
 * range), so it would jump to the Notes tab and lose its pending state.
 */
export const canAddNote = (bookmark: BookmarkResponse) =>
  bookmark.note === null &&
  (bookmark.anchor.kind === "paragraph" ||
    bookmark.evidence.segments.length > 0);

/** Where to jump back to in the transcript, read by the caption reader. */
export const momentHref = (bookmark: BookmarkResponse) =>
  `/session/${bookmark.sessionId}#t=${Math.floor(bookmark.requestedRange.startMs)}`;

const EvidenceState = ({ bookmark }: { bookmark: BookmarkResponse }) => {
  if (bookmark.evidence.segments.length === 0) {
    return bookmark.completeness === "pending" ? (
      <p className="text-sm text-muted-foreground">
        Waiting for the captions from this moment…
      </p>
    ) : null;
  }
  return bookmark.completeness === "incomplete" ? (
    <p className="text-xs text-muted-foreground">
      Part of this moment wasn&apos;t captioned.
    </p>
  ) : null;
};

type NoteCardProps = { bookmark: BookmarkResponse; showJump: boolean };

const NoteCard = ({ bookmark, showJump }: NoteCardProps) => {
  const clip = isClip(bookmark);
  const quote = quoteText(bookmark);
  const unpinned = isUnpinned(bookmark);
  return (
    <article
      className={cn(
        "flex flex-col gap-2.5 rounded-[14px] border p-3.5",
        // The page sits on the background; the desktop panel is already a card.
        showJump ? "bg-card" : "bg-background/60",
      )}
    >
      <div className="flex items-center gap-2">
        <Badge
          variant="secondary"
          className="h-6 gap-1.5 px-2 text-primary tabular-nums lg:h-[22px]"
        >
          {clip ? (
            <ScissorsIcon aria-hidden="true" />
          ) : (
            <SquarePenIcon aria-hidden="true" />
          )}
          {clip ? (
            momentLabel(bookmark)
          ) : unpinned ? (
            <>
              Note · <SavedTime iso={bookmark.createdAt} />
            </>
          ) : (
            `Note · ${momentLabel(bookmark)}`
          )}
        </Badge>
        <span className="grow" />
        <RemoveCardButton
          bookmarkId={bookmark.id}
          label={clip ? "Remove clip" : "Remove note"}
        />
      </div>
      {quote ? (
        <blockquote className="text-[15px] leading-[1.55] text-foreground/80 lg:text-sm lg:leading-[1.6]">
          “{quote}”
        </blockquote>
      ) : null}
      {clip ? <EvidenceState bookmark={bookmark} /> : null}
      {bookmark.note && clip ? (
        <p className="flex gap-2 border-t pt-2.5 text-[15px] leading-normal lg:text-sm">
          <PencilIcon
            aria-hidden="true"
            className="mt-1 size-3.5 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 whitespace-pre-line">{bookmark.note}</span>
        </p>
      ) : bookmark.note ? (
        <p className="text-base leading-normal whitespace-pre-line lg:text-[15px] lg:leading-[1.55]">
          {bookmark.note}
        </p>
      ) : canAddNote(bookmark) ? (
        <AddNoteInline bookmark={bookmark} />
      ) : null}
      {showJump && !unpinned ? (
        <Link
          href={momentHref(bookmark)}
          className="-mb-2 flex min-h-9 items-center gap-1.5 self-start text-[13px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ClockIcon aria-hidden="true" className="size-3.5" />
          Jump to this moment
        </Link>
      ) : null}
    </article>
  );
};

const TAB_CLASS =
  "h-full rounded-md data-active:font-semibold dark:data-active:border-transparent dark:data-active:bg-background";

const EMPTY = {
  all: [
    "Nothing saved yet",
    "Write a note, select lines in the transcript, or press Clip last 30s when something is worth keeping.",
  ],
  clips: [
    "No clips yet",
    "Select lines in the transcript, or press Clip last 30s.",
  ],
  notes: ["No notes yet", "Write a note to save a private thought."],
} as const;

const List = ({
  bookmarks,
  filter,
  showJump,
}: {
  bookmarks: BookmarkResponse[];
  filter: keyof typeof EMPTY;
  showJump: boolean;
}) => {
  if (bookmarks.length === 0) {
    const [title, description] = EMPTY[filter];
    return (
      <Empty className="rounded-[14px] border">
        <EmptyHeader>
          <EmptyTitle className="font-semibold">{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {bookmarks.map((bookmark) => (
        <NoteCard key={bookmark.id} bookmark={bookmark} showJump={showJump} />
      ))}
    </div>
  );
};

/** The attendee's private notes and clips, filterable like the design's tabs. */
export const NotesList = ({
  bookmarks: unordered,
  showJump = false,
}: {
  bookmarks: BookmarkResponse[];
  /** Link each pinned card back to its moment in the transcript. */
  showJump?: boolean;
}) => {
  const bookmarks = newestFirst(unordered);
  const clips = bookmarks.filter(isClip);
  const notes = bookmarks.filter((bookmark) => !isClip(bookmark));
  return (
    <Tabs defaultValue="all" className="flex flex-col gap-3">
      <TabsList className="grid w-full grid-cols-3 gap-0.5 group-data-horizontal/tabs:h-11">
        <TabsTrigger value="all" className={TAB_CLASS}>
          All {bookmarks.length}
        </TabsTrigger>
        <TabsTrigger value="clips" className={TAB_CLASS}>
          Clips {clips.length}
        </TabsTrigger>
        <TabsTrigger value="notes" className={TAB_CLASS}>
          Notes {notes.length}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="all">
        <List bookmarks={bookmarks} filter="all" showJump={showJump} />
      </TabsContent>
      <TabsContent value="clips">
        <List bookmarks={clips} filter="clips" showJump={showJump} />
      </TabsContent>
      <TabsContent value="notes">
        <List bookmarks={notes} filter="notes" showJump={showJump} />
      </TabsContent>
    </Tabs>
  );
};
