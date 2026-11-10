# Guest save notes with email designs

Reference specs for guests saving their notes with an email address (no sign-up, no password), taken from the "Live Transcript Sessions" [design canvas](https://claude.ai/artifact/KF6169ajAr4SdR1frk3jta) (version `1794263890-a1e6`, artboards `GuestSignIn`, `GuestOTP` and `GuestMagicLink`). The canvas remains the source of truth; update this page when it changes. See the [index](index.md) for every artboard. The emails these screens send are in [host-auth](host-auth.md) (`EmailCode`, `EmailLink`).

Route: not built. Entered from **Save with my email** on My notes or **Save them with your email** in the desktop notes panel.

Dark theme; colours use the [dark tokens](guest-reader.md#dark-tokens).

## Shared layout (390×844 phone)

- Column, padding 44px 20px 32px, `background`.
- Back link: 44×44, margin-left −12px, radius 8px, 22px chevron-left.
- H1 28px/700, line-height 1.15. Body 16px line-height 1.5 `muted-foreground`. Emphasised email: `<strong>` 600 `foreground`.
- Primary button: 48px, radius 10px, `primary` fill, `primary-foreground`, 15px/600.
- Secondary button: 44px, radius 10px, 1px `input` border, transparent, 15px/500.
- Text link button: 44px, 14px/500, `primary` text (light grey), no underline.
- Info box: padding 14px, radius 12px, `card` fill, 14px line-height 1.5 `chart-1` text, 18px leading icon, gap 10px.

---

## Guest — Save notes with email (`GuestSignIn`)

- Back link `aria-label="Back to my notes"` → `GuestPhoneNotes`.
- 48×48 `muted` tile, radius 12px, margin-top 28px, 24px notebook-tabs icon.
- Heading block (margin-top 20px, gap 8px): **"Save your notes"**; _Right now they live only in this browser. Add your email and we'll send a 6-digit code. No password, no account to create._
- Form (margin-top 28px, gap 8px):
  - Label **"Email"** 14px/500, `for="g-email"`.
  - Input `type="email"`, `autocomplete="email"`, `inputmode="email"`: 48px, padding 0 14px, radius 8px, `input` border, white 4% fill, 16px/400. Value on the artboard: _alex@example.com_.
  - **Email me a code** — primary, margin-top 8px → `GuestOTP`.
  - **Send me a sign-in link instead** — text link → `GuestMagicLink`.
- Info box (margin-top 16px, sparkles icon): _Saved notes before on another device? Use the same email and we'll merge everything into one list._
- Footer pinned to the bottom, centered, 12px `muted-foreground` line-height 1.5: _By continuing you agree to the_ **Terms** _and_ **Privacy Policy**. (links, underline offset 3px)

---

## Guest — Enter email code (`GuestOTP`)

Back link `aria-label="Back"` → `GuestSignIn`.

### Entry state

- Heading block (margin-top 28px, gap 8px): **"Enter your code"**; _We sent a 6-digit code to_ **alex@example.com**. link **Change** (→ `GuestSignIn`).
- Code field (margin-top 32px): six display boxes in a 6-column grid, gap 8px, `aria-hidden`. Each box 56px tall, radius 10px, white 4% fill, 26px/600 centered digit. Over them a transparent full-size input: `id="otp"`, `inputmode="numeric"`, `autocomplete="one-time-code"`, `maxlength="6"`, digits only, with a visually hidden label **"6-digit code"**.
  - Box borders: default 1px `input`; **active** (next empty box) 2px `primary` (light grey); **error** all boxes 2px `live`.
  - Artboard value: `48` (two digits, third box active).
- Below the boxes (margin-top 14px, 14px):
  - Idle: `muted-foreground` _Tip: the code is in the email's subject line too, so you can copy it from the notification._
  - Error (`role="alert"`, six digits that don't match): `live-foreground`, 16px alert-circle icon, gap 8px: _That code didn't match. Check the latest email and try again._
- Actions (margin-top 28px, gap 4px): **Resend code** secondary button (after pressing: **New code sent**, and the code clears); **Send me a sign-in link instead** text link → `GuestMagicLink`.
- Footer pinned to bottom, centered 12px `muted-foreground`: _Codes expire after 10 minutes._

### Success state (correct code)

- Column, margin-top 40px, gap 14px, left-aligned:
  - 56×56 circle, `success` 15% fill, `success-foreground` 28px check.
  - **"Your notes are saved"**.
  - _The 4 notes from this browser are now linked to alex@example.com. Enter the same email on any device to get them back._
- **Back to my notes** — primary, pinned to the bottom → `GuestPhoneNotes`.

---

## Guest — Magic link sent (`GuestMagicLink`)

- Back link `aria-label="Back"` → `GuestSignIn`.
- 64×64 `muted` tile, radius 16px, margin-top 28px, 30px mail-check icon.
- Heading block (margin-top 20px, gap 8px): **"Check your inbox"**; _Tap the link we sent to_ **alex@example.com** _to save your notes. It works once and expires in 15 minutes._
- Info box (margin-top 24px, smartphone icon): _Open the link in this same browser. Your notes are stored here, so a link opened in another app or device can't find them. The code in the same email works anywhere._
- Actions pinned to the bottom (gap 8px):
  - **Open email app** — primary, 17px mail icon, gap 8px.
  - **Resend link** — secondary.
  - **Enter a code instead** — text link → `GuestOTP`.

## Notes for implementation

- Codes are 6 digits. The guest email displays the code as `482 913` (space is display only). Codes expire after 10 minutes; links after 15 minutes and work once.
- No designed **sending** / loading state on **Email me a code**, **Resend** or **Open email app**, and no invalid-email or send-failure error.
- No designed **expired code**, **too many attempts**, or **expired/used link** state.
- No designed result for opening the magic link (in the same browser or elsewhere), and no "merged notes from another device" confirmation.
- No signed-in state for My notes after saving (the save prompt card presumably disappears; not drawn). No sign-out.
- The success copy count (_The 4 notes_) comes from the local notes; the zero-notes case is not designed.
