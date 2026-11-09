import "server-only";
import type { IncomingMessage } from "node:http";

export interface IngestAuthority {
  authorizeHost(
    sessionId: string,
    request: IncomingMessage,
  ): boolean | Promise<boolean>;
  authorizeMember(
    sessionId: string,
    request: IncomingMessage,
  ): boolean | Promise<boolean>;
  checkEpoch(sessionId: string, epoch: number): boolean;
}

/** Explicit development opt-in only; production always fails closed. */
export class DevIngestAuthority implements IngestAuthority {
  private readonly epochs = new Map<string, number>();
  constructor(
    private readonly sessionId: string | undefined,
    private readonly production = false,
  ) {}
  authorizeHost(sessionId: string, _request: IncomingMessage) {
    void _request;
    return !this.production && !!this.sessionId && sessionId === this.sessionId;
  }
  authorizeMember(sessionId: string, request: IncomingMessage) {
    return this.authorizeHost(sessionId, request);
  }
  checkEpoch(sessionId: string, epoch: number) {
    if (epoch < (this.epochs.get(sessionId) ?? 0)) return false;
    this.epochs.set(sessionId, epoch);
    return true;
  }
}
