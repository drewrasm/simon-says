"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ScreenShare } from "./screen-share";

export const useScreenShare = (sessionId: string, enabled: boolean) => {
  const share = useMemo(() => new ScreenShare(sessionId), [sessionId]);
  const health = useSyncExternalStore(
    share.subscribe,
    share.getSnapshot,
    share.getServerSnapshot,
  );

  useEffect(() => {
    if (!enabled) share.stop();
    return share.stop;
  }, [share, enabled]);

  return { health, start: share.start, stop: share.stop };
};
