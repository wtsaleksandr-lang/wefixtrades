/**
 * useFirstVisit — light progressive-disclosure hook.
 *
 * Returns `true` the first time a given key is queried for the current
 * browser/profile. Subsequent calls (after `markVisited(key)` runs) return
 * `false`. Used to gate first-visit UI hints across the portal without the
 * heavier commitment of a Joyride/Driver.js tour.
 *
 * Storage: a single localStorage entry under `portal-visited-routes` holding
 * a JSON array of keys. Quota / JSON errors are swallowed silently — the
 * worst case is a customer seeing the same hint twice.
 *
 * Why not mark visited automatically on mount? Because the tooltip itself
 * decides when "visited" happens (typically on dismiss). That way an idle
 * tab that mounts the page but never shows the hint to the user doesn't
 * burn the first-visit token.
 */

import { useState, useEffect } from "react";

const STORAGE_KEY = "portal-visited-routes";

function loadVisited(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v) => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function saveVisited(set: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* quota error — best effort */
  }
}

/**
 * Returns `true` the first time a given key is queried for the current
 * browser/profile. After `markVisited(key)` is called, subsequent calls
 * return `false`.
 *
 * SSR-safe: defaults to `false` on initial render (no localStorage access
 * during server render), then flips to `true` on mount if the key hasn't
 * been visited yet.
 */
export function useFirstVisit(key: string): boolean {
  const [isFirst, setIsFirst] = useState(false);

  useEffect(() => {
    const visited = loadVisited();
    if (!visited.has(key)) {
      setIsFirst(true);
      // Don't mark visited yet — let the tooltip dismiss action do that.
    }
  }, [key]);

  return isFirst;
}

/** Mark a key visited so the first-visit hint stops showing. */
export function markVisited(key: string): void {
  const visited = loadVisited();
  if (!visited.has(key)) {
    visited.add(key);
    saveVisited(visited);
  }
}

/** Clear all first-visit state. For testing or a "Reset onboarding" button. */
export function resetFirstVisits(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
