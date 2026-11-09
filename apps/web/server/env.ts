import type { CaptionDelay } from "../src/server/captions/openai-window";

/** Validate only runtime-owned settings; unused providers remain optional in 0A. */
export function readRuntimeEnv(
  env: Readonly<Record<string, string | undefined>>,
) {
  const appOrigin = readAppOrigin(env.APP_ORIGIN);
  const port = Number(env.PORT ?? "8080");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535.");
  }
  const probeToken = env.PROBE_TOKEN;
  if (probeToken !== undefined && !/^[A-Za-z0-9_-]{32,128}$/.test(probeToken)) {
    throw new Error("PROBE_TOKEN must contain 32–128 URL-safe characters.");
  }
  const captionModel = env.CAPTION_MODEL ?? "gpt-realtime-whisper";
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(captionModel))
    throw new Error("CAPTION_MODEL is invalid.");
  const captionDelay = parseCaptionDelay(env.CAPTION_DELAY ?? "low");
  const captionReconnectGraceMs = Number(
    env.CAPTION_RECONNECT_GRACE_MS ?? "10000",
  );
  if (
    !Number.isInteger(captionReconnectGraceMs) ||
    captionReconnectGraceMs < 0 ||
    captionReconnectGraceMs > 60000
  )
    throw new Error(
      "CAPTION_RECONNECT_GRACE_MS must be an integer from 0 to 60000.",
    );
  const captionsDevSession = env.CAPTIONS_DEV_SESSION;
  if (
    captionsDevSession !== undefined &&
    !/^[A-Za-z0-9._-]{1,200}$/.test(captionsDevSession)
  )
    throw new Error("CAPTIONS_DEV_SESSION is invalid.");
  const openaiApiKey = env.OPENAI_API_KEY;
  if (openaiApiKey !== undefined && !openaiApiKey.trim())
    throw new Error("OPENAI_API_KEY must be nonempty when supplied.");
  const elasticsearchUrl = env.ELASTICSEARCH_URL;
  const elasticsearchApiKey = env.ELASTICSEARCH_API_KEY;
  if (elasticsearchUrl !== undefined) {
    let url: URL;
    try {
      url = new URL(elasticsearchUrl);
    } catch {
      throw new Error(
        "ELASTICSEARCH_URL must be an HTTP(S) origin without credentials.",
      );
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error(
        "ELASTICSEARCH_URL must be an HTTP(S) origin without credentials.",
      );
  }
  if (elasticsearchApiKey !== undefined && !elasticsearchApiKey.trim())
    throw new Error("ELASTICSEARCH_API_KEY must be nonempty when supplied.");
  const elasticsearch =
    elasticsearchUrl && elasticsearchApiKey
      ? { node: elasticsearchUrl, apiKey: elasticsearchApiKey }
      : undefined;
  return {
    elasticsearch,
    port,
    probeToken,
    captionModel,
    captionDelay,
    captionReconnectGraceMs,
    captionsDevSession,
    openaiApiKey,
    // Share validated session configuration; storage remains lazy/optional until
    // a frame request, where s3FrameStore validates all required S3 settings.
    frameEnv: {
      NODE_ENV: env.NODE_ENV,
      DATABASE_URL: env.DATABASE_URL,
      APP_ORIGIN: appOrigin,
      CAPTIONS_DEV_SESSION: captionsDevSession,
      CAPTIONS_DEV_EPOCH: env.CAPTIONS_DEV_EPOCH,
      S3_ENDPOINT: env.S3_ENDPOINT,
      S3_REGION: env.S3_REGION,
      S3_BUCKET: env.S3_BUCKET,
      S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
      S3_FORCE_PATH_STYLE: env.S3_FORCE_PATH_STYLE,
    },
  };
}

function parseCaptionDelay(captionDelay: string): CaptionDelay {
  if (
    captionDelay !== "minimal" &&
    captionDelay !== "low" &&
    captionDelay !== "medium" &&
    captionDelay !== "high" &&
    captionDelay !== "xhigh"
  )
    throw new Error("CAPTION_DELAY is invalid.");
  return captionDelay;
}

/** Server-only browser provenance; never infer trust from Host/forwarding headers. */
function readAppOrigin(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    const url = new URL(value);
    if (["http:", "https:"].includes(url.protocol) && value === url.origin)
      return url.origin;
  } catch {
    // Report the setting name only.
  }
  throw new Error(
    "APP_ORIGIN must be an exact HTTP(S) origin without credentials, path, query or fragment.",
  );
}
