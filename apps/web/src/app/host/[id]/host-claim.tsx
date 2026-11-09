"use client";

import { buttonVariants } from "@simon-says/ui/components/button";
import { Spinner } from "@simon-says/ui/components/spinner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "../../../components/brand-mark";
import { clearHostFragment, readHostToken } from "./host-fragment";

type ClaimState = "claiming" | "denied" | "error";

const MESSAGE: Record<Exclude<ClaimState, "claiming">, string> = {
  denied:
    "You're not the host of this session on this device. Open the full host link, including everything after the #.",
  error: "Couldn't confirm the host link. Check your connection and reload.",
};

type HostClaimProps = { sessionId: string };

/** Exchanges the host link's `#token` for host membership on this device. */
export const HostClaim = ({ sessionId }: HostClaimProps) => {
  const router = useRouter();
  const [state, setState] = useState<ClaimState>("claiming");
  // Read once: the fragment is cleared on first read, and Strict Mode re-runs effects.
  const tokenRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (tokenRef.current === undefined) {
      tokenRef.current = readHostToken(window.location.hash);
      clearHostFragment();
    }
    const token = tokenRef.current;
    if (!token) {
      setState("denied");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/host`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (response.ok) {
          router.refresh();
          return;
        }
        setState(response.status === 404 ? "denied" : "error");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, sessionId]);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-6 py-10">
      <header>
        <BrandMark />
      </header>
      {state === "claiming" ? (
        <p role="status" className="flex items-center gap-2">
          <Spinner /> Opening your session…
        </p>
      ) : (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">
            Can&apos;t open this session
          </h1>
          <p role="alert" className="text-muted-foreground">
            {MESSAGE[state]}
          </p>
          <div>
            <Link
              href="/host/new"
              className={buttonVariants({ variant: "outline" })}
            >
              Start a new session
            </Link>
          </div>
        </>
      )}
    </main>
  );
};
