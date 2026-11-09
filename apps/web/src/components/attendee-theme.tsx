import type { Viewport } from "next";
import type { ReactNode } from "react";

/**
 * Attendee routes always read in the dark theme. The viewport color and the
 * `data-page-theme` marker (picked up by globals.css on the root element) keep
 * mobile browser chrome, overscroll, and portaled overlays dark as well, so no
 * light body color shows around the page.
 */
export const attendeeViewport: Viewport = {
  themeColor: "#0c090c",
  colorScheme: "dark",
};

export const AttendeeTheme = ({ children }: { children: ReactNode }) => (
  <div data-page-theme="dark" className="dark contents">
    {children}
  </div>
);
