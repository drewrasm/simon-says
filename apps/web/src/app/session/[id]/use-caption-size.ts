"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Caption text size steps; the phone and desktop scales differ per step. */
export const CAPTION_SIZES = ["Small", "Medium", "Large"] as const;
export type CaptionSizeStep = 0 | 1 | 2;

const STORAGE_KEY = "simon-says:caption-size";
const DEFAULT_STEP: CaptionSizeStep = 1;
const listeners = new Set<() => void>();

const isStep = (value: number): value is CaptionSizeStep =>
  value === 0 || value === 1 || value === 2;

const read = (): CaptionSizeStep => {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY));
    return window.localStorage.getItem(STORAGE_KEY) !== null && isStep(value)
      ? value
      : DEFAULT_STEP;
  } catch {
    return DEFAULT_STEP;
  }
};

let memory: CaptionSizeStep | null = null;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      memory = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
};

/** Per-device caption size, persisted when storage is available. */
export const useCaptionSize = () => {
  const step = useSyncExternalStore(
    subscribe,
    () => memory ?? (memory = read()),
    () => DEFAULT_STEP,
  );

  const setStep = useCallback((next: number) => {
    const clamped = Math.min(2, Math.max(0, next));
    if (!isStep(clamped)) return;
    memory = clamped;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      // Private mode or blocked storage: keep the size for this page only.
    }
    for (const listener of listeners) listener();
  }, []);

  return { step, setStep };
};
