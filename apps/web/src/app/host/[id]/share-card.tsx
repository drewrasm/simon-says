"use client";

import { Button } from "@simon-says/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@simon-says/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@simon-says/ui/components/dialog";
import { Skeleton } from "@simon-says/ui/components/skeleton";
import { CopyIcon, PresentationIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "cn";
import { toast } from "sonner";
import { JoinCode } from "@/components/join-code";

type ShareCardProps = {
  /** Absolute join URL; null until the browser knows its origin. */
  joinUrl: string | null;
  /** Typed alternative to the link; null for sessions created before join codes. */
  joinCode: string | null;
  title: string;
  description?: string;
  headingId: string;
  /** Live-console sizing: smaller QR and code, with Show on screen as the primary action. */
  compact?: boolean;
};

const shortUrl = (url: string) => url.replace(/^https?:\/\//, "");

/** Invitation QR and link, with copy and a large on-screen QR for projectors. */
export const ShareCard = ({
  joinUrl,
  joinCode,
  title,
  description,
  headingId,
  compact = false,
}: ShareCardProps) => {
  const typedCode =
    joinUrl && joinCode ? (
      <JoinCode code={joinCode} href={new URL("/join", joinUrl).href} />
    ) : null;
  const buttonClass = cn(
    "text-sm font-medium shadow-xs",
    compact ? "h-8" : "h-9",
  );

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
    <section
      aria-labelledby={headingId}
      className={cn("min-w-0", !compact && "flex-[1_1_380px]")}
    >
      <Card
        className={cn("shadow-xs", !compact && "[--card-spacing:--spacing(6)]")}
      >
        <CardHeader>
          <CardTitle id={headingId} className="text-base font-semibold">
            {title}
          </CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div
            className={cn(
              "flex flex-wrap items-center",
              compact
                ? "gap-3.5 [&_span[aria-label]]:text-[30px] [&_a]:text-[13px]"
                : "gap-5",
            )}
          >
            <div
              className={cn(
                "shrink-0 border bg-white",
                compact
                  ? "size-26 rounded-[10px] p-1.5"
                  : "size-40 rounded-xl p-2.5",
              )}
            >
              {joinUrl ? (
                <QRCodeSVG
                  value={joinUrl}
                  size={160}
                  marginSize={0}
                  role="img"
                  aria-label="QR code for the join link"
                  className="size-full"
                />
              ) : (
                <Skeleton className="size-full" />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              {typedCode ?? (
                <>
                  <span className="text-xs font-medium text-muted-foreground">
                    Join link
                  </span>
                  {joinUrl ? (
                    <a
                      href={joinUrl}
                      className="truncate text-sm underline underline-offset-3"
                    >
                      {shortUrl(joinUrl)}
                    </a>
                  ) : (
                    <Skeleton className="h-5 w-56" />
                  )}
                </>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className={buttonClass}
              disabled={!joinUrl}
              onClick={() => void copyJoinLink()}
            >
              <CopyIcon data-icon="inline-start" />
              Copy link
            </Button>
            <Dialog>
              <DialogTrigger
                render={
                  <Button
                    variant={compact ? "default" : "outline"}
                    className={buttonClass}
                    disabled={!joinUrl}
                  />
                }
              >
                <PresentationIcon data-icon="inline-start" />
                Show on screen
              </DialogTrigger>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>Scan to read along</DialogTitle>
                  <DialogDescription>
                    Point your phone camera at the code.
                  </DialogDescription>
                </DialogHeader>
                {joinUrl ? (
                  <div className="flex flex-col items-center gap-4 py-2">
                    <div className="rounded-xl bg-white p-4">
                      <QRCodeSVG
                        value={joinUrl}
                        size={360}
                        marginSize={0}
                        role="img"
                        aria-label="Large QR code for the join link"
                        className="h-auto max-w-full"
                      />
                    </div>
                    {typedCode ? (
                      <div className="text-center">{typedCode}</div>
                    ) : (
                      <p className="text-center text-lg font-semibold break-all">
                        {shortUrl(joinUrl)}
                      </p>
                    )}
                  </div>
                ) : null}
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </section>
  );
};
