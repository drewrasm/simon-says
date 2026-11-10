"use client";

import { Alert, AlertDescription } from "@simon-says/ui/components/alert";
import { Button } from "@simon-says/ui/components/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@simon-says/ui/components/input-otp";
import { Label } from "@simon-says/ui/components/label";
import {
  joinCodeAlphabet,
  joinCodeLength,
} from "@simon-says/contracts/session";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestJoin, type JoinResult } from "./request-join";

const NOT_JOIN_CODE_CHARACTERS = new RegExp(`[^${joinCodeAlphabet}]`, "g");
const CODE_BOX_CLASS =
  "h-14 w-full rounded-[10px] border border-input bg-foreground/4 text-[26px] font-semibold first:rounded-[10px] last:rounded-[10px] aria-invalid:border-2 aria-invalid:border-live data-[active=true]:border-2 data-[active=true]:border-primary data-[active=true]:ring-0 dark:bg-foreground/4";

/** Lowercase is accepted and uppercased. */
const JOIN_CODE_PATTERN = `^[${joinCodeAlphabet}${joinCodeAlphabet.toLowerCase()}]+$`;

const FAILURE_MESSAGE: Record<Exclude<JoinResult["kind"], "joined">, string> = {
  not_found: "That code isn't valid, or the session has ended.",
  already_host:
    "This device is already the host of this session. Open the host page from your host link instead.",
  error: "Couldn't join. Check your connection and try again.",
};

type JoinByCodeProps = { initialCode?: string };

/** Typed six-character join code, the short alternative to the invite link. */
export const JoinByCode = ({ initialCode = "" }: JoinByCodeProps) => {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [joining, setJoining] = useState(false);
  const [failure, setFailure] = useState<keyof typeof FAILURE_MESSAGE | null>(
    null,
  );

  const join = async () => {
    setJoining(true);
    setFailure(null);

    const result = await requestJoin({ joinCode: code });
    if (result.kind === "joined") {
      router.push(`/session/${result.sessionId}`);
      return;
    }

    setFailure(result.kind);
    setJoining(false);
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void join();
      }}
    >
      <Label htmlFor="join-code" className="text-sm font-medium">
        Session code
      </Label>
      <InputOTP
        id="join-code"
        containerClassName="w-full"
        maxLength={joinCodeLength}
        pattern={JOIN_CODE_PATTERN}
        pasteTransformer={(pasted) =>
          pasted.toUpperCase().replace(NOT_JOIN_CODE_CHARACTERS, "")
        }
        value={code}
        onChange={(value) => {
          setCode(value.toUpperCase());
          setFailure(null);
        }}
        disabled={joining}
        autoComplete="off"
        autoCapitalize="characters"
        inputMode="text"
      >
        <InputOTPGroup className="grid w-full grid-cols-6 gap-2">
          {Array.from({ length: joinCodeLength }, (_, index) => (
            <InputOTPSlot
              key={index}
              index={index}
              aria-invalid={failure !== null}
              className={CODE_BOX_CLASS}
            />
          ))}
        </InputOTPGroup>
      </InputOTP>
      <Button
        type="submit"
        size="lg"
        className="mt-2 h-11 w-full text-[15px] font-medium"
        disabled={joining || code.length !== joinCodeLength}
      >
        {joining ? "Joining…" : "Join session"}
      </Button>
      {failure ? (
        <Alert variant="destructive">
          <AlertDescription>{FAILURE_MESSAGE[failure]}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
};
