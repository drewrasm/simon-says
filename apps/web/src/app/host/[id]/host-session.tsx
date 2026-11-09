"use client";

import type { SessionStatus } from "@simon-says/contracts/session";
import { Button } from "@simon-says/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@simon-says/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@simon-says/ui/components/empty";
import { Skeleton } from "@simon-says/ui/components/skeleton";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { BrandMark } from "../../../components/brand-mark";
import { SessionStatusBadge } from "../../../components/session-status-badge";
import { clearHostFragment } from "./host-fragment";

const subscribeNever = () => () => {};
const readOrigin = () => window.location.origin;
const readNoOrigin = () => null;

type HostSessionProps = {
  title: string | null;
  status: SessionStatus;
  joinPath: string;
};

/** Host screen: the invitation QR and link attendees use to join. */
export const HostSession = ({ title, status, joinPath }: HostSessionProps) => {
  // The QR must encode the origin attendees reach, which only the browser knows.
  const origin = useSyncExternalStore(subscribeNever, readOrigin, readNoOrigin);
  const joinUrl = origin ? `${origin}${joinPath}` : null;

  useEffect(clearHostFragment, []);

  const copyJoinLink = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      toast.success("Join link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <BrandMark />
        <SessionStatusBadge status={status} />
      </header>

      <h1 className="text-3xl font-semibold tracking-tight">
        {title ?? "Your session"}
      </h1>

      <section aria-labelledby="invite-heading">
        <Card>
          <CardHeader>
            <CardTitle id="invite-heading">Invite attendees</CardTitle>
            <CardDescription>
              Show this screen. Attendees scan the code or open the link on
              their own device; they never need a microphone.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <div className="rounded-lg bg-white p-3">
              {joinUrl ? (
                <QRCodeSVG
                  value={joinUrl}
                  size={208}
                  marginSize={0}
                  role="img"
                  aria-label="QR code for the join link"
                />
              ) : (
                <Skeleton className="size-52" />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              <span className="text-xs font-medium text-muted-foreground">
                Join link
              </span>
              {joinUrl ? (
                <a
                  href={joinUrl}
                  className="text-sm break-all underline underline-offset-3"
                >
                  {joinUrl.replace(/^https?:\/\//, "")}
                </a>
              ) : (
                <Skeleton className="h-5 w-64" />
              )}
              <div>
                <Button
                  variant="outline"
                  disabled={!joinUrl}
                  onClick={() => void copyJoinLink()}
                >
                  Copy join link
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="captions-heading">
        <h2 id="captions-heading" className="sr-only">
          Captions
        </h2>
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No captions yet</EmptyTitle>
            <EmptyDescription>
              Live capture isn&apos;t connected yet. Attendees who join now will
              see captions once it is.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    </main>
  );
};
