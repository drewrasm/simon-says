import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@simon-says/ui/styles/globals.css";

export const metadata: Metadata = {
  title: "Simon Says",
  description: "One conference session feed. Personal, illustrated takeaways.",
};

type RootLayoutProps = { children: ReactNode };

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
