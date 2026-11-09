import type { SessionStatus } from "@simon-says/contracts/session";
import { Badge } from "@simon-says/ui/components/badge";
import { LiveBadge } from "./live-badge";

const LABEL: Record<Exclude<SessionStatus, "live">, string> = {
  setup: "Not live yet",
  degraded: "Captions delayed",
  ended: "Ended",
  expired: "Expired",
};

/** Session status as a badge; "live" uses the red live pill. */
export const SessionStatusBadge = ({ status }: { status: SessionStatus }) =>
  status === "live" ? (
    <LiveBadge />
  ) : (
    <Badge variant="outline">{LABEL[status]}</Badge>
  );
