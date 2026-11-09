import { Badge } from "@simon-says/ui/components/badge";
import { cn } from "cn";

type LiveBadgeProps = { elapsed?: string; className?: string };

/** Red "Live" pill with a status dot and optional elapsed session time. */
export const LiveBadge = ({ elapsed, className }: LiveBadgeProps) => (
  <Badge
    className={cn(
      "h-6 gap-1.5 bg-live/10 px-2 font-semibold text-live-foreground tabular-nums",
      className,
    )}
  >
    <span aria-hidden="true" className="size-1.5 rounded-full bg-live" />
    {elapsed ? `Live · ${elapsed}` : "Live"}
  </Badge>
);
