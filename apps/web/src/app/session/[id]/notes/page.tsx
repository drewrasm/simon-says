import { buttonVariants } from "@simon-says/ui/components/button";
import { ChevronLeftIcon, ChevronRightIcon, LockIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessError } from "@/server/access/errors";
import { requireMembership } from "@/server/access/membership";
import { readPrincipal } from "@/server/access/principal";
import { listBookmarks } from "@/server/bookmarks/service";
import { NoteComposer } from "../note-composer";
import { NotJoined } from "../not-joined";
import { NotesExportActions } from "./note-card-actions";
import { NotesList } from "./notes-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My notes · Simon Says" };

type NotesPageProps = { params: Promise<{ id: string }> };

const NotesPage = async ({ params }: NotesPageProps) => {
  const { id } = await params;
  const principal = await readPrincipal();

  let membership;
  try {
    membership = await requireMembership({
      sessionId: id,
      principalId: principal?.id,
    });
  } catch (error) {
    if (error instanceof AccessError) return <NotJoined />;
    throw error;
  }
  const { session } = membership;
  const { bookmarks } = await listBookmarks({
    principalId: membership.principalId,
    sessionId: id,
  });

  return (
    <main className="dark mx-auto flex min-h-screen max-w-3xl flex-col gap-4 bg-background px-4 pt-8 text-foreground sm:px-6">
      <header className="flex items-center gap-1">
        <Link
          href={`/session/${id}`}
          aria-label="Back to captions"
          className={buttonVariants({
            variant: "ghost",
            size: "icon-lg",
            className: "size-11",
          })}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Link>
        <div className="flex min-w-0 grow flex-col">
          <h1 className="text-lg font-bold">My notes</h1>
          <span className="truncate text-xs text-muted-foreground">
            {session.title ?? "Live session"}
          </span>
        </div>
      </header>

      <NotesExportActions
        title={session.title ?? "Live session"}
        bookmarks={bookmarks}
      />

      {session.status === "live" ? (
        <Link
          href={`/session/${id}`}
          className="flex min-h-11 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm"
        >
          <span
            aria-hidden="true"
            className="size-2 shrink-0 animate-pulse rounded-full bg-destructive"
          />
          <span className="grow font-semibold">Session is still live</span>
          <span className="flex items-center gap-0.5 text-muted-foreground">
            Return
            <ChevronRightIcon aria-hidden="true" className="size-4" />
          </span>
        </Link>
      ) : null}

      <div className="flex-1">
        <NotesList bookmarks={bookmarks} showJump />
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LockIcon aria-hidden="true" className="size-3.5" />
        Private to you on this device.
      </p>

      <div className="sticky bottom-0 -mx-4 border-t bg-background px-4 py-3 sm:-mx-6 sm:px-6">
        <NoteComposer
          sessionId={id}
          triggerLabel="New note"
          triggerClassName="h-11 w-full"
          afterSave="refresh"
        />
      </div>
    </main>
  );
};

export default NotesPage;
