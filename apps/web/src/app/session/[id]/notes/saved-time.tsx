"use client";

import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

/**
 * The wall-clock time a note was saved, in the viewer's own timezone. The
 * server can't know that timezone, so it renders nothing until hydration.
 */
export const SavedTime = ({ iso }: { iso: string }) => {
  const inBrowser = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  return (
    <time dateTime={iso}>
      {inBrowser
        ? new Date(iso).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })
        : null}
    </time>
  );
};
