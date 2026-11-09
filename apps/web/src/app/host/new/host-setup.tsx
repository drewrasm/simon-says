"use client";

import {
  createSessionRequestSchema,
  createSessionResponseSchema,
} from "@simon-says/contracts/session";
import { Alert, AlertDescription } from "@simon-says/ui/components/alert";
import { Button, buttonVariants } from "@simon-says/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@simon-says/ui/components/card";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@simon-says/ui/components/field";
import { Input } from "@simon-says/ui/components/input";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { BrandMark } from "../../../components/brand-mark";
import { SessionStatusBadge } from "../../../components/session-status-badge";

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
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center px-4 py-3 sm:px-6">
          <Link href="/" className="rounded-md">
            <BrandMark />
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-semibold tracking-tight">
              New session
            </h1>
            <p className="text-muted-foreground">
              Name the talk, then open the lobby. You&apos;ll test the
              microphone there before going live.
            </p>
          </div>

          <form
            onSubmit={(event) => void submit(event)}
            className="flex flex-col gap-6"
          >
            <section aria-labelledby="details-heading">
              <Card>
                <CardHeader>
                  <CardTitle id="details-heading">Details</CardTitle>
                  <CardDescription>
                    Guests see this when they join.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Field>
                    <FieldLabel htmlFor="session-title">
                      Session title (optional)
                    </FieldLabel>
                    <Input
                      id="session-title"
                      value={title}
                      maxLength={TITLE_MAX_LENGTH}
                      placeholder="e.g. Scaling caption pipelines"
                      onChange={(event) => setTitle(event.target.value)}
                    />
                    <FieldDescription>
                      Up to {TITLE_MAX_LENGTH} characters.
                    </FieldDescription>
                  </Field>
                </CardContent>
              </Card>
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
              <Link href="/" className={buttonVariants({ variant: "ghost" })}>
                Cancel
              </Link>
              <Button type="submit" size="lg" disabled={creating}>
                {creating ? "Opening lobby…" : "Open lobby"}
              </Button>
            </div>
          </form>
        </div>

        <aside
          aria-labelledby="preview-heading"
          className="flex flex-col gap-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="preview-heading" className="text-sm font-semibold">
              What guests will see
            </h2>
            <span className="text-xs text-muted-foreground">
              Updates as you type
            </span>
          </div>
          <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-5">
            <div className="flex items-center justify-between gap-2">
              <BrandMark className="text-sm" />
              <SessionStatusBadge status="setup" />
            </div>
            <p className="text-xl font-semibold tracking-tight break-words">
              {title.trim() || "Your session"}
            </p>
            <p className="text-sm text-muted-foreground">
              Captions appear here once you go live.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
};
