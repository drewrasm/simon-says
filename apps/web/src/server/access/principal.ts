import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import {
  principalCookieName,
  readSessionSecret,
  signPrincipal,
  verifyPrincipal,
} from "./credentials";
import { getDatabase } from "./database";

export const readPrincipal = async () => {
  const secret = readSessionSecret();
  const cookieStore = await cookies();
  const id = verifyPrincipal({
    value: cookieStore.get(principalCookieName)?.value,
    secret,
  });
  return id ? { id } : null;
};

export type EnsurePrincipalOptions = { secureCookie: boolean };

export const ensurePrincipal = async ({
  secureCookie,
}: EnsurePrincipalOptions) => {
  const secret = readSessionSecret();
  const principal = await readPrincipal();
  const id = principal?.id ?? randomUUID();

  await getDatabase().principal.upsert({
    where: { id },
    create: { id },
    update: {},
  });

  if (!principal) {
    const cookieStore = await cookies();
    cookieStore.set(
      principalCookieName,
      signPrincipal({ principalId: id, secret }),
      {
        httpOnly: true,
        secure: secureCookie,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      },
    );
  }

  return { id };
};
