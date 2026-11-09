import type { Metadata } from "next";
import { Foundations } from "./foundations";
import { Showcase } from "./showcase";

export const metadata: Metadata = {
  title: "Design system · Simon Says",
  robots: { index: false },
};

const DesignSystemPage = () => (
  <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-12 sm:px-6">
    <header className="flex flex-col gap-2">
      <h1 className="text-3xl font-bold">Design system</h1>
      <p className="max-w-2xl text-muted-foreground">
        shadcn/ui on Base UI (base-nova, mauve, Raleway). Reference only; see
        docs/design-system.md for usage rules.
      </p>
    </header>
    <Foundations />
    <Showcase />
  </main>
);

export default DesignSystemPage;
