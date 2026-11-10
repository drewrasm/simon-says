# Host auth, emails and public landing designs

Reference specs for the public landing page, host sign-in and sign-up, the account-required gate, and the sign-in emails, taken from the "Live Transcript Sessions" [design canvas](https://claude.ai/artifact/KF6169ajAr4SdR1frk3jta) (version `1794263890-a1e6`, artboards `HostLanding`, `HostSignIn`, `HostSignUp`, `HostGate`, `EmailCode` and `EmailLink`). The canvas remains the source of truth; update this page when it changes. See the [index](index.md) for every artboard.

Routes: `HostLanding` is `/`. The others are not built.

## Tokens

Light theme. Uses the [shared tokens](../lobby-and-join-designs.md#shared-tokens). Additional values:

| Role                                  | Canvas value                                                       | Token                                     |
| ------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------- |
| Auth page background                  | `oklch(98.5% 0 0)`                                                 | `sidebar`                                 |
| Auth brand panel                      | `oklch(14.5% 0.008 326)`                                           | `foreground` (`.dark` `background`)       |
| Brand panel muted text                | `oklch(71.1% 0.019 323.02)`                                        | `ring` (`.dark` `muted-foreground`)       |
| Brand panel list text, host card text | `oklch(86.5% 0.012 325.68)`                                        | `chart-1` (no semantic token)             |
| Landing lead text, email meta text    | `oklch(43.5% 0.029 321.78)`                                        | `chart-3` (no semantic token)             |
| Error text                            | `oklch(50.5% 0.213 27.518)`                                        | `live-foreground` (or `destructive` text) |
| Error box border                      | `oklch(57.7% 0.245 27.325)`                                        | `destructive` / `live`                    |
| Success circle fill / icon            | `oklch(59.6% 0.145 163.225 / 0.12)` / `oklch(50.8% 0.118 165.612)` | `success` at 12% / `success-foreground`   |
| Gate scrim                            | `oklch(0% 0 0 / 0.5)`                                              | black at 50%                              |
| Email canvas background               | `oklch(96% 0.003 325.6)`                                           | `muted`                                   |

Form controls on these pages are 40px tall, padding 0 12px, radius 8px, 1px `border`, white fill, `shadow-xs`, 15px/400. Primary buttons are 40px, radius 8px, `primary` fill, 14px/500.

---

## Public home — Join or host (`HostLanding`, 1440×900, fills width)

### Header

- White bar, bottom border, padding 12px 24px, gap 12px, wraps.
- Brand mark (grows).
- **Host sign in** — ghost link, 32px, padding 0 10px, 14px/500 → `HostSignIn`.
- **Host a session** — primary link, 32px, padding 0 12px, 14px/500 → `HostSignUp`.

### Main (max-width 1120px, centered, padding 72px 24px 48px, column gap 56px)

- Hero (max-width 720px, gap 16px):
  - H1 **"Every word of your talk, on every phone in the room."** 52px/700, line-height 1.08, letter-spacing −0.01em.
  - Lead 18px line-height 1.6 `chart-3`: _Simon Says transcribes you live. Your audience scans a code and reads along at their own text size, then clips the moments they want to keep._
- Two cards (wrap, gap 16px, each flex `1 1 360px`, padding 24px, gap 14px):
  - **Join a session** — white card with border and `shadow-xs`. H2 18px/600; 14px muted _No account needed. Just the code from the screen._ Inline form (gap 8px): visually hidden label **"Session code"** for `land-code`; input grows, placeholder **KQ742M**, 16px/600, letter-spacing 0.08em, lining nums; **Join** — outline link button, 40px, padding 0 16px, 14px/500.
  - **Host a session** — `primary` fill, `primary-foreground` text, no border. H2 18px/600; 14px `chart-1` _Create a host account with just your email. No password._ **Create a host account** — 40px, padding 0 16px, `primary-foreground` fill, `primary` text, 14px/600, 15px arrow-right, `align-self: flex-start` → `HostSignUp`.
- Points: grid `repeat(auto-fit, minmax(240px, 1fr))`, gap 24px. Each: title 15px/600 over body 14px line-height 1.6 muted, gap 6px.
  - **Share with a code** — _Put the join code or QR on screen. Guests are reading along in seconds._
  - **Fix lines as you go** — _Correct a misheard word and it updates on every guest's screen._
  - **Keep the transcript** — _Download the full transcript after every session._

---

## Split auth layout (`HostSignIn`, `HostSignUp`)

- Row, wraps, min-height 900px, `sidebar` background.
- **Brand panel** (flex `1 1 420px`, min-height 320px): `foreground` fill, light text, padding 40px 48px, column gap 24px. Brand mark on dark (light tile, dark icon) at top; message block pinned to the bottom (`margin-top: auto`).
- **Form panel** (flex `999 1 520px`): padding 40px 24px, content centered; inner column gap 24px, full width, max-width 380px (sign-in) / 400px (sign-up).
- Heading block (gap 6px): H1 26px/700 line-height 1.2; body 14px line-height 1.5 muted.
- **Code entry** (both flows): six display boxes in a 6-column grid, gap 8px, `aria-hidden`; each 52px tall, radius 8px, white fill, `shadow-xs`, 24px/600 digit. Transparent full-size input on top: `inputmode="numeric"`, `autocomplete="one-time-code"`, `maxlength="6"`, digits only, visually hidden label **"6-digit code"**. Borders: default 1px `border`; active (next empty) 2px `primary`; error 2px `destructive`. Error text (`role="alert"`, 13px error colour, margin-top −8px): _That code didn't match. Check the latest email and try again._
- Inline text buttons: 13px/500, underlined (offset 3px), `primary` or muted.
- Success icon: 48×48 circle, `success` 12% fill, 24px `success-foreground` check.

---

## Host — Sign in (code or link) (`HostSignIn`, 1440×900, fills width)

Brand panel message (max-width 460px, gap 14px): **"Everyone in the room can read along, live."** 32px/600 line-height 1.25; 15px line-height 1.6 `ring` _Start a session, share the code, and your words appear on every guest's screen as you speak._

A canvas option (**method**: Email code / Magic link) picks which step follows the email step.

### Step 1 — Email

- **"Sign in to Simon Says"**; _Enter your email and we'll send you a code. No password needed._
- Form (gap 10px): label **"Work email"** 14px/500 for `h-email`; email input, `autocomplete="email"`, placeholder _you@company.com_, value _jordan@company.com_; submit (margin-top 4px): **Email me a code** (code method) or **Email me a sign-in link** (link method).
- 13px muted: _New to hosting?_ **Create a host account** (500, → `HostSignUp`).
- 12px muted line-height 1.5: _By continuing you agree to the_ **Terms** _and_ **Privacy Policy**.

### Step 2a — Code

- **"Check your email"**; _Enter the 6-digit code we sent to_ **jordan@company.com**.
- Code entry and error as above.
- Text buttons (wrap, gap 4px 16px): **Resend code** (`primary`; becomes **New code sent**), **Email me a link instead** (`primary`, → step 2b), **Use a different email** (muted, → step 1).

### Step 2b — Magic link

- 48×48 `muted` tile, radius 12px, 24px mail-check icon.
- **"Check your inbox"**; _We sent a sign-in link to_ **jordan@company.com**. _Click it to finish signing in. This tab will update on its own._
- Waiting row: padding 12px 14px, radius 10px, `muted` fill, 13px `chart-3`, 8px `ring` dot, gap 10px: _Waiting for you to click the link…_
- 2-column grid, gap 8px, outline buttons 36px, 14px/500: **Resend link** (becomes **Link sent again**), **Enter code instead** (→ step 2a).
- A dashed **Prototype: pretend the link was clicked** button is canvas-only; do not build it.
- **Use a different email** text button (muted, → step 1).

### Step 3 — Done

- Success icon; **"You're in"**; _Signed in as jordan@company.com. You'll stay signed in on this computer for 30 days._
- **Go to your sessions** — primary link, full width → `HostSessions`.

---

## Host — Sign up (no password) (`HostSignUp`, 1440×900, fills width)

Brand panel: brand mark is a link to `HostLanding`. Message (max-width 440px, gap 20px): **"Set up your host account in about a minute."** 30px/600 line-height 1.25, then a list (gap 12px), each item 15px line-height 1.5 `chart-1` with an 18px check icon, gap 10px:

- No password. Sign in with a code sent to your email.
- Start sessions and share them with a code or QR.
- Keep a transcript of every talk you give.

### Progress

`<ol aria-label="Sign-up progress">`, 3-column grid, gap 8px; shown on the first three steps only. Each step: 4px bar (fully rounded; `primary` when reached, `border` otherwise) over a 12px label (600 when current, `foreground` when reached, muted otherwise), gap 6px. Current step has `aria-current="step"`. Labels: **Email**, **Confirm**, **Your details**.

### Step 1 — Email

- **"Create your host account"**; _You need an account to start a session. We'll email you a code to confirm it's you. There's no password to create._
- Label **"Email"** for `su-email`, placeholder _you@company.com_; **Email me a code**.
- 13px muted: _Already a host?_ **Sign in** (→ `HostSignIn`).

### Step 2 — Confirm

- **"Confirm your email"**; _Enter the 6-digit code we sent to_ **jordan@company.com**.
- Code entry and error; text buttons **Resend code** (→ **New code sent**), **Use a different email**.
- On the correct code: new email → step 3; an email that already has a host account → **Welcome back** (canvas option **existingHost**).

### Step 3 — Your details

- **"A bit about you"**; _Guests see your name on the sessions you host._
- Form (gap 16px):
  - **Your name** (`su-name`, `autocomplete="name"`), value _Jordan Lee_.
  - **Organization or event** + 400 muted **(optional)** (`su-org`, `autocomplete="organization"`), placeholder _e.g. DevConf 2026_.
  - Fieldset, legend **"Where will you use Simon Says?"** 14px/500 (margin-bottom 8px). `role="radiogroup"`, wraps, gap 8px. Pill radios 36px tall, padding 0 14px, fully rounded, 14px/500: selected `primary` fill and border with `primary-foreground` text; unselected white with `border`. Options: **Conferences** (selected), **Classes**, **Meetings**, **Something else**.
  - **Create host account** — primary submit; disabled (opacity 0.5, `not-allowed`) while the name is blank.

### Done

- Success icon; **"You're all set, Jordan"** (first name); _Your host account for jordan@company.com is ready. Next time, just enter your email to sign in._
- **Set up your first session** — primary link with 15px arrow-right → `HostSessionsEmpty`.

### Welcome back (existing host)

- 48×48 `muted` circle with 24px log-in icon.
- **"Welcome back, Jordan"**; _You already have a host account with jordan@company.com, so we've signed you in. Your sessions are right where you left them._
- **Go to your sessions** — primary link with arrow-right → `HostSessions`.

---

## Host — Account required to start (`HostGate`, 1440×900, fills width)

A modal over a skeleton of the landing page.

- Background (`aria-hidden`): 52px white header bar with bottom border; then (max-width 1120px, padding 72px 24px, gap 16px) two 44px `border`-grey bars (70% and 52% width, radius 8px), a 16px `muted` bar (60%, margin-top 12px), and two 160px cards (white with border; `primary`) side by side, margin-top 40px. Scrim black 50%.
- Dialog (`role="dialog"`, `aria-modal="true"`, `aria-labelledby="gate-title"`), centered with 24px page padding: max-width 440px, white, 1px border, radius 14px, shadow `0 24px 48px rgb(0 0 0 / 0.25)`, padding 24px, column gap 18px.
  - Header row (gap 12px): H2 `id="gate-title"` **"Create a host account to start a session"** 18px/700 line-height 1.3; 14px muted line-height 1.5 _Sessions belong to a host, so we need to know who's running this one. It takes about a minute._ Close: 32×32 ghost, 16px X, muted, `aria-label="Close"`, margin −4px −4px 0 0 → `HostLanding`.
  - Checklist (gap 10px), 14px line-height 1.5, 16px check icons, gap 10px:
    - No password. We email you a 6-digit code.
    - Your sessions and transcripts stay in one place.
    - Notes you saved as a guest stay linked to the same email.
  - Field (gap 8px): label **"Email"** for `gate-email`; input value _alex@example.com_; helper 12px muted _Filled in from the email you saved your notes with._
  - Actions (right-aligned, wraps, gap 8px), 36px, padding 0 14px, 14px/500: **Not now** (outline → `HostLanding`), **Email me a code** (primary → `HostSignUp`).
  - 13px muted: _Already a host?_ **Sign in** (→ `HostSignIn`).

---

## Emails (`EmailCode`, `EmailLink`, 600×720)

Both are the guest "save your notes" emails sent from `GuestSignIn` / `GuestOTP` / `GuestMagicLink`.

- Canvas: `muted` background, padding 24px 32px, column gap 20px.
- Meta block (13px `chart-3`, gap 4px): **Subject:** and **From:** labels 600 `foreground`. From: _Simon Says <signin@simonsays.live>_.
- Body card: white, 1px border, radius 14px, padding 36px 40px, column gap 20px. Brand mark; H1 24px/700; paragraph 15px line-height 1.6 `chart-3`.
- Divider 1px `border`; security note 13px line-height 1.6 muted.
- Footer below the card, centered 12px muted: _Simon Says · Live transcripts for talks_

### Email — Sign-in code (`EmailCode`)

- Subject: **482913 is your Simon Says code**
- H1 **"Your Simon Says code"**; _Enter this code in Simon Says to save your notes to this email. It expires in 10 minutes._
- Code box: padding 20px, radius 10px, `muted` fill, centered, 40px/700, letter-spacing 0.18em: **482 913**.
- 14px muted line-height 1.6: _There's no account to create and no password to remember. Use this email again on any device to get your notes back._
- Security note: _Didn't try to sign in? You can ignore this email. No one can get in without this code._

### Email — Magic link with code fallback (`EmailLink`)

- Subject: **Save your Simon Says notes**
- H1 **"Save your notes"**; _Open this link in the same browser you took notes in to save them to alex@example.com. It works once and expires in 15 minutes._
- **Save my notes** — primary link button, 44px, padding 0 22px, radius 8px, 15px/600, `align-self: flex-start`.
- Fallback box: padding 14px 16px, radius 10px, `muted` fill, gap 8px. 13px `chart-3` _Opened this in a different app or device? Enter this code in Simon Says instead:_ then **482 913** 24px/700 letter-spacing 0.16em.
- Security note: _Didn't try to sign in? You can ignore this email. No one can get in without this link or code._

## Notes for implementation

- Code length is 6 digits; the email shows it grouped `482 913`, and the subject line carries it ungrouped so it can be copied from a notification.
- No host-specific sign-in or sign-up email is designed; the only emails are guest-facing. Reuse the layout with host copy, or confirm with design.
- No designed **sending/loading** state on any submit, no invalid-email error, no rate-limit, **expired code** or **expired/used link** state, and no state for the link opened in another browser.
- **HostLanding**: no designed invalid or unknown join-code error on the inline join form.
- **HostGate**: the email is prefilled from a guest's saved-notes email; the empty-field variant and its validation are not drawn. No designed focus-trap or close-on-scrim behaviour.
- Sign-out, account settings and the avatar menu are not designed.
- **Prototype: pretend the link was clicked** is a canvas affordance only.
