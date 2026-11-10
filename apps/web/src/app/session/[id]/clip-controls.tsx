"use client";

import { Alert, AlertDescription } from "@simon-says/ui/components/alert";
import { Button } from "@simon-says/ui/components/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@simon-says/ui/components/drawer";
import { Field, FieldLabel } from "@simon-says/ui/components/field";
import { Textarea } from "@simon-says/ui/components/textarea";
import { CopyIcon, PlusIcon, ScissorsIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useClipState } from "./clip-context";
import {
  clipLabel,
  clipQuote,
  extendSelection,
  selectedLines,
  type ClipLine,
} from "./clip-line";
import { NOTE_MAX_LENGTH } from "./use-note-draft";
import { useClipSave } from "./use-clip-save";

const CLIPPED_MESSAGE = "Clipped to My notes";

type ClipSheetProps = {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Phone "Clip to notes" sheet: the selected lines as a quote, grow it by a
 * line before or after, add an optional note, and save. Like the note sheet,
 * it has no backdrop so the transcript stays readable, and it traps focus.
 */
const ClipSheet = ({ sessionId, open, onOpenChange }: ClipSheetProps) => {
  const router = useRouter();
  const { lines, selectedIds, setSelectedIds, clearSelection } = useClipState();
  const [note, setNote] = useState("");
  const { save, saving, reset, locked, lockedLines, failureMessage } =
    useClipSave({ sessionId });
  const clip: ClipLine[] = lockedLines ?? selectedLines(lines, selectedIds);
  const canGrow = (side: "before" | "after") =>
    !locked &&
    extendSelection(lines, selectedIds, side).length > selectedIds.length;

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next && !locked) reset();
  };

  const submit = async () => {
    const count = await save(clip, note.trim());
    if (count === null) return;
    setNote("");
    clearSelection();
    onOpenChange(false);
    toast.success(CLIPPED_MESSAGE);
    router.refresh();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={close}
      modal="trap-focus"
      disablePointerDismissal
    >
      <DrawerContent className="dark shadow-[0_-8px_24px_rgb(0_0_0/0.12)] data-[swipe-direction=down]:rounded-t-[20px]">
        <form
          className="mx-auto flex w-full max-w-lg flex-col gap-4 px-5 pt-2.5 pb-8"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div
            aria-hidden="true"
            className="mx-auto h-1 w-10 shrink-0 rounded-full bg-foreground/20"
          />
          <DrawerHeader className="flex-row items-start gap-3 p-0 text-left">
            <div className="flex grow flex-col gap-1">
              <DrawerTitle className="text-lg font-bold">
                Clip to notes
              </DrawerTitle>
              <DrawerDescription className="text-[13px] tabular-nums">
                {clipLabel(clip)}
              </DrawerDescription>
            </div>
            <DrawerClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  className="-mt-2 -mr-2 size-11"
                  aria-label="Close"
                />
              }
            >
              <XIcon aria-hidden="true" />
            </DrawerClose>
          </DrawerHeader>

          <blockquote className="max-h-40 overflow-y-auto rounded-lg bg-muted px-3.5 py-3 text-[15px] leading-[1.55] text-chart-1">
            “{clipQuote(clip)}”
          </blockquote>

          <div className="flex flex-wrap gap-2">
            {(["before", "after"] as const).map((side) => (
              <Button
                key={side}
                type="button"
                variant="outline"
                size="lg"
                className="rounded-full bg-transparent px-3 text-[13px] dark:bg-transparent"
                disabled={!canGrow(side)}
                onClick={() =>
                  setSelectedIds(extendSelection(lines, selectedIds, side))
                }
              >
                <PlusIcon data-icon="inline-start" />
                Line {side}
              </Button>
            ))}
          </div>

          <Field>
            <FieldLabel htmlFor="clip-note">
              Add a note{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </FieldLabel>
            <Textarea
              id="clip-note"
              rows={3}
              value={note}
              disabled={locked}
              maxLength={NOTE_MAX_LENGTH}
              placeholder="Why this matters to you…"
              onChange={(event) => setNote(event.target.value)}
              className="resize-none text-base"
            />
          </Field>

          {failureMessage ? (
            <Alert variant="destructive">
              <AlertDescription>{failureMessage}</AlertDescription>
            </Alert>
          ) : null}

          <DrawerFooter className="mt-1 grid grid-cols-2 gap-2.5 p-0">
            <DrawerClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12 text-[15px]"
                />
              }
            >
              Cancel
            </DrawerClose>
            <Button
              type="submit"
              size="lg"
              className="h-12 text-[15px] font-semibold"
              disabled={saving || clip.length === 0}
            >
              <ScissorsIcon data-icon="inline-start" />
              {saving ? "Saving…" : "Save clip"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
};

/**
 * Floating bar shown while transcript lines are selected: Clear, Copy, and
 * Clip to notes. On wide screens Clip saves straight to the notes panel; on
 * phones it opens the clip sheet to adjust the lines and add a note.
 */
export const ClipControls = ({ sessionId }: { sessionId: string }) => {
  const router = useRouter();
  const { lines, selectedIds, clearSelection } = useClipState();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { save, saving, failureMessage } = useClipSave({ sessionId });
  const selection = selectedLines(lines, selectedIds);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(clipQuote(selection));
    } catch {
      toast.error("Couldn't copy. Your browser blocked the clipboard.");
      return;
    }
    clearSelection();
    toast.success("Copied to clipboard");
  };

  const clipNow = async () => {
    const count = await save(selection, "", { finishLocked: false });
    if (count === null) return;
    clearSelection();
    toast.success(CLIPPED_MESSAGE);
    router.refresh();
  };

  const label =
    selection.length === 1
      ? "1 line selected"
      : `${selection.length} lines selected`;

  return (
    <>
      {selection.length > 0 ? (
        <div
          role="toolbar"
          aria-label="Selected lines"
          className="dark fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-xl flex-col gap-2 lg:bottom-6 lg:w-fit"
        >
          {failureMessage ? (
            <Alert variant="destructive" className="hidden lg:grid">
              <AlertDescription>{failureMessage}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex items-center gap-1.5 rounded-[14px] border bg-muted py-1.5 pr-1.5 pl-4 text-foreground shadow-[0_12px_32px_rgb(0_0_0/0.45)]">
            <span
              aria-live="polite"
              className="mr-2 grow text-sm font-medium whitespace-nowrap tabular-nums"
            >
              {label}
            </span>
            <Button
              type="button"
              variant="ghost"
              className="h-11 text-primary lg:h-8"
              onClick={clearSelection}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 bg-transparent lg:h-8 dark:bg-transparent"
              onClick={() => void copy()}
            >
              <CopyIcon data-icon="inline-start" />
              Copy
            </Button>
            <Button
              type="button"
              className="h-11 px-3 font-semibold lg:hidden"
              onClick={() => setSheetOpen(true)}
            >
              <ScissorsIcon data-icon="inline-start" />
              Clip
            </Button>
            <Button
              type="button"
              className="hidden px-3 font-semibold lg:inline-flex"
              disabled={saving}
              onClick={() => void clipNow()}
            >
              <ScissorsIcon data-icon="inline-start" />
              {saving ? "Clipping…" : "Clip to notes"}
            </Button>
          </div>
        </div>
      ) : null}
      <ClipSheet
        sessionId={sessionId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
};
