# Guest Ask designs

Reference specs for Ask, the AI answers about the talk, taken from the "Live Transcript Sessions" [design canvas](https://claude.ai/artifact/KF6169ajAr4SdR1frk3jta) (version `1794263890-a1e6`, artboards `GuestDesktopAsk` and `GuestPhoneAsk`). The canvas remains the source of truth; update this page when it changes. See the [index](index.md) for every artboard.

Route: not built. Opened from **Ask** on the guest reader (`/session/:id`).

Dark theme; colours use the [dark tokens](guest-reader.md#dark-tokens).

## Shared pieces

- **User message**: right-aligned bubble, max-width 85%, padding 10px 14px, `muted` fill. Desktop radius 14px, 15px line-height 1.5; phone radius 16px, 16px line-height 1.45.
- **Answer** (column gap 10px):
  - Source line: 13px search icon + 12px `muted-foreground` tabular nums, gap 6px, e.g. _Read 9 lines · 00:12:04 – 00:13:18_, _Read the last 2 minutes · 00:11:24 – 00:13:24_, _Searched for "hear" · 2 matches_, _Searched the transcript · no matches_.
  - Body paragraph line-height 1.7 (15px desktop, 16px phone); optional bulleted list (padding-left 20px, gap 6px, line-height 1.6).
  - **Citation chip** inline after the claim: pill 22px (desktop) / 24px (phone) tall, padding 0 7px / 0 8px, margin 0 2px, vertical-align 1px, 1px white-18% border, `muted` fill, `primary` text (light grey), 12px/600 tabular nums. Label is the talk time, e.g. `00:12:38`; `aria-label="Jump to 00:12:38 in the transcript"`. Desktop: a button that highlights the cited line in the transcript. Phone: a link back to the transcript.
  - Actions (margin-left −6px desktop / −10px phone, gap 4px): **Copy answer** icon button (copy icon, `muted-foreground`; 32×32 desktop, 44×40 phone) and **Save to notes** ghost button (notebook-tabs icon, 13px/500 desktop, 14px/500 phone). After saving the label becomes **Saved** and a toast shows _Saved to My notes_.
- **Pending** (`role="status"`): three 6px dots (`muted-foreground`, `62%` tone, `chart-2`), gap 4px, then _Reading the transcript…_ (13px desktop / 14px phone, `muted-foreground`). Suggestions are hidden while pending.
- **Suggestions**: pill buttons, 1px `input` border, transparent, fully rounded. Already-asked suggestions are removed.
- **Send button**: circle, `primary` fill, `primary-foreground` arrow-up icon, `aria-label="Send"`. Disabled (opacity 0.4, `not-allowed`) when the draft is blank or an answer is pending.
- **Disclaimer**: 11px `muted-foreground`, centered.

### Sample answers

| Question                               | Source line                                   | Answer                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What's the main point so far?          | Read 9 lines · 00:12:04 – 00:13:18            | Jordan is explaining why they built live transcripts for talks. Last year the audio in the back rows of this room was poor `00:12:38` and people said they missed about half the session `00:12:47`. What they asked for was a way to read along on their own phones `00:13:06`. Jordan calls that the easy part. The harder part, which seems to be coming up next, is making the transcript useful after the talk `00:13:18`. |
| What did I miss in the last 2 minutes? | Read the last 2 minutes · 00:11:24 – 00:13:24 | Here's what was said in the last two minutes: • Last year's session here had bad audio in the back rows `00:12:38` • People said they missed about half of it `00:12:47` • They asked to read along on their phones, which led to this app `00:13:06` • Next: making transcripts useful after the talk `00:13:18`                                                                                                               |
| Turn this into bullet notes            | Read 9 lines · 00:12:04 – 00:13:18            | Notes so far: • The talk is transcribed live, and you can follow along by scanning the code `00:12:11` • Problem: poor audio in the back rows last year `00:12:38` • Who it affected: people who are hard of hearing, second-language listeners, people near a noisy vent `00:12:55` • Fix: let attendees read along on their phones `00:13:06` • Open question: how to make it useful after the talk `00:13:18`                |
| Who was having trouble hearing?        | Searched for "hear" · 2 matches               | Jordan named three groups: people who are hard of hearing, people listening in their second language, and people sitting under a loud air vent `00:12:55`. They were among the attendees who said they missed about half of last year's session `00:12:47`.                                                                                                                                                                     |
| (anything not covered)                 | Searched the transcript · no matches          | The speaker hasn't covered that yet, so I can't answer it from the transcript. Try again later in the talk, or add it as a note to ask during Q&A.                                                                                                                                                                                                                                                                              |

Phone answers are shorter versions of the same text (desktop wording above).

---

## Guest — Desktop ask about the talk (`GuestDesktopAsk`, 1440×900, fills width)

### Header

Same brand, divider and title group as [`GuestDesktop`](guest-reader.md). Single action: **Close panel** — ghost, 32px, 14px/500, 15px X → `GuestDesktop`.

### Transcript (left, flex `999 1 520px`, `aria-label="Live transcript"`)

- Padding 28px 40px. Column max-width 760px, height 780px, scrolls, bottom-aligned, gap 4px.
- Rows: grid `72px minmax(0, 1fr)`, gap 16px, padding 8px 14px, radius 10px. Timestamp 12px `62%` tone, padding-top 5px. Text 20px line-height 1.5, `80%` tone.
- **Cited line highlighted** (after clicking a citation): `primary` 12% fill with inset 1px ring at 30%, text `foreground`.
- Nine lines `00:12:04` to `00:13:18` (same text as the live console), then the **Now** interim row (20px `muted-foreground`, caret).

### Ask panel (right, flex `1 1 460px`, `aria-label="Ask about this talk"`)

- `card` fill, left `border`, column, full height.
- Panel header: padding 14px 16px, bottom `border`, gap 8px.
  - Panel switcher `<nav aria-label="Panel">`: `muted` fill, padding 3px, radius 10px, gap 2px. Items 30px tall, padding 0 12px, radius 8px, 14px. **My notes** (link → `GuestDesktopClip`, 500, `muted-foreground`); **Ask** (current, `aria-current="page"`, `background` fill, 600, 14px sparkles icon, shadow `0 1px 2px rgb(0 0 0 / 0.3)`).
  - Spacer; **New chat** — outline 32px, 13px/500, 14px plus icon. Clears the conversation.
- Conversation (grows, scrolls, padding 20px 16px, gap 20px).
  - **Empty state** (no messages; padding 24px 4px 8px, gap 8px): 40×40 `muted` tile radius 10px with 20px sparkles; H2 **"Ask about this talk"** 20px/700 (margin-top 4px); 14px line-height 1.55 `muted-foreground`: _Catch up, check what you heard, or turn the talk into notes. Answers come from the transcript and link to the moment it was said._
  - Artboard state: one exchange, _What's the main point so far?_ and its answer.
  - Suggestions block (gap 8px): label 12px/500 `muted-foreground` **"Try asking"** (empty) or **"Ask a follow-up"**; pills 34px tall, padding 0 12px, 13px/500, wrap with gap 8px: _What's the main point so far?_, _What did I miss in the last 2 minutes?_, _Turn this into bullet notes_, _Who was having trouble hearing?_
- Composer area (padding 12px 16px 16px, gap 8px):
  - Toast above the form (padding 8px 12px, radius 10px, `success` 14%, `success-foreground`, 13px/500, 14px circle-check): _Saved to My notes_.
  - Form: padding 10px 10px 8px 14px, radius 14px, 1px `input` border, `background` fill, gap 8px. Visually hidden label **"Ask about this talk"** for `ask-input`. Textarea 2 rows, borderless, 15px line-height 1.5; placeholder _Ask anything about the talk so far…_
  - Form row: **scope** button — 30px, padding 0 10px, margin-left −4px, radius 8px, `muted` fill, `primary` text, 12px/500, 13px clock icon, 12px chevron-down: **"Whole talk, up to 00:13:24"**; spacer; 32×32 send button (16px icon).
  - Disclaimer: _Answers use only this talk's transcript and can be wrong. Tap a timestamp to check._

---

## Guest — Phone ask about the talk (`GuestPhoneAsk`, 390×844 phone)

Column layout, `background`.

### Header

- Padding 44px 8px 10px 4px, bottom `border`, gap 4px.
- 44×44 back link (22px chevron-left, `aria-label="Back to transcript"`) → `GuestLive`.
- Title (grow, gap 2px): H1 **"Ask about this talk"** 17px/700; 12px `muted-foreground` with 6px `live` dot, gap 6px: _Opening Keynote · up to 00:13:24_.
- 44×44 **New chat** icon button (20px square-pen).

### Conversation (grows, scrolls, padding 18px 16px, gap 18px)

- **Empty state** (padding-top 24px, gap 8px): 44×44 `muted` tile radius 12px with 22px sparkles; H2 **"Stepped out? Catch up."** 22px/700 (margin-top 4px); 15px line-height 1.55 `muted-foreground`: _Ask anything about what's been said. Answers link back to the moment in the transcript._
- Artboard state: one exchange, _What did I miss in the last 2 minutes?_ with source _Read the last 2 minutes_ and a four-item bulleted answer.

### Bottom bar

- Padding 10px 16px 28px, top `border`, `card` fill, column gap 10px.
- Suggestions: horizontal scroll row (margin 0 −16px, padding 0 16px, gap 8px); pills 36px tall, padding 0 14px, 14px/500, no wrap: _What's the main point?_, _What did I miss?_, _Bullet notes so far_, _Who had trouble hearing?_
- Form: padding 6px 6px 6px 14px, radius 22px, 1px `input` border, `background` fill, gap 8px, bottom-aligned. Hidden label for `ask-phone`. Textarea 1 row, min-height 32px, padding 6px 0, 16px line-height 1.3; placeholder _Ask about the talk…_. 36×36 send button (18px icon).
- Below the form, one of: toast `role="status"` 12px/500 `success-foreground` _Saved to My notes_, or the disclaimer _Answers use only this talk's transcript and can be wrong._

## Notes for implementation

- Answers are canned on the canvas (keyword matched, 1.2s delay). No **streaming** answer, **error** (model or network failure), **rate limit** or **retry** state is designed.
- The **scope** button (_Whole talk, up to 00:13:24_) has no designed menu; phone has no scope control at all.
- No designed state for Ask before the talk starts, after it ends, or when the host disables it (no host setting exists for Ask in `HostCreate` or `Main`).
- No designed feedback for **Copy answer**. A saved answer has no designed card in My notes.
- Desktop citations highlight one transcript line; there is no designed scroll-to or multi-line highlight. Phone citations link to the transcript without a designed highlighted state.
- No designed long-conversation behaviour (scroll anchoring, truncation).
