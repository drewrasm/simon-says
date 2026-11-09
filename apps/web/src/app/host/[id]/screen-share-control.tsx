import { Alert, AlertDescription } from "@simon-says/ui/components/alert";
import { Button } from "@simon-says/ui/components/button";
import type { ScreenHealth } from "../../../capture/screen-capture";
import { screenShareError } from "./screen-share";

const STATE: Record<ScreenHealth["screen"], string> = {
  idle: "Screen not shared",
  requesting: "Choose a screen or window…",
  live: "Sharing screen",
  stopped: "Screen sharing stopped",
  denied: "Screen access blocked",
  error: "Screen sharing failed",
};

export const ScreenShareControl = ({
  health,
  enabled,
  onStart,
  onStop,
}: {
  health: ScreenHealth;
  enabled: boolean;
  onStart: () => void;
  onStop: () => void;
}) => {
  const sharing = health.screen === "live";
  const error = screenShareError(health);
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={!enabled || health.screen === "requesting"}
        aria-describedby="screen-share-status"
        onClick={sharing ? onStop : onStart}
      >
        {sharing ? "Stop sharing" : "Share screen"}
      </Button>
      <p
        id="screen-share-status"
        role="status"
        className="text-sm text-muted-foreground"
      >
        {enabled ? STATE[health.screen] : "Start audio to share your screen"}
      </p>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
};
