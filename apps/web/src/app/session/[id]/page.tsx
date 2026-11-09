import type { Metadata } from "next";
import { AccessError } from "@/server/access/errors";
import { requireMembership } from "@/server/access/membership";
import { readPrincipal } from "@/server/access/principal";
import { listBookmarks } from "@/server/bookmarks/service";
import { CaptionReader } from "./caption-reader";
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

  return (
    <CaptionReader
      sessionId={id}
      title={session.title}
      status={session.status}
      noteCount={notes.length}
      notesPanel={
        <NotesPanel bookmarks={notes} form={<NoteForm sessionId={id} />} />
      }
      actions={
        <NoteComposer
          sessionId={id}
          triggerLabel="Note"
          afterSave="open-notes"
        />
      }
    />
  );
};

export default SessionPage;
