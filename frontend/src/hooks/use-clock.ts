"use client";
import { useSyncExternalStore } from "react";
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
const subscribe = (notify: () => void) => {
  listeners.add(notify);
  if (!timer) timer = setInterval(() => listeners.forEach((listener) => listener()), 1000);
  return () => { listeners.delete(notify); if (!listeners.size) { clearInterval(timer); timer = undefined; } };
};
const snapshot = () => Math.floor(Date.now() / 1000);
export function useClock() { return useSyncExternalStore(subscribe, snapshot, () => 0); }
