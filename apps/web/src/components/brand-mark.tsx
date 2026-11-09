import { AudioLinesIcon } from "lucide-react";
import { cn } from "cn";

type BrandMarkProps = { className?: string; showName?: boolean };

/** Simon Says logo tile and wordmark used in every app header. */
export const BrandMark = ({ className, showName = true }: BrandMarkProps) => (
  <span className={cn("inline-flex items-center gap-2 font-bold", className)}>
    <span
      aria-hidden="true"
      className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"
    >
      <AudioLinesIcon className="size-4" />
    </span>
    {showName ? <span>Simon Says</span> : null}
  </span>
);
