# Guest live reader designs

Reference specs for the guest's live caption reader on phone and desktop, taken from the "Live Transcript Sessions" [design canvas](https://claude.ai/artifact/KF6169ajAr4SdR1frk3jta) (version `1794263890-a1e6`, artboards `GuestLive` and `GuestDesktop`). The canvas remains the source of truth; update this page when it changes. See the [index](index.md) for every artboard.

Route: `/session/:id`.

## Dark tokens

All guest reader, clip, notes, ask and save-notes artboards are dark. The canvas uses raw OKLCH values; each one matches a token in the `.dark` block of `packages/ui/src/styles/globals.css` unless noted. Other guest specs link here.

| Role                                                     | Canvas value                                                                                                 | Token (`.dark`)                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Page background                                          | `oklch(14.5% 0.008 326)`                                                                                     | `background`                                       |
| Raised surface (bottom bars, side panels, sheets, cards) | `oklch(21.2% 0.019 322.12)`                                                                                  | `card` / `popover` / `sidebar`                     |
| Fill (segmented control, chips, quote box, user bubbles) | `oklch(26.3% 0.024 320.12)`                                                                                  | `muted` / `secondary` / `accent`                   |
| Text                                                     | `oklch(98.5% 0 0)`                                                                                           | `foreground`                                       |
| Muted text, interim caption                              | `oklch(71.1% 0.019 323.02)`                                                                                  | `muted-foreground`                                 |
| Light action fill, brand tile, badge text                | `oklch(92.2% 0.005 325.62)`                                                                                  | `primary`                                          |
| Text on light action fill                                | `oklch(21.2% 0.019 322.12)`                                                                                  | `primary-foreground`                               |
| Hairline borders                                         | `oklch(1 0 0 / 0.1)`                                                                                         | `border`                                           |
| Control borders                                          | `oklch(1 0 0 / 0.15)`                                                                                        | `input`                                            |
| Control fill                                             | `oklch(1 0 0 / 0.04)`                                                                                        | no token (shadcn dark inputs use `bg-input/30`)    |
| Live dot                                                 | `oklch(70.4% 0.191 22.216)`                                                                                  | `live`                                             |
| Live badge fill                                          | `oklch(70.4% 0.191 22.216 / 0.16)`                                                                           | `live` at 16%                                      |
| LIVE text, "Now" label, error text                       | `oklch(80.8% 0.114 19.571)`                                                                                  | `live-foreground`                                  |
| Success toast fill / text                                | `oklch(76.5% 0.177 163.223 / 0.14)` / `oklch(84.5% 0.143 164.978)`                                           | `success` at 14% / `success-foreground`            |
| Quote text, tip text                                     | `oklch(86.5% 0.012 325.68)`                                                                                  | `chart-1` (no semantic token)                      |
| Older-line fade tones                                    | `oklch(62% 0.022 323)`, `68% 0.02 323`, `70% 0.02 323`, `75% 0.016 324`, `80% 0.014 325`, `84% 0.012 325.68` | none — between `muted-foreground` and `foreground` |
| Modal scrim                                              | `oklch(0% 0 0 / 0.45)`                                                                                       | black at 45%                                       |

