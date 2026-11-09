# Product

Status: planned. Name, shared-session capture, monorepo, Next.js on Kubernetes operated through Radar, and shadcn/ui are confirmed choices. Runtime behavior is unverified.

## Experience

1. The host reviews provider processing and recording/retention policy, selects an authorized microphone input, tests it, and starts a session. A visible stop control ends capture.
2. Attendees see the same processing and retention disclosure before joining by QR code, without microphone permission or a transcription account.
3. Everyone reads the same captions. Scrolling into history pauses auto-follow; **Return to live** restores it.
4. **Keep that** marks the previous 30 seconds of the live session. Selecting a transcript paragraph marks that paragraph's source interval instead.
5. A private card appears immediately, then resolves final text. The attendee can edit, trim, extend within available history, delete, or add a note.
6. Search available session passages by keyword or meaning, inspect the source, and explicitly save a result as a private selection. Show indexing delay or search failure without blocking live captions or saved cards.
7. A personal recap groups selected evidence into takeaways. Every takeaway links to its passage. Export portable HTML or text-only Markdown.

Distinguish a saved marker from resolved evidence. Show incomplete transcript, disconnected, pending sync, and stale recap states explicitly.

## MVP

One session, one desktop host, two or three attendee devices, English captions, live and paragraph marks, private notes, passage search, and a text recap. Support one tested host browser configuration first.

Defer voice commands, multiple rooms, video playback, automatic speaker identity, translation, and background mobile capture. Attendee devices do not listen. Automatic repair transcription is stretch work. The host's screen is not captured; there are no screenshots.

## Evidence rules

- Summarize the attendee's selections, not the whole session. Explicitly select extra context before including it.
- Distinguish spoken claims from personal intentions. A described command is not proof it succeeded.
- Preserve original transcript and correction provenance. Do not present model output as verified quotation.
- Deduplicate overlapping source words without losing separate notes or selection IDs.
- No selections means no generated recap. Generation failure must leave saved passages usable.
- Validate source references and exact evidence excerpts. Human review still determines whether a takeaway is supported.
- Treat transcript text as untrusted source content, never model instructions.

## Limits and demo

A direct mic improves the source, but cannot guarantee every word is transcribed correctly. Questions outside the mic mix are absent unless repeated. Nothing shown on screen is captured.

Demo one presenter. Two attendees mark different moments and receive different recaps. Open each source, reconnect one attendee, and verify the other attendee's private note remains inaccessible. Search for a previously spoken idea, inspect its passage, and save it before generating a recap. Show the four integrations using the [hackathon evidence checklist](https://app.shortcut.com/simon-says/write/IkRvYyI6IjZhZjIzNzc1LTA2YmQtNDllNS04NjZhLTg0NmY2NTczYzk5NyI=). Label fixtures and injected failures.
