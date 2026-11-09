/**
 * What attendees are told before joining. Provisional: Tracks 2 and 3 have not
 * yet confirmed provider retention and the storage policy (building tracks).
 */
export const AttendeeDisclosure = () => (
  <section
    aria-labelledby="disclosure-heading"
    className="flex flex-col gap-2 rounded-lg border p-4 text-sm"
  >
    <h2 id="disclosure-heading" className="font-medium">
      Before you join
    </h2>
    <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
      <li>Your device never uses its microphone or camera.</li>
      <li>
        The host&apos;s microphone audio is sent to a transcription service to
        make captions that everyone in this session can read.
      </li>
      <li>Moments you save and notes you write are private to this device.</li>
    </ul>
    <p className="text-xs text-muted-foreground">
      Provisional: how long captions and screenshots are kept is still being
      confirmed.
    </p>
  </section>
);
