# Host sessions and new session designs

Reference specs for the signed-in host home (sessions list and first run) and the New session form, taken from the "Live Transcript Sessions" [design canvas](https://claude.ai/artifact/KF6169ajAr4SdR1frk3jta) (version `1794263890-a1e6`, artboards `HostSessions`, `HostSessionsEmpty` and `HostCreate`). The canvas remains the source of truth; update this page when it changes. See the [index](index.md) for every artboard.

Routes: `HostCreate` is `/host/new`. `HostSessions` and `HostSessionsEmpty` are not built (there is no host home route; `/` is the public landing).

## Tokens

Light theme. Uses the [shared tokens](../lobby-and-join-designs.md#shared-tokens). Additional values:

| Role                                 | Canvas value                                                         | Token                                            |
| ------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------ |
| Avatar fill, switch off track        | `oklch(92.2% 0.005 325.62)`                                          | `input` (no fill token at this value)            |
| Table secondary text                 | `oklch(43.5% 0.029 321.78)`                                          | `chart-3` (no semantic token)                    |
| Empty-state dashed border, todo ring | `oklch(86.5% 0.012 325.68)`                                          | `chart-1` (no semantic token)                    |
| Phone preview frame                  | `oklch(26.3% 0.024 320.12)`                                          | `.dark` `muted`                                  |
| Phone preview screen                 | `oklch(14.5% 0.008 326)`                                             | `.dark` `background`                             |
| Phone preview live badge             | `oklch(70.4% 0.191 22.216 / 0.16)`, text `oklch(80.8% 0.114 19.571)` | `.dark` `live` at 16%, `.dark` `live-foreground` |
| Phone preview secondary text         | `oklch(71.1% 0.019 323.02)`                                          | `.dark` `muted-foreground`                       |

## Shared host header (signed in)

- White bar, bottom border, padding 10px 20px, gap 20px, wraps.
- Brand mark (28px tile, 16px/700 "Simon Says").
- Centre slot, `flex-grow: 1` — varies by page (nav tabs or breadcrumb).
- Avatar: 32×32 circle, `input` fill, **"JL"** 13px/600, `role="img"` `aria-label="Your account"`.

---

## Host — Sessions (`HostSessions`, 1440×900, fills width)

### Header

Centre slot is `<nav aria-label="Main">`, gap 4px. Tabs are links, 32px tall, padding 0 10px, radius 8px, 14px:

- **Sessions** — current: `aria-current="page"`, `muted` fill, 600 weight.
- **Transcripts** — 500 weight, muted text.
- **Settings** — 500 weight, muted text.

### Main (max-width 1120px, centered, padding 32px 24px, column gap 24px)

- Title row (wraps, `align-items: flex-end`, gap 16px):
  - Left (flex `1 1 280px`, gap 4px): H1 **"Sessions"** 26px/700 line-height 1.2; subtitle 14px muted _Create a session for each talk, then share its code with your audience._
  - **New session** — primary link button, 36px tall, padding 0 14px, 14px/500, 16px plus icon, gap 6px. Links to `HostCreate`.
- **Upcoming** card (`overflow: hidden`):
  - Card header: padding 16px 20px, bottom border, H2 **"Upcoming"** 16px/600.
  - Table (horizontal scroll wrapper, `min-width: 720px`, 14px, collapsed borders). Header row 13px/500 muted, left-aligned, padding 10px 12px (first and last cells 10px 20px). Columns: **Session**, **Room**, **When**, **Status**, and a visually hidden **Actions** header (right-aligned).
  - Body rows: top border, cells padding 14px 12px (first/last 14px 20px). Session 600 weight; Room and When `chart-3`.
  - Status badge: outline pill, 22px tall, padding 0 8px, 1px border, 12px/500.
  - Action: **Open lobby** — outline link button 32px tall, padding 0 10px, 13px/500. Links to the lobby (`HostReady`).

    | Session                 | Room      | When              | Status    |
    | ----------------------- | --------- | ----------------- | --------- |
    | Opening Keynote         | Main Hall | Today, 9:00 AM    | Scheduled |
    | Design Systems at Scale | Room B    | Today, 1:30 PM    | Scheduled |
    | Closing Panel           | Main Hall | Tomorrow, 4:00 PM | Draft     |

- **Past** card: same structure, H2 **"Past"**. Columns **Session**, **Date**, **Length**, **Guests** (Length and Guests use tabular nums), hidden **Actions**.
  - Action: **Transcript** — ghost link button 32px tall, 13px/500, 14px download icon, gap 6px.

    | Session             | Date   | Length | Guests |
    | ------------------- | ------ | ------ | ------ |
    | Product Roadmap Q&A | Nov 2  | 46 min | 112    |
    | Welcome Session     | Oct 28 | 22 min | 64     |

---

## Host — First run, no sessions yet (`HostSessionsEmpty`, 1440×900, fills width)

Same header as `HostSessions` (Sessions tab current).

### Main (max-width 1120px, centered, padding 32px 24px, column gap 24px)

- H1 **"Welcome, Jordan"** 26px/700; subtitle 14px muted _Your host account is ready. Here's how to get your first talk going._ (gap 4px).
- Row (wraps, gap 16px, `align-items: flex-start`):
  - **Empty state** (flex `999 1 520px`): white, 1px dashed `chart-1` border, radius 14px, no shadow, padding 56px 32px, centered column, gap 14px.
    - 56×56 `muted` tile, radius 14px, 26px mic icon.
    - H2 **"No sessions yet"** 18px/600.
    - Body 14px, line-height 1.6, muted, max-width 380px: _Create a session for your talk. You'll get a join code to share with the room, and you can test your mic before going live._
    - **Create your first session** — primary link button, 40px tall, padding 0 16px, margin-top 6px, 14px/500, 16px plus icon. Links to `HostCreate`.
  - **Getting started** card (flex `1 1 320px`, padding 20px, column gap 4px). H2 16px/600, margin-bottom 8px. Rows: top border, padding 10px 0, gap 12px:
    - Status dot 20×20 circle, margin-top 1px. Done: `primary` fill with 12px `primary-foreground` check. To do: 1.5px `chart-1` ring, empty.
    - Title 14px/500 (done: muted and struck through) over hint 13px muted, gap 2px.

      | Title                      | Hint                                   | Done |
      | -------------------------- | -------------------------------------- | ---- |
      | Create your host account   | Signed in as jordan@company.com        | Yes  |
      | Create a session           | Title, room and when it starts         | No   |
      | Test your mic in the lobby | Check captions before anyone sees them | No   |
      | Share the code and go live | Show the QR on screen for the room     | No   |

---

## Host — New session (`HostCreate`, 1440×900, fills width)

### Header

Centre slot is a breadcrumb `<nav aria-label="Breadcrumb">`, gap 6px, 14px: link **Sessions** (muted, no underline) → 14px chevron-right → **New session** (600, `aria-current="page"`).

### Main (max-width 1200px, centered, padding 28px 24px 40px, gap 24px, wraps, `align-items: flex-start`)

Form column `flex: 999 1 560px` (column gap 16px) and a sticky preview column `flex: 1 1 320px` (column gap 16px, `position: sticky; top: 24px`).

#### Form

- Heading block (gap 4px, margin-bottom 4px): H1 **"New session"** 26px/700 line-height 1.2; subtitle 14px muted _Set up the talk once. You can change everything except the join code later._
- Sections are cards with padding 20px, column gap 16px, H2 16px/600.
- Fields: label 14px/500 above input, gap 6px. Inputs 36px tall, padding 0 10px, radius 8px, 1px border, transparent background, `shadow-xs`, 14px/400.

1. **Details**
   - **Session title** (`id="s-title"`), value _Opening Keynote_.
   - 2-column grid, gap 12px: **Room or location** (`s-room`), value _Main Hall_; **Speaker** (`s-speaker`), value _Jordan Lee_.
2. **When**
   - `role="radiogroup"` `aria-label="Start time"`, 2-column grid, gap 12px. Each option is a `role="radio"` button: padding 12px 14px, radius 10px, left-aligned column, gap 2px; label 14px/600 over hint 13px muted.
     - Selected: `muted` fill, 2px `primary` border. Unselected: white fill, 1px border, margin 1px (keeps size equal).
     - **Start now** — _Open the lobby right away_.
     - **Schedule** — _Pick a date and time_ (selected on the artboard).
   - Shown only when **Schedule** is selected: 3-column grid, gap 12px, lining nums: **Date** (`s-date`) _Nov 10, 2026_; **Start time** (`s-time`) _9:00 AM_; **Open lobby** (`s-open`) _15 min before_.
3. **Audio & language**
   - 2-column grid, gap 12px. Each field is a picker button (36px, full width, outline style as the inputs, gap 8px), labelled by a `<span id>` via `aria-labelledby`: leading 15px icon, value left-aligned with `flex-grow`, 14px chevron-down.
     - **Microphone** — mic icon, _Podium mic (USB)_.
     - **Spoken language** — globe icon, _English (US)_.
   - Helper 13px muted: _You'll test the mic in the lobby before going live._
4. **Guest experience** (column gap 4px; H2 margin-bottom 8px). Switch rows: top border, padding 12px 0, gap 12px; label 14px/500 over hint 13px muted. Switch as in the [live console](host-live-console.md) guest settings card.

   | Label                              | Hint                                | Default |
   | ---------------------------------- | ----------------------------------- | ------- |
   | Show words as they're spoken       | Off: guests only see finished lines | On      |
   | Let guests clip and take notes     | Notes stay private to each guest    | On      |
   | Let guests download the transcript | Available after the session ends    | On      |
   | Filter profanity                   | Masks flagged words for everyone    | Off     |
   | Ask guests for their name          | Off: guests join anonymously        | Off     |

- **Actions** row (right-aligned, wraps, gap 8px). All 36px tall, padding 0 14px, radius 8px, 14px/500:
  - **Cancel** — ghost link, back to Sessions.
  - **Save as draft** — outline link, back to Sessions.
  - Primary link with 15px arrow-right icon, gap 6px. Label depends on **When**:
    - Schedule: **"Schedule session"** → Sessions.
    - Start now: **"Create & open lobby"** → lobby (`HostReady`).

#### Preview column

1. **What guests will see** card (padding 20px, gap 14px). H2 16px/600; helper 13px muted _Updates as you type_.
   - Phone mock, centered: 220×300, radius 24px, 6px `.dark` `muted` border, `.dark` `background` fill, light text, padding 18px 14px, column gap 10px, `overflow: hidden`.
     - Badge row (gap 6px): pill 16px tall, padding 0 6px, 9px/600, letter-spacing 0.04em, 5px dot, live-tinted (dark tokens). Copy: **"TOMORROW 9:00"** when scheduled, **"STARTING SOON"** when starting now. Then the room (10px `.dark` muted-foreground, ellipsis).
     - Title 14px/700 line-height 1.25 (mirrors **Session title**).
     - _with Jordan Lee_ 10px muted.
     - Placeholder caption lines pinned to the bottom (gap 6px): 8px bars at 90% and 75% width (white 12%), 10px bar at 95% (white 30%), radius 4px.
2. **Join code** card (padding 20px, gap 6px): **"Join code"** 13px/500 muted; **"KQ7·42M"** 26px/700 letter-spacing 0.06em; 13px muted, line-height 1.5: _Reserved for this session. Guests can join at simonsays.live/KQ742M once the lobby opens._

## Notes for implementation

- The title and room inputs drive the phone preview live; no other field is wired on the canvas.
- Date, start time and lobby-open fields are drawn as plain text inputs; no date picker, time picker or select menu is designed. The microphone and language pickers have no designed menu.
- No validation, error or required-field state (for example an empty title), and no submitting/loading state on the primary button.
- No designed state for the **Save as draft** result, for editing an existing session (the lobby's **Edit session** links here), or for a join code that failed to reserve.
- `HostSessions` has no loading, error, or pagination state; no empty **Upcoming** or empty **Past** table (the whole-page empty state is `HostSessionsEmpty`). Status values shown are only **Scheduled** and **Draft**; no badge is designed for a live or lobby-open session.
- The **Transcripts** and **Settings** nav tabs and the avatar menu have no designed destination.
