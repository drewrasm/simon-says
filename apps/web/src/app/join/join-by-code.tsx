"use client";

import { Alert, AlertDescription } from "@simon-says/ui/components/alert";
import { Button } from "@simon-says/ui/components/button";
import { Field, FieldLabel } from "@simon-says/ui/components/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@simon-says/ui/components/input-otp";
import { useState } from "react";

/** Crockford base32 without I, L, O, and U; lowercase is accepted and uppercased. */
const JOIN_CODE_PATTERN = "^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]+$";
export const JOIN_CODE_LENGTH = 6;

/**
 * Typed six-character join code. Disabled until Track 3 adds `joinCode` to the
 * session contract and `POST /api/join`; the invite token in links is too long
 * to type. Wire submission through `requestJoin` once that lands.
 */
export const JoinByCode = () => {
  const [code, setCode] = useState("");
  const available = false;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => event.preventDefault()}
    >
      <Field>
        <FieldLabel htmlFor="join-code">Session code</FieldLabel>
        <InputOTP
          id="join-code"
          maxLength={JOIN_CODE_LENGTH}
          pattern={JOIN_CODE_PATTERN}
          value={code}
          onChange={(value) => setCode(value.toUpperCase())}
          disabled={!available}
          autoComplete="off"
          inputMode="text"
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} className="size-12 text-xl font-semibold" />
            <InputOTPSlot index={1} className="size-12 text-xl font-semibold" />
            <InputOTPSlot index={2} className="size-12 text-xl font-semibold" />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} className="size-12 text-xl font-semibold" />
            <InputOTPSlot index={4} className="size-12 text-xl font-semibold" />
            <InputOTPSlot index={5} className="size-12 text-xl font-semibold" />
          </InputOTPGroup>
        </InputOTP>
      </Field>
      <Button
        type="submit"
        size="lg"
        className="h-11 w-full"
        disabled={!available || code.length !== JOIN_CODE_LENGTH}
      >
        Join session
      </Button>
      <Alert>
        <AlertDescription>
          Typed codes are coming soon. For now, scan the host&apos;s QR code or
          open their join link.
        </AlertDescription>
      </Alert>
    </form>
  );
};
