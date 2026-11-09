import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenShare, screenShareError } from "./screen-share";

const source = { epoch: 42, getCaptureSampleOffset: () => 24000 };

describe("host screen sharing with the real capture client", () => {
  const track: {
    onended: (() => void) | null;
    stop: ReturnType<typeof vi.fn>;
  } = { onended: null, stop: vi.fn() };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const getDisplayMedia = vi.fn();
  const fetchFrame = vi.fn<typeof fetch>();
  let share: ScreenShare;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    track.onended = null;
    getDisplayMedia.mockResolvedValue(stream);
    fetchFrame.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia } });
    vi.stubGlobal("fetch", fetchFrame);
    vi.stubGlobal("document", {
      createElement: (tag: string) =>
        tag === "video"
          ? {
              videoWidth: 800,
              videoHeight: 600,
              play: vi.fn().mockResolvedValue(undefined),
              pause: vi.fn(),
            }
          : {
              getContext: () => ({ drawImage: vi.fn() }),
              toBlob: (callback: BlobCallback) =>
                callback(new Blob(["synthetic frame"], { type: "image/webp" })),
            },
    });
    share = new ScreenShare("session/id");
  });

  afterEach(() => {
    share.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("requires audio and requests display media in the gesture's synchronous turn", async () => {
    await share.start(null);
    expect(getDisplayMedia).not.toHaveBeenCalled();
    const starting = share.start(source);
    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(share.getSnapshot().screen).toBe("requesting");
    await starting;
    await vi.waitFor(() => expect(fetchFrame).toHaveBeenCalledTimes(1));
    const [url, request] = fetchFrame.mock.calls[0] ?? [];
    expect(url).toBe("/api/sessions/session%2Fid/frames");
    expect(request).toMatchObject({
      method: "POST",
      credentials: "same-origin",
    });
    expect(new Headers(request?.headers).get("X-Frame-Metadata")).toContain(
      '"epoch":42',
    );
    expect(new Headers(request?.headers).get("X-Frame-Metadata")).toContain(
      '"captureSampleOffset":24000',
    );
  });

  it("handles browser stop and re-sharing without reusing frame sequences", async () => {
    await share.start(source);
    await vi.waitFor(() => expect(fetchFrame).toHaveBeenCalledTimes(1));
    track.onended?.();
    expect(share.getSnapshot().screen).toBe("stopped");
    expect(track.stop).toHaveBeenCalled();
    await share.start(source);
    await vi.waitFor(() => expect(fetchFrame).toHaveBeenCalledTimes(2));
    expect(
      new Headers(fetchFrame.mock.calls[1]?.[1]?.headers).get(
        "X-Frame-Metadata",
      ),
    ).toContain('"seq":1');
    share.stop();
    await share.start({ ...source, epoch: 43 });
    await vi.waitFor(() => expect(fetchFrame).toHaveBeenCalledTimes(3));
    expect(
      new Headers(fetchFrame.mock.calls[2]?.[1]?.headers).get(
        "X-Frame-Metadata",
      ),
    ).toContain('"seq":0');
  });

  it("surfaces denied permission and permits another attempt", async () => {
    getDisplayMedia.mockRejectedValueOnce(
      new DOMException("denied", "NotAllowedError"),
    );
    await share.start(source);
    expect(share.getSnapshot().screen).toBe("denied");
    expect(screenShareError(share.getSnapshot())).toContain("blocked");
    await share.start(source);
    expect(share.getSnapshot().screen).toBe("live");
  });

  it.each([403, 409, 503])(
    "exposes upload HTTP %s and clears the warning on recovery",
    async (status) => {
      fetchFrame.mockResolvedValue(new Response(null, { status }));
      await share.start(source);
      await vi.waitFor(() =>
        expect(share.getSnapshot().lastErrorStatus).toBe(status),
      );
      expect(screenShareError(share.getSnapshot())).toContain(String(status));
      fetchFrame.mockResolvedValue(new Response(null, { status: 200 }));
      await vi.advanceTimersByTimeAsync(1000);
      await vi.waitFor(() =>
        expect(share.getSnapshot().uploadFailed).toBe(false),
      );
      expect(screenShareError(share.getSnapshot())).toBeNull();
    },
  );

  it.each([403, 409, 503, 500])(
    "clears the upload HTTP %s alert after sharing stops",
    async (status) => {
      fetchFrame.mockResolvedValue(new Response(null, { status }));
      await share.start(source);
      await vi.waitFor(() =>
        expect(share.getSnapshot().lastErrorStatus).toBe(status),
      );
      expect(screenShareError(share.getSnapshot())).not.toBeNull();
      share.stop();
      expect(share.getSnapshot().screen).toBe("stopped");
      expect(screenShareError(share.getSnapshot())).toBeNull();
    },
  );

  it("releases a pending chooser's stream after audio stops", async () => {
    let resolveStream: (value: typeof stream) => void = () => {};
    getDisplayMedia.mockReturnValueOnce(
      new Promise<typeof stream>((resolve) => {
        resolveStream = resolve;
      }),
    );
    const starting = share.start(source);
    share.stop();
    resolveStream(stream);
    await starting;
    expect(track.stop).toHaveBeenCalled();
    expect(share.getSnapshot().screen).toBe("stopped");
    expect(fetchFrame).not.toHaveBeenCalled();
  });

  it("aborts uploads and stops sampling when audio capture stops", async () => {
    fetchFrame.mockImplementation(async () => new Promise<Response>(() => {}));
    await share.start(source);
    await vi.waitFor(() => expect(fetchFrame).toHaveBeenCalledTimes(1));
    const signal = fetchFrame.mock.calls[0]?.[1]?.signal;
    share.stop();
    expect(signal?.aborted).toBe(true);
    expect(track.onended).toBeNull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchFrame).toHaveBeenCalledTimes(1);
  });
});
