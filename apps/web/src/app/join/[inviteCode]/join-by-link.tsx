"use client";

import { Alert, AlertDescription } from "@simon-says/ui/components/alert";
import { Button } from "@simon-says/ui/components/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestJoin, type JoinResult } from "../request-join";

const FAILURE_MESSAGE: Record<Exclude<JoinResult["kind"], "joined">, string> = {
  not_found: "This invitation isn't valid, or the session has ended.",
  already_host:
    "This device is already the host of this session. Open the host page from your host link instead.",
  error: "Couldn't join. Check your connection and try again.",
};

type JoinByLinkProps = { inviteCode: string };

/** Explicit join button: link previews and prefetchers must not create memberships. */
export const JoinByLink = ({ inviteCode }: JoinByLinkProps) => {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [failure, setFailure] = useState<keyof typeof FAILURE_MESSAGE | null>(
    null,
  );

  const join = async () => {
    setJoining(true);
    setFailure(null);
    const result = await requestJoin({ inviteCode });
    if (result.kind === "joined") {
      router.push(`/session/${result.sessionId}`);
      return;
    }
    setFailure(result.kind);
    setJoining(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button size="lg" disabled={joining} onClick={() => void join()}>
          {joining ? "Joining…" : "Join session"}
        </Button>
      </div>
      {failure ? (
        <Alert variant="destructive">
          <AlertDescription>{FAILURE_MESSAGE[failure]}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
};
