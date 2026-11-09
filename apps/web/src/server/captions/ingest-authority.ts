import "server-only";
import type { IncomingMessage } from "node:http";

export type HostAuthorization = boolean | "session_ended";

export interface IngestAuthority {
  authorizeHost(
    sessionId: string,
    request: Pick<IncomingMessage, "headers">,
  ): HostAuthorization | Promise<HostAuthorization>;
  authorizeMember(
    sessionId: string,
    request: Pick<IncomingMessage, "headers">,
  ): boolean | Promise<boolean>;
  checkEpoch(sessionId: string, epoch: number): boolean;
  /** Read without advancing caption fencing; absent before ingest starts. */
  currentEpoch?(sessionId: string): number | undefined;
}

/** Explicit development opt-in only; production always fails closed. */
export class DevIngestAuthority implements IngestAuthority {
  private readonly epochs = new Map<string, number>();
  constructor(
    private readonly sessionId: string | undefined,
    private readonly production = false,
  ) {}
  authorizeHost(sessionId: string, _request: Pick<IncomingMessage, "headers">) {
    void _request;
    return !this.production && !!this.sessionId && sessionId === this.sessionId;
  }
  authorizeMember(
    sessionId: string,
    request: Pick<IncomingMessage, "headers">,
  ) {
    return this.authorizeHost(sessionId, request);
  }
  checkEpoch(sessionId: string, epoch: number) {
    if (epoch < (this.epochs.get(sessionId) ?? 0)) return false;
    this.epochs.set(sessionId, epoch);
    return true;
  }
}
