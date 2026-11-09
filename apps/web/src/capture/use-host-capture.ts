"use client";

import { useSyncExternalStore } from "react";
import type { HostCapture } from "./host-capture";

/** Passive adapter: the host owns the instance and explicit start/stop gestures. */
export function useHostCapture(capture: HostCapture) {
  return useSyncExternalStore(
    capture.subscribe,
    capture.getSnapshot,
    capture.getSnapshot,
  );
}
