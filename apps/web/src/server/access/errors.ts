export class AccessError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    public readonly code: "invalid_request" | "not_found" | "already_host",
  ) {
    super(code);
  }
}
