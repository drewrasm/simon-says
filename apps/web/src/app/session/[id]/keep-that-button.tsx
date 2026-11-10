"use client";

import type { PutBookmarkRequest } from "@simon-says/contracts/bookmark";
import { Button } from "@simon-says/ui/components/button";
import { ScissorsIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { putBookmark } from "./bookmark-client";
import { useClipState } from "./clip-context";

type KeepThatButtonProps = {
  sessionId: string;
  variant?: "secondary" | "outline";
  /** Phone toolbar label: "Clip", with the duration kept for screen readers. */
  short?: boolean;
  className?: string;
};

/**
 * "Clip last 30s": the Keep that mark. It saves a live bookmark at the point
 * captions have reached, which the server turns into the previous 30 seconds.
 * Until the first finalized caption arrives there is no talk time to mark, so
 * the button waits instead of saving an unplaceable clip.
 */
export const KeepThatButton = ({
  sessionId,
  variant = "secondary",
  short = false,
  className,
}: KeepThatButtonProps) => {
  const router = useRouter();
  const hintId = useId();
  const { talkMs } = useClipState();
  const [saving, setSaving] = useState(false);

  const send = async (bookmarkId: string, request: PutBookmarkRequest) => {
    setSaving(true);
    const result = await putBookmark(bookmarkId, request);
    setSaving(false);
    if (result.kind === "saved") {
      toast.success("Clipped the last 30 seconds");
      router.refresh();
      return;
    }
    toast.error(
      result.kind === "rejected"
        ? "Couldn't clip. You may no longer have access to this session."
        : "Couldn't clip the last 30 seconds.",
      // A retry resends the same mark under the same IDs, so it can't double up.
      result.kind === "error"
        ? {
            action: {
              label: "Try again",
              onClick: () => void send(bookmarkId, request),
            },
          }
        : undefined,
    );
  };

  const keep = () => {
    if (talkMs === null) return;
    void send(crypto.randomUUID(), {
      sessionId,
      operationId: crypto.randomUUID(),
      expectedRevision: null,
      anchor: { kind: "live", markedAtMs: talkMs },
    });
  };

  const waiting = talkMs === null;
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={variant === "outline" ? "default" : "lg"}
        className={className}
        disabled={waiting || saving}
        aria-describedby={waiting ? hintId : undefined}
        onClick={keep}
      >
        <ScissorsIcon data-icon="inline-start" />
        {saving ? (
          "Clipping…"
        ) : short ? (
          <>
            Clip<span className="sr-only"> last 30s</span>
          </>
        ) : (
          "Clip last 30s"
        )}
      </Button>
      {waiting ? (
        <span id={hintId} className="sr-only">
          Available once live captions start.
        </span>
      ) : null}
    </>
  );
};
