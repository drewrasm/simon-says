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
import { CopyIcon, MonitorIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

type ShareCardProps = {
  /** Absolute join URL; null until the browser knows its origin. */
  joinUrl: string | null;
  title: string;
  description: string;
  headingId: string;
};

const shortUrl = (url: string) => url.replace(/^https?:\/\//, "");

/** Invitation QR and link, with copy and a large on-screen QR for projectors. */
export const ShareCard = ({
  joinUrl,
  title,
  description,
  headingId,
}: ShareCardProps) => {
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
    <section aria-labelledby={headingId}>
      <Card>
        <CardHeader>
          <CardTitle id={headingId}>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="shrink-0 rounded-lg border bg-white p-2.5">
              {joinUrl ? (
                <QRCodeSVG
                  value={joinUrl}
                  size={128}
                  marginSize={0}
                  role="img"
                  aria-label="QR code for the join link"
                />
              ) : (
                <Skeleton className="size-32" />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Join link
              </span>
              {joinUrl ? (
                <a
                  href={joinUrl}
                  className="text-sm break-all underline underline-offset-3"
                >
                  {shortUrl(joinUrl)}
                </a>
              ) : (
                <Skeleton className="h-5 w-56" />
              )}
              <p className="text-sm text-muted-foreground">
                Guests scan the code or open the link. No account or microphone
                needed.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!joinUrl}
              onClick={() => void copyJoinLink()}
            >
              <CopyIcon data-icon="inline-start" />
              Copy link
            </Button>
            <Dialog>
              <DialogTrigger
                render={<Button variant="outline" disabled={!joinUrl} />}
              >
                <MonitorIcon data-icon="inline-start" />
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
                    <p className="text-center text-lg font-semibold break-all">
                      {shortUrl(joinUrl)}
                    </p>
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