- Font, icons and brand mark as in the [shared tokens](../lobby-and-join-designs.md#shared-tokens). On dark artboards the brand tile is `primary` (light) with `primary-foreground` icon.
- Tap targets on phone are 44px minimum.
- Live badge (both artboards): 20px tall, padding 0 8px, fully rounded, `live` 16% fill, `live-foreground` text, 11px/600, letter-spacing 0.04em, 6px `live` dot, gap 6px: **"LIVE"**.

---

## Guest — Live transcript (`GuestLive`, 390×844 phone)

Column layout, `background`, `foreground` text.

### Header

- Padding 48px 16px 12px 20px (top inset for the status bar), bottom `border`, gap 12px.
- Left (grow, column gap 6px):
  - Row, gap 8px: LIVE badge, room **"Main Hall"** 12px `muted-foreground`.
  - Title **"Opening Keynote"** 17px/700, single line with ellipsis.
- Icon buttons, 44×44, radius 8px, 20px icons, foreground colour:
  - Sparkles icon, `aria-label="Ask about this talk"` → Ask (`GuestPhoneAsk`).
  - Notebook-tabs icon, `aria-label="My notes, 4 saved"` → My notes (`GuestPhoneNotes`). Count badge: absolute top 5px right 4px, 16px tall, min-width 16px, padding 0 4px, fully rounded, `primary` fill, `primary-foreground` text, 10px/700: **"4"**.
  - More (ellipsis) icon, `aria-label="Session options"`.

### Transcript

- Fills remaining height, scrolls, content bottom-aligned (`justify-content: flex-end`), gap 18px, padding 20px 20px 24px.
- Each line is a `<p>`, line-height 1.5. With base size **B** (see text size):
  - Older lines, oldest first, size B, fading from dim to bright: `62%`, `68%`, `75%`, `84%` tones.
    1. Before we get started, a quick note: everything I say today is being transcribed live.
    2. Last year we ran a session in this same room, and the audio in the back rows was, honestly, not great.
    3. A few people came up afterwards and said they'd missed about half of it.
    4. Some were hard of hearing, some were listening in their second language, and some just had a loud air vent above their seat.
  - Latest finished line: size B+5, 600 weight, `foreground`: _We started asking what would have helped,_
  - Interim line: size B+5, 400 weight, `muted-foreground`: _and the first thing we heard was that they wanted to read along on their own phones_, then a caret (2px × 1em `foreground` bar, margin-left 3px, vertical-align −0.15em).
- **Text size** steps: Small B=17px, **Medium B=20px (default)**, Large B=24px.

### Bottom bar

- Padding 12px 16px 28px, top `border`, `card` fill, gap 10px.
- Text-size segmented control: `muted` fill, radius 10px, padding 2px, gap 2px. Two 48×44 transparent buttons, radius 8px, 20px icons: **Smaller text** (`a-arrow-down`), **Larger text** (`a-arrow-up`). Disabled at the ends of the range is not drawn.
- **Clip** — 44px tall, padding 0 12px, radius 10px, `muted` fill, 14px/500, 17px scissors icon, gap 6px → clip sheet (`GuestPhoneClip`).
- **Note** — same style, 17px square-pen icon → note sheet (`GuestPhoneNote`).
- Spacer.
- Following indicator: 36×36 circle, 1px `border`, 16px circle-check icon, `role="img"` `aria-label="Following live"`.

---

## Guest — Desktop full screen (`GuestDesktop`, 1440×900, fills width)

Column layout, `background`, `foreground` text.

### Header

- Padding 12px 24px, bottom `border`, gap 12px, wraps.
- Brand mark (dark variant) → 1×20px `border` divider (margin 0 4px) → flex `1 1 260px` group, gap 10px: LIVE badge, **"Opening Keynote"** 14px/600, **"Main Hall"** 14px `muted-foreground`.
- Actions (wraps, gap 8px):
  - Text-size segmented control: `muted` fill, radius 10px, padding 2px; two 32×28 buttons, radius 8px, 16px icons (**Smaller text**, **Larger text**).
  - Outline buttons, 32px tall, padding 0 10px, radius 8px, 1px `input` border, white 4% fill, 14px/500, 15px icons, gap 6px:
    - **Note** (square-pen) → notes panel (`GuestDesktopClip`).
    - **Clip last 30s** (scissors) → notes panel (`GuestDesktopClip`). This is the product's "Keep that" mark.
  - **My notes** — filled: `primary` fill, `primary-foreground` text, notebook-tabs icon, count badge 18px tall, min-width 18px, padding 0 5px, `primary-foreground` fill with `primary` text, 11px/600: **"2"**. Opens the notes panel.
  - **Ask** — outline, sparkles icon → Ask panel (`GuestDesktopAsk`).
  - **Exit full screen** — 32×32 ghost icon button, 16px minimize-2 icon.

### Transcript (main)

- Main grows, centered, padding 40px 24px 24px.
- Column max-width 920px, height 700px, scrolls, bottom-aligned, gap 26px.
- Each line: 2-column grid `76px minmax(0, 1fr)`, gap 20px, `align-items: baseline`.
  - Timestamp 13px `62%` tone, tabular nums.
  - Text line-height 1.5. Older lines size B, tones `62%`, `70%`, `80%`; the latest finished line is B+6, 600, `foreground`.

    | Time       | Text                                                                                                                         |
    | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
    | `00:12:38` | Last year we ran a session in this same room, and the audio in the back rows was, honestly, not great.                       |
    | `00:12:47` | A few people came up afterwards and said they'd missed about half of it.                                                     |
    | `00:12:55` | Some were hard of hearing, some were listening in their second language, and some just had a loud air vent above their seat. |
    | `00:13:06` | We started asking what would have helped, (latest finished)                                                                  |

  - Interim row: label **"Now"** 13px/600 `live-foreground`; text B+6 `muted-foreground`, _and the first thing we heard was that they wanted to read along on their own phones_, caret 3px × 1em, margin-left 4px.
- **Text size** steps: Medium B=22px, **Large B=26px (default)**, Extra large B=32px.

### Footer

- Centered, wraps, gap 12px, padding 0 24px 24px.
- Pill 32px tall, padding 0 12px, fully rounded, 1px `border`, 13px/500 `primary` text (the 92.2% light grey), 15px circle-check: **"Following live"**.
- Hint 13px `muted-foreground`: _Select lines to clip them, or add a note any time._

## Notes for implementation

- Only the live, following state is designed. No **scrolled back / paused following** state (the following indicator has no "off" variant or "Jump to live" control), no **Starting soon**, **paused by host**, **ended**, **reconnecting** or **lost connection** states.
- The phone **Session options** menu has no designed contents. Desktop has no designed non-full-screen layout; `GuestDesktop` assumes full screen.
- Text-size buttons have no designed disabled state at the smallest or largest step.
- Older-line tones are a fade, not tokens; treat them as presentation only and keep contrast readable.
- The interim caret and the latest-line emphasis depend on the host's **Show words as they're spoken** setting; the "finished lines only" variant is not designed.
- Desktop lines are selectable for clipping; see [guest-clips-notes](guest-clips-notes.md) for the selected state.
