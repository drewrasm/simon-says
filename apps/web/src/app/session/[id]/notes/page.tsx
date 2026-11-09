import { buttonVariants } from "@simon-says/ui/components/button";
import { ChevronLeftIcon, MonitorSmartphoneIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessError } from "@/server/access/errors";
import { requireMembership } from "@/server/access/membership";
import { readPrincipal } from "@/server/access/principal";
import { listBookmarks } from "@/server/bookmarks/service";
import { NoteComposer } from "../note-composer";
import { NotJoined } from "../not-joined";
import { sessionElapsedMs } from "../talk-time";
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
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 pt-8 sm:px-6">
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
        <div className="flex min-w-0 flex-col">
          <h1 className="text-lg font-bold">My notes</h1>
          <span className="truncate text-xs text-muted-foreground">
            {session.title ?? "Live session"}
          </span>
        </div>
      </header>

      <section
        aria-label="Where notes are kept"
        className="flex gap-2.5 rounded-xl border bg-muted p-3.5"
      >
        <MonitorSmartphoneIcon
          aria-hidden="true"
          className="mt-0.5 size-4.5 shrink-0"
        />
        <div className="flex flex-col gap-0.5 text-sm">
          <span className="font-semibold">Only you can see these</span>
          <span className="text-muted-foreground">
            Notes are tied to this browser. Clearing its cookies or switching
            devices loses access to them.
          </span>
        </div>
      </section>

      <div className="flex-1">
        <NotesList bookmarks={bookmarks} />
      </div>

      <div className="sticky bottom-0 -mx-4 border-t bg-background px-4 py-3 sm:-mx-6 sm:px-6">
        <NoteComposer
          sessionId={id}
          elapsedAtRenderMs={sessionElapsedMs(session.createdAt)}
          triggerLabel="New note"
          triggerClassName="w-full"
          afterSave="refresh"
        />
      </div>
    </main>
  );
};

export default NotesPage;
