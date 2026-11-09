import { cn } from "cn";

const BAR_HEIGHTS = [5, 9, 12, 7, 4] as const;

type LevelMeterProps = {
  /** Number of lit bars, 0 to 5. */
  level: number;
  label: string;
  className?: string;
};

/** Compact microphone input meter. The label carries the meaning for screen readers. */
export const LevelMeter = ({ level, label, className }: LevelMeterProps) => (
  <span
    role="img"
    aria-label={label}
    className={cn("inline-flex h-3 items-end gap-0.5", className)}
  >
    {BAR_HEIGHTS.map((height, index) => (
      <span
        key={index}
        className={cn(
          "w-0.5 rounded-[1px]",
          index < level ? "bg-success" : "bg-chart-1",
        )}
        style={{ height }}
      />
    ))}
  </span>
);
