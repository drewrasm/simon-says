import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";

export const principalCookieName = "simon_says_principal";

export const readSessionSecret = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return secret;
};

type SignPrincipalOptions = { principalId: string; secret: string };

export const signPrincipal = ({
  principalId,
  secret,
}: SignPrincipalOptions) => {
  const signature = createHmac("sha256", secret)
    .update(principalId)
    .digest("base64url");
  return `${principalId}.${signature}`;
};

type VerifyPrincipalOptions = { value: string | undefined; secret: string };

export const verifyPrincipal = ({ value, secret }: VerifyPrincipalOptions) => {
  if (!value) return null;

  const [principalId, signature, extra] = value.split(".");
  if (
    !z.uuid().safeParse(principalId).success ||
    !principalId ||
    !signature ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature) ||
    extra !== undefined
  ) {
    return null;
  }

  const expected = signPrincipal({ principalId, secret });
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected))
    ? principalId
    : null;
};

export const createToken = () => randomBytes(32).toString("base64url");

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

type VerifyHostTokenOptions = { token: string; tokenHash: string };

export const verifyHostToken = ({
  token,
  tokenHash,
}: VerifyHostTokenOptions) => {
  const candidate = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(tokenHash, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
};

export const requiresSecureCookie = (requestUrl: string) => {
  const url = new URL(requestUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return url.protocol !== "http:" || !local;
};
