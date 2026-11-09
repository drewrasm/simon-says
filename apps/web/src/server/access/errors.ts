export class AccessError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 413 | 429,
    public readonly code:
      | "invalid_request"
      | "not_found"
      | "already_host"
      | "payload_too_large"
      | "recap_in_progress",
  ) {
    super(code);
  }
}
