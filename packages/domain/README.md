# Domain

Pure timeline rules with no UI, database, or provider dependencies. Import modules by path.

- `@simon-says/domain/audio-level`: 20 ms quiet/speech classification with an adaptive noise floor.
- `@simon-says/domain/caption-windows`: decides when to pre-open and rotate live transcription windows so cuts land in pauses.
- `@simon-says/domain/caption-timing`: estimates source-clock ranges for live text and splits final text into timed sentences.
