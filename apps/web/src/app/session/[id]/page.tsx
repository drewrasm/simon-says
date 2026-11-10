import type { Metadata } from "next";
import { AccessError } from "@/server/access/errors";
import { requireMembership } from "@/server/access/membership";
import { readPrincipal } from "@/server/access/principal";
import { listBookmarks } from "@/server/bookmarks/service";
import { ClipProvider } from "./clip-context";
import { ClipControls } from "./clip-controls";
import { ClipReader } from "./clip-reader";
import { KeepThatButton } from "./keep-that-button";
import { NoteComposer } from "./note-composer";
import { NoteForm } from "./note-form";
import { NotesPanel } from "./notes/notes-panel";
import { NotJoined } from "./not-joined";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live captions · Simon Says" };

type SessionPageProps = { params: Promise<{ id: string }> };

const SessionPage = async ({ params }: SessionPageProps) => {
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
  const { bookmarks: notes } = await listBookmarks({
    principalId: membership.principalId,
    sessionId: id,
  });

  const title = session.title ?? "Live session";
  // ClipProvider carries the reader's finalized lines and selection to the
  // clip and note controls; until the reader reports them they wait honestly.
  return (
    <ClipProvider>
      <ClipReader
        sessionId={id}
        title={session.title}
        status={session.status}
        noteCount={notes.length}
        toolbarActions={
          <KeepThatButton
            sessionId={id}
            variant="outline"
            className="hidden lg:inline-flex"
          />
        }
        notesPanel={
          <NotesPanel
            sessionId={id}
            title={title}
            bookmarks={notes}
            form={<NoteForm sessionId={id} />}
          />
        }
        actions={
          <>
            <KeepThatButton sessionId={id} short className="h-11 px-3" />
            <NoteComposer
              sessionId={id}
              triggerLabel="Note"
              triggerClassName="h-11 px-3"
              afterSave="open-notes"
            />
          </>
        }
      />
      <ClipControls sessionId={id} />
    </ClipProvider>
  );
};

export default SessionPage;
