import {
  joinSessionResponseSchema,
  type JoinSessionRequest,
} from "@simon-says/contracts/session";

export type JoinResult =
  | { kind: "joined"; sessionId: string }
  | { kind: "already_host" }
  | { kind: "not_found" }
  | { kind: "error" };

/** Exchanges an invitation for attendee membership through `POST /api/join`. */
export const requestJoin = async (
  body: JoinSessionRequest,
  fetcher: typeof fetch = fetch,
): Promise<JoinResult> => {
  let response: Response;
  try {
    response = await fetcher("/api/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "error" };
  }

  if (response.status === 409) return { kind: "already_host" };
  // 400 means the code is malformed; to the attendee that is an invalid invitation.
  if (response.status === 404 || response.status === 400) {
    return { kind: "not_found" };
  }
  if (!response.ok) return { kind: "error" };

  const parsed = joinSessionResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success
    ? { kind: "joined", sessionId: parsed.data.sessionId }
    : { kind: "error" };
};
