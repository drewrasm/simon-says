import {
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
  type Attributes,
} from "@opentelemetry/api";

export const PRIVATE_SCOPE = "simon-says.private";
export const PRIVATE_SPAN_NAMES = [
  "bookmark.save",
  "search.query",
  "recap.create",
  "recap.generate",
] as const;
type PrivateSpanName = (typeof PRIVATE_SPAN_NAMES)[number];
const outcomes = ["success", "error", "stale", "skipped"] as const;
const errorCodes = [
  "request_failed",
  "source_unavailable",
  "no_resolved_evidence",
  "no_valid_citations",
  "generation_timeout",
  "generation_failed",
] as const;
type PrivateOutcome = (typeof outcomes)[number];
export type PrivateErrorCode = (typeof errorCodes)[number];

export const safePrivateAttributes = (input: Attributes): Attributes => {
  const output: Attributes = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      (key === "duration_ms" || key === "http.response.status_code") &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0
    )
      output[key] = value;
    if (
      key === "operation" &&
      PRIVATE_SPAN_NAMES.some((name) => name === value)
    )
      output[key] = value;
    if (key === "outcome" && outcomes.some((outcome) => outcome === value))
      output[key] = value;
    if (key === "error_code" && errorCodes.some((code) => code === value))
      output[key] = value;
  }
  return output;
};

type SpanResult = {
  outcome: PrivateOutcome;
  errorCode?: PrivateErrorCode;
  status?: number;
};

export const startPrivateSpan = (name: PrivateSpanName) => {
  const span = trace
    .getTracer(PRIVATE_SCOPE)
    .startSpan(name, { attributes: { operation: name } }, ROOT_CONTEXT);
  const started = performance.now();
  return ({ outcome, errorCode, status }: SpanResult) => {
    span.setAttributes(
      safePrivateAttributes({
        outcome,
        error_code: errorCode,
        duration_ms: performance.now() - started,
        "http.response.status_code": status,
      }),
    );
    span.setStatus({
      code: outcome === "error" ? SpanStatusCode.ERROR : SpanStatusCode.OK,
    });
    span.end();
  };
};

export const tracePrivateHttp = async (
  name: Exclude<PrivateSpanName, "recap.generate">,
  operation: (fail: (code: PrivateErrorCode) => void) => Promise<Response>,
) => {
  const finish = startPrivateSpan(name);
  let errorCode: PrivateErrorCode | undefined;
  let status: number | undefined;
  try {
    const response = await operation((code) => {
      errorCode = code;
    });
    status = response.status;
    if (status >= 400) errorCode ??= "request_failed";
    return response;
  } catch (error) {
    errorCode = "request_failed";
    throw error;
  } finally {
    finish({
      outcome: errorCode ? "error" : "success",
      ...(errorCode ? { errorCode } : {}),
      ...(status === undefined ? {} : { status }),
    });
  }
};
