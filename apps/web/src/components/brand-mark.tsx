import { cn } from "cn";

type MeerkatGlyphProps = { className?: string };

/**
 * The calling meerkat mark (app-icon variant from the "Meerkat Call Logo"
 * design canvas), drawn in `currentColor`. Keep in sync with `app/icon.svg`.
 */
const MeerkatGlyph = ({ className }: MeerkatGlyphProps) => (
  <svg viewBox="0 0 240 240" aria-hidden="true" className={className}>
    <g
      transform="translate(-22 -19)"
      fill="none"
      stroke="currentColor"
      strokeWidth={8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M78 200 L 75 122 C 73 82, 94 58, 128 56 C 150 55, 166 66, 176 80 L 191 91" />
      <path
        d="M190 91 C 199 89, 206 96, 201 103 C 198 107, 192 106, 189 102 Z"
        fill="currentColor"
      />
      <path d="M196 106 C 184 114, 168 118, 150 124" />
      <path d="M150 124 C 152 138, 160 146, 176 144 C 170 152, 156 156, 140 154 C 130 170, 132 192, 140 214" />
      <path d="M78 200 L 120 222" />
      <path d="M110 90 C 96 82, 84 96, 90 110 C 94 120, 104 124, 112 120" />
      <path d="M112 120 C 106 150, 110 186, 120 222" />
      <circle cx="146" cy="84" r="7" fill="currentColor" stroke="none" />
      <path d="M193.8 127.1 A12 12 0 0 1 190.9 143.8" />
      <path d="M202 121.4 A22 22 0 0 1 196.6 152" />
      <path d="M210.2 115.6 A32 32 0 0 1 202.4 160.2" />
    </g>
  </svg>
);

type BrandMarkProps = { className?: string; showName?: boolean };

/** Simon Says logo tile and wordmark used in every app header. */
export const BrandMark = ({ className, showName = true }: BrandMarkProps) => (
  <span className={cn("inline-flex items-center gap-2.5 font-bold", className)}>
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
    >
      <MeerkatGlyph className="size-8" />
    </span>
    {showName ? <span>Simon Says</span> : null}
  </span>
);
