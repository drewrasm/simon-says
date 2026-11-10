# Guest clips and notes designs

Reference specs for guest clipping ("Keep that"), the note sheet and My notes, taken from the "Live Transcript Sessions" [design canvas](https://claude.ai/artifact/KF6169ajAr4SdR1frk3jta) (version `1794263890-a1e6`, artboards `GuestDesktopClip`, `GuestPhoneClip`, `GuestPhoneNote` and `GuestPhoneNotes`). The canvas remains the source of truth; update this page when it changes. See the [index](index.md) for every artboard.

Routes: `GuestDesktopClip`, `GuestPhoneClip` and `GuestPhoneNote` are states of `/session/:id`; `GuestPhoneNotes` is `/session/:id/notes`.

Dark theme; colours use the [dark tokens](guest-reader.md#dark-tokens). "Keep that" is not a label on the canvas: it is the **Clip last 30s** button (see [product](../product.md)).

## Shared pieces

- **Talk-time badge** (on clip and note cards): pill 22px tall on desktop, 24px on phone (padding 0 8px / 0 9px), `muted` fill, `primary` text (92.2% light grey), 12px/500, tabular nums, gap 6px. Leading 12px icon: scissors for a clip, square-pen for a note. Copy: clip `00:12:11 – 00:12:19` (range, en dash with spaces) or a single time; note `Note · 00:12:40`.
- **Card** (clip or note): radius 14px, 1px `border`, padding 14px, column gap 10px.
  - Quote (clips only), in curly quotes, `80%` tone, line-height 1.55–1.6.
  - Note-only card: the note text in `foreground`.
  - Clip with a note: below the quote, top hairline (`oklch(1 0 0 / 0.08)`), padding-top 10px, gap 8px, 14px pencil icon + note text.
- **Bottom sheet** (phone): absolutely positioned at the bottom, `card` fill, top hairline (white 12%), radius 20px 20px 0 0, padding 10px 20px 32px, column gap 16px. Grabber 40×4, fully rounded, white 20%, centered. Header row: title 18px/700 + 13px `muted-foreground` subline (gap 4px); 44×44 close button (18px X, `aria-label="Close"`, margin −6px −10px 0 0). Behind it: the transcript, `aria-hidden`, under a black 45% scrim.
- **Sheet footer**: 2-column grid, gap 10px, margin-top 4px. 48px tall buttons, radius 10px, 15px. Left **Cancel**: 1px `input` border, 500. Right: `primary` fill, `primary-foreground` text, 600.

---

## Guest — Desktop clipping to notes (`GuestDesktopClip`, 1440×900, fills width)

The desktop reader with the **My notes** side panel open and two lines selected.

### Header

Same as [`GuestDesktop`](guest-reader.md) brand, divider and title group. Actions (gap 8px):

- **Clip last 30s** — outline (scissors). Saves the last three lines as a clip and shows the toast _Clipped the last 30 seconds_.
- **Ask** — outline (sparkles) → `GuestDesktopAsk`.
- **Hide notes** — ghost, 15px X icon → `GuestDesktop`.

(The text-size control, **Note** and **My notes** buttons are not shown while the panel is open.)

### Transcript (left, flex `999 1 560px`)

- Padding 28px 40px 96px, `position: relative`.
- Column max-width 820px, height 700px, scrolls, bottom-aligned, gap 4px.
- Each line is a `<button aria-pressed>`: grid `72px minmax(0, 1fr)`, gap 16px, padding 10px 14px, radius 10px, left-aligned.
  - Timestamp 12px `62%` tone, padding-top 6px.
  - Text 22px, line-height 1.5.
  - **Unselected**: transparent, text `80%` tone.
  - **Selected**: fill `oklch(92.2% 0.005 325.62 / 0.12)` with inset 1px ring at 28% of the same colour (`primary` at 12% / 28%), text `foreground`.
- Lines on the artboard: `00:12:31` So let's talk about why we built this in the first place. · `00:12:38` Last year we ran… · `00:12:47` A few people came up… · `00:12:55` Some were hard of hearing… (selected) · `00:13:06` We started asking what would have helped, and the first thing we heard was that they wanted to read along on their own phones. (selected) · `00:13:18` That turned out to be the easy part. The hard part was making it useful after the talk was over,
- Interim row: **"Now"** 12px/600 `live-foreground`; 22px `muted-foreground`: _because nobody wants to scroll through an hour of text to find the one idea they cared about_ + 3px caret.

#### Selection bar (shown while any line is selected)

- Floating, centered: `left: 50%; bottom: 24px; translateX(-50%)`. Padding 6px 6px 6px 16px, radius 14px, `muted` fill, 1px white-12% border, shadow `0 12px 32px rgb(0 0 0 / 0.45)`, gap 6px, no wrap.
- **"2 lines selected"** 14px/500, margin-right 8px (singular: _1 line selected_).
- **Clear** — ghost, 32px, `primary` text (light grey), 14px/500.
- **Copy** — outline (`input` border, transparent), 15px copy icon. Toast: _Copied to clipboard_; clears the selection.
- **Clip to notes** — `primary` fill, `primary-foreground` text, 14px/600, padding 0 12px, scissors icon. Toast: _Clipped to My notes_; clears the selection and adds the clip to the top of the list.

### My notes panel (right, flex `1 1 380px`)

- `card` fill, left `border`, padding 20px, column gap 16px.
- Header row (gap 8px): H2 **"My notes"** 16px/600 line-height 1.3 over 13px `muted-foreground` _2 saved from Opening Keynote_ (count updates); **Export** — outline 32px, 13px/500, 14px download icon.
- **New note** composer (`<form>`): padding 12px, radius 14px, 1px `input` border, fill `background` at 60%, column gap 8px.
  - Label **"New note"** 12px/500 `muted-foreground` with 13px square-pen icon, `for="new-note"`.
  - Textarea `id="new-note"`, 3 rows, borderless, transparent, 14px/400, line-height 1.5, no resize. Placeholder: _Jot down a thought. It's pinned to this moment in the talk._
  - Row: 12px clock icon + **"At 00:13:24"** 12px `muted-foreground` tabular nums; spacer; **Add note** — submit, 32px, padding 0 12px, `primary` fill, `primary-foreground`, 13px/600. Disabled while the draft is blank: opacity 0.5, `not-allowed`. Success toast: _Note added_.
- **Toast** (`role="status"`, inline in the panel, auto-hides after about 2.6s): padding 10px 12px, radius 10px, `success` 14% fill, `success-foreground` text, 13px/500, 15px circle-check, gap 8px.
- **Empty state** (no clips or notes): padding 28px 16px, radius 14px, 1px dashed white-18% border, centered, gap 6px. **"Nothing saved yet"** 14px/600; 13px `muted-foreground` line-height 1.5: _Write a note above, select lines in the transcript, or press Clip last 30s when something is worth keeping._
- **List** (column gap 12px, scrolls, max-height 640px), newest first. Cards: fill `background` at 60%, 1px `border`.
  - Header row: talk-time badge, spacer, 28×28 ghost **Remove clip** button (14px X, `muted-foreground`).
  - Quote 14px line-height 1.6 `80%` tone. Note-only text 15px line-height 1.55, `white-space: pre-line`. Clip note row 14px line-height 1.5.
  - **Clip without a note**: inline field — label **"Add a note"** 12px/500 `muted-foreground`; input 32px, padding 0 10px, radius 8px, `input` border, white 4% fill, 14px, placeholder _Why this matters to you…_
  - Items on the artboard:
    1. Note · `00:12:40` — _Audio in the back rows was the problem last year. Check the mics in our own venue._
    2. Clip `00:12:11 – 00:12:19` — quote _Everything I say today is being transcribed live. If you scan the code on the screen behind me, you can follow along on your phone._ — note _Ask the events team if we can do this at our offsite._
- Footer pinned to the bottom (`margin-top: auto`), 12px `muted-foreground`, line-height 1.5: _Your notes are saved in this browser only._ link **Save them with your email** (→ `GuestSignIn`, underline offset 3px) _to keep them for good._

---

## Guest — Phone clip sheet (`GuestPhoneClip`, 390×844 phone)

Opened from **Clip** on `GuestLive`.

- Background transcript (padding 112px 20px 0, gap 14px, 20px line-height 1.5): one dim line (`68%`), then the two selected lines, each padding 8px 10px, radius 10px, fill `primary` at 14% with inset 1px ring at 30%.
- Sheet (`aria-label="Clip to notes"`):
  - Title **"Clip to notes"**; subline **"2 lines · 00:12:47 – 00:12:55"** (tabular nums).
  - Quote box: padding 12px 14px, radius 10px, `muted` fill, 15px line-height 1.55, `chart-1` text: _"A few people came up afterwards and said they'd missed about half of it. Some were hard of hearing, some were listening in their second language…"_
  - Range adjusters (gap 8px): two pills 36px tall, padding 0 12px, fully rounded, 1px `input` border, transparent, 13px/500, 14px plus icon: **Line before**, **Line after**.
  - Note field (gap 8px): label **"Add a note"** 14px/500 + **"(optional)"** 400 `muted-foreground`, `for="clip-note"`. Textarea 3 rows, padding 10px 12px, radius 8px, `input` border, white 4% fill, 15px/400 line-height 1.5, no resize; placeholder _Why this matters to you…_; filled on the artboard with _Good example for the accessibility proposal_.
  - Footer: **Cancel** / **Save clip** (16px scissors icon, gap 6px). Both return to `GuestLive`.

---

## Guest — Phone note sheet (`GuestPhoneNote`, 390×844 phone)

Opened from **Note** on `GuestLive`.

- Background transcript: two lines at 20px (`68%` and `84%` tones), scrim.
- Sheet (`aria-label="New note"`):
  - Title **"New note"**; subline with 13px clock icon, gap 5px: **"Pinned to 00:13:24 in the talk"**.
  - Field (gap 8px): label **"Your note"** 14px/500, `for="phone-note"`. Textarea 5 rows, padding 12px, radius 8px, `input` border, white 4% fill, 16px/400 line-height 1.5; placeholder _Jot down a thought…_; filled with _Idea: send attendees their clips by email after the session so they don't lose them._
  - **Attach what was just said** row: padding 12px 14px, radius 10px, `muted` fill, gap 12px. Label 14px/500 over 12px `muted-foreground` line-height 1.4 _Adds the last line as a quote under your note_. Switch (`role="switch"`, `aria-label` = label): 44×26 track, padding 3px, fully rounded, white-18% fill when off, 20px `foreground` knob. Only the **off** state is drawn.
  - Footer: **Cancel** (→ `GuestLive`) / **Save note** (→ `GuestPhoneNotes`).

---

## Guest — Phone my notes (`GuestPhoneNotes`, 390×844 phone)

Column layout, `background`.

### Header

- Padding 44px 8px 10px 4px, gap 4px, no border.
- 44×44 back link, 22px chevron-left, `aria-label="Back to transcript"` → `GuestLive`.
- Title block (grow, gap 2px): H1 **"My notes"** 18px/700; 12px `muted-foreground` ellipsis _Opening Keynote · Main Hall_.
- 44×44 **Export notes** icon button (20px download icon).

### Top controls (padding 0 16px 12px, gap 12px)

- **Live return banner** (link → `GuestLive`): 44px tall, padding 0 12px, radius 10px, `live` 12% fill, 14px/500, gap 8px. 7px `live` dot, **"Session is still live"** (grow), then **Return** 600 `live-foreground` with 16px chevron-right.
- **Filter tabs** (`role="tablist"` `aria-label="Filter"`): 3-column grid, gap 2px, padding 3px, radius 10px, `muted` fill. Tabs 38px, radius 8px, 14px lining nums. Selected: `background` fill, `foreground`, 600, shadow `0 1px 2px rgb(0 0 0 / 0.3)`. Unselected: transparent, `muted-foreground`, 500. Labels with counts: **All 4**, **Clips 2**, **Notes 2**.

### List (grows, scrolls, padding 4px 16px 16px, gap 12px)

- **Save prompt** card: padding 14px, radius 14px, 1px `input` border, `muted` fill, column gap 12px.
  - Row gap 10px: 18px smartphone icon; **"Only saved in this browser"** 14px/600 over 13px `80%` tone line-height 1.5 _Clearing your browser or switching phones will lose these notes._
  - **Save with my email** — 44px, radius 10px, `primary` fill, `primary-foreground`, 14px/600, 16px mail icon → `GuestSignIn`.
- Cards: `card` fill, 1px `border`, padding 14px 14px 6px.
  - Header: talk-time badge, spacer, **More actions** — 44×32 ghost (18px ellipsis, `muted-foreground`, margin-right −6px).
  - Quote 15px line-height 1.55 `80%` tone; note-only text 16px line-height 1.5 `foreground`; clip note row 15px.
  - **Jump to this moment** link — 36px tall, 13px/500 `muted-foreground`, 14px clock icon, gap 6px.
  - Items (newest first):
    1. Note · `00:13:24` — _Idea: send attendees their clips by email after the session so they don't lose them._
    2. Clip `00:12:47 – 00:12:55` — quote _A few people came up afterwards and said they'd missed about half of it. Some were hard of hearing, some were listening in their second language…_ — note _Good example for the accessibility proposal_
    3. Note · `00:12:40` — _Audio in the back rows was the problem last year. Check the mics in our own venue._
    4. Clip `00:12:11 – 00:12:19` — quote _Everything I say today is being transcribed live. If you scan the code on the screen behind me, you can follow along on your phone._ (no note)
- Footer line, centered, 12px `muted-foreground`, margin-top 4px: _No account needed. Your email is only used to keep your notes._

### Bottom bar

- Padding 12px 16px 28px, top `border`, `card` fill.
- **New note** — full width, 48px, radius 10px, `primary` fill, `primary-foreground`, 15px/600, 17px square-pen, gap 8px → `GuestPhoneNote`.

## Notes for implementation

- No designed **saving**, **failed to save**, **retry** or **pending/incomplete evidence** state for clips or notes; the only feedback is the success toast (desktop) or returning to the list (phone).
- No designed confirmation for **Remove clip**, and no undo. The phone **More actions** menu has no designed contents.
- **Export** (desktop and phone) has no designed menu (copy, share, download) or result message.
- Phone clip sheet: no designed state for a single line, a range at the start/end of the transcript (**Line before**/**Line after** disabled), or the **Attach what was just said** switch turned on.
- Phone **My notes**: no empty list state, no "session ended" variant of the live banner, and no filtered-empty state (for example **Clips 0**). The desktop empty state copy may be reused.
- No designed state for **Clip last 30s** before any caption has arrived (contracts disable it).
- Phone note save goes to My notes; phone clip save returns to the transcript. No toast is designed on phone.
- The selected-line style (`primary` at 12–14% with an inset ring) is the same on phone and desktop.
