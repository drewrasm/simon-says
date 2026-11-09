"use client";

import type {
  SearchResponse,
  SearchResult,
} from "@simon-says/contracts/search";
import { Badge } from "@simon-says/ui/components/badge";
import { Button } from "@simon-says/ui/components/button";
import { Input } from "@simon-says/ui/components/input";
import { CheckIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { putBookmark } from "../bookmark-client";
import { formatTalkTime } from "../talk-time";
import { searchResultAnchor, searchSession } from "./search-client";

type SearchState =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "failed" }
  | { kind: "done"; response: SearchResponse };

type SaveIds = { bookmarkId: string; operationId: string };

const INDEXING_NOTE = {
  current: null,
  catching_up: "The last few captions are still being indexed.",
  unavailable: "Search is unavailable right now. Captions keep running.",
} as const;

type ResultCardProps = {
  result: SearchResult;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
};

const ResultCard = ({ result, saved, saving, onSave }: ResultCardProps) => (
  <li className="flex flex-col gap-2 rounded-xl border bg-card p-3">
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="tabular-nums">
        {formatTalkTime(result.range.startMs)}
      </Badge>
      <span className="grow" />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={saved || saving}
        onClick={onSave}
      >
        {saved ? <CheckIcon aria-hidden="true" /> : null}
        {saved ? "Saved" : "Save"}
      </Button>
    </div>
    <blockquote className="text-[15px] leading-relaxed text-muted-foreground">
      “{result.excerpt}”
    </blockquote>
  </li>
);

/** Finds an earlier passage by meaning and saves it as a private clip. */
export const SearchSection = ({ sessionId }: { sessionId: string }) => {
  const router = useRouter();
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const [savingId, setSavingId] = useState<string>();
  // Fixed IDs per passage, so retrying a save is idempotent.
  const saveIds = useRef(new Map<string, SaveIds>());

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (!text || state.kind === "searching") return;

    setState({ kind: "searching" });
    const result = await searchSession(sessionId, text);
    setState(
      result.kind === "ok"
        ? { kind: "done", response: result.response }
        : { kind: "failed" },
    );
  };

  const save = async (result: SearchResult) => {
    const ids = saveIds.current.get(result.passageId) ?? {
      bookmarkId: crypto.randomUUID(),
      operationId: crypto.randomUUID(),
    };
    saveIds.current.set(result.passageId, ids);

    setSavingId(result.passageId);
    const outcome = await putBookmark(ids.bookmarkId, {
      sessionId,
      operationId: ids.operationId,
      expectedRevision: null,
      anchor: searchResultAnchor(result),
    });
    setSavingId(undefined);

    if (outcome.kind !== "saved") {
      toast.error(
        outcome.kind === "rejected"
          ? "That passage is no longer available. Search again."
          : "Couldn't save it. Check your connection and try again.",
      );
      return;
    }
    setSaved((current) => new Set(current).add(result.passageId));
    toast.success("Saved to your clips");
    router.refresh();
  };

  return (
    <section
      aria-labelledby={`${inputId}-heading`}
      className="flex flex-col gap-3"
    >
      <h2 id={`${inputId}-heading`} className="text-sm font-semibold">
        Find something said earlier
      </h2>
      <form onSubmit={(event) => void search(event)} className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          Search the talk
        </label>
        <Input
          id={inputId}
          type="search"
          value={query}
          maxLength={500}
          placeholder="Describe the idea you remember"
          className="h-11"
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button
          type="submit"
          className="h-11"
          disabled={!query.trim() || state.kind === "searching"}
        >
          <SearchIcon aria-hidden="true" />
          Search
        </Button>
      </form>

      <div aria-live="polite" className="flex flex-col gap-3">
        {state.kind === "searching" ? (
          <p className="text-sm text-muted-foreground">Searching…</p>
        ) : null}
        {state.kind === "failed" ? (
          <p className="text-sm text-muted-foreground">
            Search didn&apos;t respond. Captions keep running; try again.
          </p>
        ) : null}
        {state.kind === "done" ? (
          <>
            {INDEXING_NOTE[state.response.indexingState] ? (
              <p className="text-sm text-muted-foreground">
                {INDEXING_NOTE[state.response.indexingState]}
              </p>
            ) : null}
            {state.response.results.length === 0 &&
            state.response.indexingState !== "unavailable" ? (
              <p className="text-sm text-muted-foreground">
                No matching passages yet.
              </p>
            ) : null}
            {state.response.results.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {state.response.results.map((result) => (
                  <ResultCard
                    key={result.passageId}
                    result={result}
                    saved={saved.has(result.passageId)}
                    saving={savingId === result.passageId}
                    onSave={() => void save(result)}
                  />
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
};
