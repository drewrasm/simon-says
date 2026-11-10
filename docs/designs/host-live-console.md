# Host live console design

Reference spec for the host's live console, taken from the "Live Transcript Sessions" [design canvas](https://claude.ai/artifact/KF6169ajAr4SdR1frk3jta) (version `1794263890-a1e6`, artboard `Main`). The canvas remains the source of truth; update this page when it changes. See the [index](index.md) for every artboard.

Route: `/host/:id` once the session is live (the lobby state of the same route is `HostReady`, in [lobby-and-join-designs](../lobby-and-join-designs.md)).

## Tokens

Light theme. Uses the [shared tokens](../lobby-and-join-designs.md#shared-tokens) (page background `sidebar`, surfaces `card`, text `foreground`, muted text `muted-foreground`, borders `border`, card radius 14px / `rounded-xl` with `shadow-xs`). Additional values on this artboard:

| Role                   | Canvas value                      | Token                         |
| ---------------------- | --------------------------------- | ----------------------------- |
| Live pill background   | `oklch(57.7% 0.245 27.325 / 0.1)` | `live` at 10% (`bg-live/10`)  |
| Live pill text         | `oklch(50.5% 0.213 27.518)`       | `live-foreground`             |
| Live dot               | `oklch(57.7% 0.245 27.325)`       | `live`                        |
| Level bars, unlit      | `oklch(86.5% 0.012 325.68)`       | `chart-1` (no semantic token) |
| Current-line text      | `oklch(43.5% 0.029 321.78)`       | `chart-3` (no semantic token) |
| Switch off track       | `oklch(92.2% 0.005 325.62)`       | `input`                       |
| Switch on track, caret | `oklch(21.2% 0.019 322.12)`       | `primary`                     |

---

## Host — Live console (`Main`, 1440×900, fills width)

Page: column layout, min-height 900px, page background.

### Header

- White bar, bottom border, padding 10px 20px, gap 12px, wraps. Same structure as the lobby header.
- Brand mark → 1×20px vertical divider (margin 0 4px) → session title **"Opening Keynote"** (14px/600) + room **"Main Hall"** (14px muted), gap 10px, flex `1 1 240px`.
- Status pill: 22px tall, padding 0 8px, fully rounded, live-tinted fill, live-foreground text, 12px/600, tabular nums, 6px live dot, gap 6px: **"Live · 00:14:32"** (elapsed time).
- Actions (gap 8px, wraps):
  - **Pause** — outline button, 32px tall, padding 0 10px, 14px/500, 16px pause icon (two rects), gap 6px.
  - **End session** — primary button, 32px tall, 14px/500, 16px square (stop) icon.

### Main (max-width 1440px, centered, padding 20px, gap 16px, wraps, `align-items: flex-start`)

Two columns: transcript card `flex: 999 1 560px`, side column `flex: 1 1 320px` (stacks below the transcript when narrow).

#### Transcript card

Card, `overflow: hidden`, column.

- **Card header** (padding 14px 16px, bottom border, gap 8px, wraps):
  - Left (flex `1 1 200px`, column gap 2px): H2 **"Live transcript"** 16px/600, line-height 1.3; helper 13px muted: _Click any line to correct it. Fixes update on every guest's screen._
  - **Microphone picker** — outline button 32px tall, padding 0 10px, 13px/500, gap 8px, `aria-label="Microphone: Podium mic (USB)"`: 15px mic icon, **"Podium mic (USB)"**, mini level meter (5 bars, 2px wide, radius 1px, gap 2px, 12px tall, bottom-aligned; heights `5 9 12 7 4`; first 4 success, last `chart-1`), 14px chevron-down in muted.
  - **Language picker** — same button style, `aria-label="Language: English (US)"`: 15px globe icon, **"English (US)"**, 14px muted chevron-down.
- **Transcript list** (padding 6px, fixed height 580px, scrolls). Each line is a 2-column grid `68px minmax(0, 1fr)`, gap 12px, padding 9px 10px, radius 8px:
  - Timestamp 12px muted, tabular nums, padding-top 4px.
  - Text 16px, line-height 1.6.
  - Sample lines (oldest first):
    - `00:12:04` Good morning, everyone, and thank you for being here so early.
    - `00:12:11` Before we get started, a quick note: everything I say today is being transcribed live.
    - `00:12:19` If you scan the code on the screen behind me, you can follow along on your phone, at whatever text size works for you.
    - `00:12:31` So let's talk about why we built this in the first place.
    - `00:12:38` Last year we ran a session in this same room, and the audio in the back rows was, honestly, not great.
    - `00:12:47` A few people came up afterwards and said they'd missed about half of it.
    - `00:12:55` Some were hard of hearing, some were listening in their second language, and some just had a loud air vent above their seat.
    - `00:13:06` We started asking what would have helped,
  - **Current (interim) line**: same grid, `muted` background. Label **"Now"** 12px/600 (foreground). Text 16px, `chart-3` colour: _and the first thing we heard from attendees was that they wanted to read along on their own phones_, followed by a text caret: 2×17px `primary` bar, margin-left 3px, vertical-align −3px.
- **Card footer** (padding 10px 16px, top border, gap 8px, wraps):
  - Left (flex `1 1 200px`): 14px pencil icon + **"2 lines corrected this session"** 13px muted, gap 6px.
  - **Download transcript** — ghost button (no border, transparent), 32px tall, 13px/500, 15px download icon.

#### Side column (column, gap 16px)

1. **Invite your audience** card (padding 16px, gap 16px):
   - H2 **"Invite your audience"** 16px/600; helper 13px muted _Guests join with this code or the QR code._ (gap 2px).
   - Row (gap 14px, centered): QR placeholder 104×104, radius 10px, 1px dashed `ring` border, `muted` fill, 12px muted "QR code", `role="img"` label "QR code placeholder". Beside it (column gap 4px): **"Join code"** 12px/500 muted; **"KQ7·42M"** 30px/700, letter-spacing 0.06em; link **simonsays.live/KQ742M** 13px, underline offset 3px.
   - 2-column grid, gap 8px, 32px buttons, 14px/500, 15px icons:
     - **Copy link** — outline, copy icon.
     - **Show on screen** — primary (filled), presentation icon. (In the lobby this button is outline.)
2. **Guest count** card (padding 16px, row, gap 12px): 36×36 `muted` tile, radius 10px, 18px users icon; beside it **"38"** 22px/700 line-height 1.2 and **"guests reading along"** 13px muted.
3. **Guest settings** card (padding 16px, column gap 4px):
   - H2 **"Guest settings"** 16px/600, margin-bottom 6px.
   - Rows: top border, padding 10px 0, gap 12px. Label 14px/500 over hint 12px muted (gap 2px); switch on the right.
   - Switch: 32×18 track, fully rounded, 1px transparent border, `shadow-xs`; 16px white knob. On = `primary` track, knob right; off = `input` track, knob left. `role="switch"`, `aria-checked`, `aria-label` = row label.

     | Label                          | Hint                                | Default |
     | ------------------------------ | ----------------------------------- | ------- |
     | Show words as they're spoken   | Off: guests only see finished lines | On      |
     | Let guests download transcript | Available after the session ends    | On      |
     | Filter profanity               | Masks flagged words for everyone    | Off     |

## Notes for implementation

- Only the live, recording state is designed. There is no **paused** state (pill copy, Pause → Resume label, transcript appearance), no **ended** state, and no confirmation for **End session**.
- **Click any line to correct it** has no designed editing state: no inline editor, save/cancel controls, or "corrected" marker on a line.
- The microphone and language buttons have no designed menu or popover; no mic-error, mic-silent or reconnecting state.
- No empty transcript (live but nothing spoken yet), no scrolled-back / "jump to live" state, and no zero-guest count.
- No toast or confirmation for **Copy link**, and **Show on screen** has no designed presentation view.
- The **Download transcript** action has no designed format picker or progress state.
- Elapsed time in the pill (`00:14:32`) and line timestamps use talk time `HH:MM:SS`.
