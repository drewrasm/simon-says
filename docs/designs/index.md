# Design canvas index

Every artboard on Page 1 of the "Live Transcript Sessions" [design canvas](https://claude.ai/artifact/KF6169ajAr4SdR1frk3jta) (version `1794263890-a1e6`, 23 artboards). The canvas remains the source of truth; update these pages when it changes.

Artboard ids are the canvas file names without `.dc.html`. "Fills width" artboards are drawn at 1440×900 but stretch to the viewport. Sections are the canvas row titles, top to bottom.

| Artboard id         | Name on canvas                          | Size            | Theme | Canvas section                                           | Route                        | Spec                                                   |
| ------------------- | --------------------------------------- | --------------- | ----- | -------------------------------------------------------- | ---------------------------- | ------------------------------------------------------ |
| `Main`              | Host — Live console                     | 1440×900, fills | Light | Host & guest views                                       | `/host/:id` live console     | [host-live-console](host-live-console.md)              |
| `GuestJoin`         | Guest — Join                            | 390×844         | Light | Host & guest views                                       | `/join`, `/join/:inviteCode` | [lobby-and-join-designs](../lobby-and-join-designs.md) |
| `GuestLive`         | Guest — Live transcript                 | 390×844         | Dark  | Host & guest views                                       | `/session/:id`               | [guest-reader](guest-reader.md)                        |
| `GuestDesktop`      | Guest — Desktop full screen             | 1440×900, fills | Dark  | Guest desktop, clips & notes                             | `/session/:id`               | [guest-reader](guest-reader.md)                        |
| `GuestDesktopClip`  | Guest — Desktop clipping to notes       | 1440×900, fills | Dark  | Guest desktop, clips & notes                             | `/session/:id`               | [guest-clips-notes](guest-clips-notes.md)              |
| `GuestPhoneClip`    | Guest — Phone clip sheet                | 390×844         | Dark  | Guest desktop, clips & notes                             | `/session/:id`               | [guest-clips-notes](guest-clips-notes.md)              |
| `GuestPhoneNote`    | Guest — Phone note sheet                | 390×844         | Dark  | Guest desktop, clips & notes                             | `/session/:id`               | [guest-clips-notes](guest-clips-notes.md)              |
| `GuestPhoneNotes`   | Guest — Phone my notes                  | 390×844         | Dark  | Guest desktop, clips & notes                             | `/session/:id/notes`         | [guest-clips-notes](guest-clips-notes.md)              |
| `HostSessions`      | Host — Sessions                         | 1440×900, fills | Light | Host: creating a session                                 | not built                    | [host-create](host-create.md)                          |
| `HostCreate`        | Host — New session                      | 1440×900, fills | Light | Host: creating a session                                 | `/host/new`                  | [host-create](host-create.md)                          |
| `HostReady`         | Host — Lobby, ready to go live          | 1440×900, fills | Light | Host: creating a session                                 | `/host/:id` lobby            | [lobby-and-join-designs](../lobby-and-join-designs.md) |
| `GuestSignIn`       | Guest — Save notes with email           | 390×844         | Dark  | Guests save notes with email (no sign-up) · Host sign-in | not built                    | [guest-save-notes-email](guest-save-notes-email.md)    |
| `GuestOTP`          | Guest — Enter email code                | 390×844         | Dark  | Guests save notes with email (no sign-up) · Host sign-in | not built                    | [guest-save-notes-email](guest-save-notes-email.md)    |
| `GuestMagicLink`    | Guest — Magic link sent                 | 390×844         | Dark  | Guests save notes with email (no sign-up) · Host sign-in | not built                    | [guest-save-notes-email](guest-save-notes-email.md)    |
| `HostSignIn`        | Host — Sign in (code or link)           | 1440×900, fills | Light | Guests save notes with email (no sign-up) · Host sign-in | not built                    | [host-auth](host-auth.md)                              |
| `EmailCode`         | Email — Sign-in code                    | 600×720         | Light | Guests save notes with email (no sign-up) · Host sign-in | not built (email template)   | [host-auth](host-auth.md)                              |
| `EmailLink`         | Email — Magic link (with code fallback) | 600×720         | Light | Guests save notes with email (no sign-up) · Host sign-in | not built (email template)   | [host-auth](host-auth.md)                              |
| `HostLanding`       | Public home — Join or host              | 1440×900, fills | Light | Host sign-up: no password, account required to start     | `/`                          | [host-auth](host-auth.md)                              |
| `HostSignUp`        | Host — Sign up (no password)            | 1440×900, fills | Light | Host sign-up: no password, account required to start     | not built                    | [host-auth](host-auth.md)                              |
| `HostSessionsEmpty` | Host — First run, no sessions yet       | 1440×900, fills | Light | Host sign-up: no password, account required to start     | not built                    | [host-create](host-create.md)                          |
| `HostGate`          | Host — Account required to start        | 1440×900, fills | Light | Host sign-up: no password, account required to start     | not built                    | [host-auth](host-auth.md)                              |
| `GuestDesktopAsk`   | Guest — Desktop ask about the talk      | 1440×900, fills | Dark  | Ask: AI answers about the talk                           | `/session/:id`               | [guest-ask](guest-ask.md)                              |
| `GuestPhoneAsk`     | Guest — Phone ask about the talk        | 390×844         | Dark  | Ask: AI answers about the talk                           | `/session/:id`               | [guest-ask](guest-ask.md)                              |

## Notes

- Light artboards use the tokens in [lobby-and-join-designs](../lobby-and-join-designs.md#shared-tokens). Dark artboards use the `.dark` tokens listed in [guest-reader](guest-reader.md#dark-tokens).
- `HostSessions` and `HostSessionsEmpty` are the signed-in host home. The app has no host home route yet; `/` is the public landing (`HostLanding`).
- `HostGate` is a modal over a blurred landing page, shown when a signed-out visitor tries to start a session (for example on `/host/new`).
- `EmailCode` and `EmailLink` are the guest "save your notes" emails. Their copy is guest-facing; the host sign-in screens reuse the same code flow but no host-specific email is designed.
