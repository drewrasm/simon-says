import { cn } from "cn";

const COLOR_TOKENS = [
  ["background", "bg-background", "Page and card surface"],
  ["foreground", "bg-foreground", "Body text"],
  ["primary", "bg-primary", "Primary actions, brand tile"],
  ["secondary", "bg-secondary", "Secondary surfaces, interim line"],
  ["muted-foreground", "bg-muted-foreground", "Hints, timestamps, meta"],
  ["border", "bg-border", "Dividers, outlines, inputs"],
  ["ring", "bg-ring", "Focus rings, dashed placeholders"],
  ["destructive", "bg-destructive", "Errors, end session"],
  ["live", "bg-live", "Live status dot"],
  ["success", "bg-success", "Good mic level, confirmations"],
] as const;

const TYPE_SCALE = [
  [
    "Display",
    "text-5xl font-bold tracking-tight",
    "Every word, on every phone.",
  ],
  ["Page title", "text-2xl font-bold", "Get ready to go live"],
  ["Section title", "text-base font-semibold", "Invite your audience"],
  [
    "Caption",
    "text-base leading-relaxed",
    "Good morning, everyone, and thank you.",
  ],
  ["Body", "text-sm", "Guests join with this code or the QR code."],
  [
    "Meta",
    "text-xs text-muted-foreground tabular-nums",
    "00:12:04 · Main Hall",
  ],
] as const;

const RADII = [
  ["sm", "rounded-sm"],
  ["md", "rounded-md"],
  ["lg (base)", "rounded-lg"],
  ["xl", "rounded-xl"],
  ["full", "rounded-full"],
] as const;

const Swatches = ({ dark }: { dark: boolean }) => (
  <div
    className={cn(
      "grid grid-cols-2 gap-3 rounded-xl bg-background p-4 text-foreground ring-1 ring-foreground/10 sm:grid-cols-5",
      dark && "dark",
    )}
  >
    <p className="col-span-full text-sm font-semibold">
      {dark ? "Dark" : "Light"}
    </p>
    {COLOR_TOKENS.map(([name, swatch, use]) => (
      <div key={name} className="flex min-w-0 flex-col gap-1.5">
        <span
          aria-hidden="true"
          className={cn("h-12 rounded-md ring-1 ring-foreground/10", swatch)}
        />
        <code className="truncate text-xs font-medium">--{name}</code>
        <span className="text-xs text-muted-foreground">{use}</span>
      </div>
    ))}
  </div>
);

export const Foundations = () => (
  <>
    <section aria-labelledby="ds-color" className="flex flex-col gap-4">
      <h2 id="ds-color" className="text-xl font-semibold">
        Color
      </h2>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Mauve neutrals from the shadcn preset, plus app status colors for live
        and success. Use the semantic tokens, never raw OKLCH values.
      </p>
      <Swatches dark={false} />
      <Swatches dark />
    </section>

    <section aria-labelledby="ds-type" className="flex flex-col gap-4">
      <h2 id="ds-type" className="text-xl font-semibold">
        Typography
      </h2>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Raleway for everything, with lining numerals. Timestamps and counters
        use tabular numerals.
      </p>
      <dl className="flex flex-col divide-y rounded-xl ring-1 ring-foreground/10">
        {TYPE_SCALE.map(([role, classes, sample]) => (
          <div
            key={role}
            className="grid gap-1 px-4 py-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-baseline"
          >
            <dt className="text-xs text-muted-foreground">
              {role}
              <code className="block truncate">{classes}</code>
            </dt>
            <dd className={classes}>{sample}</dd>
          </div>
        ))}
      </dl>
    </section>

    <section aria-labelledby="ds-radius" className="flex flex-col gap-4">
      <h2 id="ds-radius" className="text-xl font-semibold">
        Radius
      </h2>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Base radius is 0.625rem. Controls use lg, cards and panels use xl, and
        pills use full.
      </p>
      <div className="flex flex-wrap gap-4">
        {RADII.map(([name, classes]) => (
          <div key={name} className="flex flex-col items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "size-16 border-2 border-primary bg-muted",
                classes,
              )}
            />
            <span className="text-xs text-muted-foreground">{name}</span>
          </div>
        ))}
      </div>
    </section>
  </>
);
