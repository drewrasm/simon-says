import type { ReactNode } from "react";
import {
  AttendeeTheme,
  attendeeViewport,
} from "../../components/attendee-theme";

export const viewport = attendeeViewport;

export default function AttendeeLayout({ children }: { children: ReactNode }) {
  return <AttendeeTheme>{children}</AttendeeTheme>;
}
