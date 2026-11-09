import type { Metadata } from "next";
import { Raleway } from "next/font/google";
import type { ReactNode } from "react";
import { Toaster } from "@simon-says/ui/components/sonner";
import { TooltipProvider } from "@simon-says/ui/components/tooltip";
import "@simon-says/ui/styles/globals.css";

const raleway = Raleway({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Simon Says",
  description: "One conference session feed. Personal, illustrated takeaways.",
};

type RootLayoutProps = { children: ReactNode };

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={raleway.variable}>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
