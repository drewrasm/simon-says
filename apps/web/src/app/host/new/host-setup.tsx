"use client";

import {
  createSessionRequestSchema,
  createSessionResponseSchema,
} from "@simon-says/contracts/session";
import { Alert, AlertDescription } from "@simon-says/ui/components/alert";
import { Button, buttonVariants } from "@simon-says/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@simon-says/ui/components/field";
import { Input } from "@simon-says/ui/components/input";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { BrandMark } from "../../../components/brand-mark";

const TITLE_MAX_LENGTH = 120;

/** Creates the session, then opens the host page; `hostPath` carries the host token in its fragment. */
const createSession = async (title: string) => {
  const request = createSessionRequestSchema.parse({
    title: title.trim() || undefined,
  });
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (response.status !== 201) throw new Error("Session was not created.");
  return createSessionResponseSchema.parse(await response.json());
};

export const HostSetup = () => {
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setCreateFailed(false);
    try {
      const { hostPath } = await createSession(title);
      // A full navigation keeps the #token fragment for the host page to read.
      window.location.assign(hostPath);
    } catch {
      setCreateFailed(true);
      setCreating(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-sidebar">
      <header className="flex items-center border-b bg-background px-6 py-3">
        <Link href="/" className="rounded-md">
          <BrandMark />
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-[1200px] flex-wrap items-start gap-6 px-6 pt-7 pb-10">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <div className="mb-1 flex flex-col gap-1">
            <h1 className="text-[26px] leading-[1.2] font-bold">New session</h1>
            <p className="text-sm text-muted-foreground">
              Name the talk, then open the lobby. You&apos;ll test the
              microphone there before going live.
            </p>
          </div>

          <form
            onSubmit={(event) => void submit(event)}
            className="flex flex-col gap-4"
          >
            <section
              aria-labelledby="details-heading"
              className="flex flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground shadow-xs"
            >
              <h2 id="details-heading" className="text-base font-semibold">
                Details
              </h2>
              <Field>
                <FieldLabel htmlFor="session-title">
                  Session title (optional)
                </FieldLabel>
                <Input
                  id="session-title"
                  value={title}
                  maxLength={TITLE_MAX_LENGTH}
                  placeholder="e.g. Opening Keynote"
                  className="h-9 shadow-xs"
                  onChange={(event) => setTitle(event.target.value)}
                />
                <FieldDescription>
                  Guests see this when they join. Up to {TITLE_MAX_LENGTH}{" "}
                  characters.
                </FieldDescription>
              </Field>
            </section>

            {createFailed ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Couldn&apos;t create the session. Check your connection and
                  try again.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Link
                href="/"
                className={buttonVariants({
                  variant: "ghost",
                  size: "lg",
                  className: "px-3.5",
                })}
              >
                Cancel
              </Link>
              <Button
                type="submit"
                size="lg"
                className="px-3.5"
                disabled={creating}
              >
                {creating ? "Opening lobby…" : "Create & open lobby"}
                <ArrowRightIcon aria-hidden="true" className="size-[15px]" />
              </Button>
            </div>
          </form>
        </div>

        <aside
          aria-labelledby="preview-heading"
          className="flex flex-[1_1_320px] flex-col gap-3.5 rounded-xl border bg-card p-5 text-card-foreground shadow-xs lg:sticky lg:top-6"
        >
          <div className="flex flex-col gap-1">
            <h2 id="preview-heading" className="text-base font-semibold">
              What guests will see
            </h2>
            <p className="text-[13px] text-muted-foreground">
              Updates as you type
            </p>
          </div>
          <div className="dark mx-auto flex h-[300px] w-[220px] flex-col gap-2.5 overflow-hidden rounded-3xl border-[6px] border-muted bg-background px-3.5 py-[18px] text-foreground">
            <span className="inline-flex h-4 items-center gap-1 self-start rounded-full bg-live/16 px-1.5 text-[9px] font-semibold tracking-[0.04em] text-live-foreground">
              <span
                aria-hidden="true"
                className="size-[5px] rounded-full bg-current"
              />
              STARTING SOON
            </span>
            <p className="text-sm leading-tight font-bold break-words">
              {title.trim() || "Your session"}
            </p>
            <div aria-hidden="true" className="mt-auto flex flex-col gap-1.5">
              <span className="h-2 w-[90%] rounded bg-white/12" />
              <span className="h-2 w-3/4 rounded bg-white/12" />
              <span className="h-2.5 w-[95%] rounded bg-white/30" />
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
};
