# Lobby and join designs

Reference specs for the host lobby and guest join screens, taken from the "Live Transcript Sessions" [design canvas](https://claude.ai/artifact/KF6169ajAr4SdR1frk3jta) (version `1794263890-a1e6`, artboards `HostReady` and `GuestJoin`). The canvas remains the source of truth; update this page when it changes.

## Shared tokens

The canvas uses raw OKLCH values. Each one matches a token in `packages/ui/src/styles/globals.css`; build with the token classes, per the [design system](design-system.md).

| Role                                 | Canvas value                 | Token                                                                     |
| ------------------------------------ | ---------------------------- | ------------------------------------------------------------------------- |
| Page background                      | `oklch(98.5% 0 0)`           | `sidebar` (no page-background token at this value; `background` is white) |
| Surface (cards, header)              | `oklch(1 0 0)`               | `card` / `background`                                                     |
| Text                                 | `oklch(14.5% 0.008 326)`     | `foreground`                                                              |
| Muted text                           | `oklch(54.2% 0.034 322.5)`   | `muted-foreground`                                                        |
| Secondary text, link hover           | `oklch(43.5% 0.029 321.78)`  | `chart-3` (no semantic token)                                             |
| Primary (brand, dark buttons, links) | `oklch(21.2% 0.019 322.12)`  | `primary`                                                                 |
| Primary foreground                   | `oklch(98.5% 0 0)`           | `primary-foreground`                                                      |
| Border                               | `oklch(92.2% 0.005 325.62)`  | `border` / `input`                                                        |
| Muted fill                           | `oklch(96% 0.003 325.6)`     | `muted`                                                                   |
| Dashed border, idle dot              | `oklch(71.1% 0.019 323.02)`  | `ring`                                                                    |
| Success (check icons, level bars)    | `oklch(59.6% 0.145 163.225)` | `success`                                                                 |
| Live dot                             | `oklch(57.7% 0.245 27.325)`  | `live`                                                                    |
| Dark-banner subtext                  | `oklch(86.5% 0.012 325.68)`  | `chart-1` (no semantic token)                                             |

- Font: Raleway 400/500/600/700, `font-variant-numeric: lining-nums`.
- Card: 1px border, radius 14px (`rounded-xl`), shadow `0 1px 2px rgb(0 0 0 / 0.05)` (`shadow-xs`).
- Buttons and inputs: radius 8px on the canvas, which is `rounded-md`. The design system uses `rounded-lg` (10px) for controls, so follow the design system. Outline variants use the same shadow.
- Icons: Lucide-style 24-grid strokes, stroke-width 2.
- Brand mark: 28×28 tile, radius 8px, primary bg, 16px audio-lines icon, then "Simon Says" 16px/700, gap 8px.

---

## Host — Lobby, ready to go live (`HostReady`, 1440×900, fills width)

### Header

- White bar, bottom border, padding 10px 20px, gap 12px, wraps.
- Brand mark → 1×20px vertical divider → session title **"Opening Keynote"** (14px/600) + room **"Main Hall"** (14px muted), gap 10px, flex `1 1 240px`.
- Status pill: 22px tall, fully rounded, muted fill, secondary text, 12px/600, 6px idle dot (`71.1%` grey): **"Lobby open · not live"**.
- **"Edit session"** outline button, 32px tall, links to New session (`HostCreate`).

### Main (max-width 1120px, centered, padding 32px 24px, gap 24px)

- H1 **"Get ready to go live"** 26px/700, line-height 1.2.
- Subtitle 14px muted: _Guests can join now. They'll see "Starting soon" until you go live._

Two cards side by side, each `flex: 1 1 380px`, padding 24px, gap 16px between (wrap to stack).

#### Card 1 — "Share with the room" (H2 16px/600, internal gap 20px)

- QR placeholder 160×160, radius 12px, 1px dashed border, muted fill, `role="img"` "QR code placeholder".
- Beside it (gap 20px, column gap 6px):
  - Label **"Join code"** 13px/500 muted.
  - Code **"KQ7·42M"**: 40px/700, letter-spacing 0.06em, line-height 1.1. Displayed with a middle dot between groups of 3.
  - Link **simonsays.live/KQ742M** 14px, underline offset 3px.
- Bottom (pinned with `margin-top: auto`): 2-column grid, gap 8px, outline buttons 36px tall, 14px/500, 15px icons:
  - **Copy link** (copy icon)
  - **Show on screen** (presentation icon)

#### Card 2 — "Pre-flight check"

Rows separated by top border + 14px padding-top; each row = 18px icon + content, gap 12px.

1. Green check-circle · **"Microphone is picking you up"** (14px/600) with device name right-aligned **"Podium mic (USB)"** (13px muted). Below: level meter, 20 bars, 4px wide, radius 2px, gap 3px, 18px tall, bottom-aligned; first 16 bars success green, last 4 border grey. `role="img"` label "Input level, good". Sample heights: `6 9 12 16 18 14 11 15 18 13 9 7 10 14 12 8 5 4 4 4`.
2. Green check-circle · **"Test captions"** (14px/600). Caption sample in muted-fill box (padding 10px 12px, radius 8px, 14px, line-height 1.5, secondary text): _"Testing, one, two. Can the back row hear me?"_ Helper 12px muted: _Only you see this. Nothing is shown to guests until you go live._
3. Users icon (current color) · **"12 guests"** (600) _waiting in the lobby_ (14px).

#### Go-live banner

- Full-width, primary-dark bg, radius 14px, padding 20px 24px, gap 16px, wraps.
- Left (flex `1 1 280px`): **"Everything looks good"** 16px/600; _Transcription starts the moment you go live. You can pause any time._ 14px in dark-banner subtext color.
- Right: **Go live** button — 44px tall, padding 0 20px, radius 10px, light bg, primary text, 15px/600, 8px red dot before label. Links to Live console (`Main`).

---

## Guest — Join (`GuestJoin`, 390×844 phone)

- Page: padding 56px 20px 32px, column layout.
- Brand mark at top.
- Card (margin-top 64px, padding 20px, gap 20px):
  - H1 **"Read along, live"** 24px/700, line-height 1.2.
  - Body 14px, line-height 1.5, muted: _Enter the code the speaker is showing to follow their words on your phone._ (gap 6px from H1)
  - Form (column, gap 8px):
    - Label **"Session code"** 14px/500, `for="code"`.
    - Input `id="code"`, `type="text"`, `autocomplete="off"`, placeholder **KQ742M** (no separator). 48px tall, padding 0 14px, radius 8px, 1px border, transparent bg, 20px/600, letter-spacing 0.1em, lining nums.
    - Submit **"Join session"** — 44px tall, margin-top 8px, primary bg, primary foreground, 15px/500, no border.
- "OR" divider: margin 24px 0, 1px rules either side, 12px/500 muted, gap 12px.
- QR hint card (padding 14px, radius 14px, white, border, no shadow, gap 12px): 40×40 muted tile (radius 10px) with 20px scan-QR icon; text 14px, line-height 1.45, secondary: _Point your camera at the QR code on the stage screen to join instantly._
- Footer pinned to bottom (`margin: auto 0 0`), centered 13px muted: _No account or app download needed._

## Notes for implementation

- Join code format: 6 alphanumeric chars; host shows `KQ7·42M` (dot is display only), guest types and link uses `KQ742M`.
- Join artboard shows a single state only — no error, loading, or invalid-code state is designed.
- Lobby artboard shows only the all-green state; no failing mic/captions or zero-guest variant is designed.
