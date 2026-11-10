import { cn } from "cn";

const BAR_HEIGHTS = [5, 9, 12, 7, 4] as const;
const LARGE_BAR_HEIGHTS = [
  6, 9, 12, 16, 18, 14, 11, 15, 18, 13, 9, 7, 10, 14, 12, 8, 5, 4, 4, 4,
] as const;

type LevelMeterProps = {
  /** Number of lit bars, 0 to 5. */
  level: number;
  label: string;
  /** "lg" is the 20-bar lobby meter; each level lights four of its bars. */
  size?: "sm" | "lg";
  className?: string;
};

/** Microphone input meter. The label carries the meaning for screen readers. */
export const LevelMeter = ({
  level,
  label,
  size = "sm",
  className,
}: LevelMeterProps) => {
  const large = size === "lg";
  const heights = large ? LARGE_BAR_HEIGHTS : BAR_HEIGHTS;
  const litBars = (level * heights.length) / BAR_HEIGHTS.length;

  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-end",
        large ? "h-[18px] gap-[3px]" : "h-3 gap-0.5",
        className,
      )}
    >
      {heights.map((height, index) => (
        <span
          key={index}
          className={cn(
            large ? "w-1 rounded-[2px]" : "w-0.5 rounded-[1px]",
            index < litBars ? "bg-success" : large ? "bg-border" : "bg-chart-1",
          )}
          style={{ height }}
        />
      ))}
    </span>
  );
};
