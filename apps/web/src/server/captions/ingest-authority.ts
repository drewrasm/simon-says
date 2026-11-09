import "server-only";
import type { IncomingMessage } from "node:http";

export interface IngestAuthority {
  authorizeHost(sessionId: string, request: IncomingMessage): boolean;
  authorizeMember(sessionId: string, request: IncomingMessage): boolean;
  checkEpoch(sessionId: string, epoch: number): boolean;
}

/** Track 3 replaces this with Postgres membership, leases, and epoch fencing.
 * Explicit development opt-in only; production always fails closed. */
export class DevIngestAuthority implements IngestAuthority {
  private epoch = 0;
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
  checkEpoch(_sessionId: string, epoch: number) {
    if (epoch < this.epoch) return false;
    this.epoch = epoch;
    return true;
  }
}
