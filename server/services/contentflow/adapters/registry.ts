/**
 * ContentFlow — adapter registry (Sprint 8).
 *
 * Registers each PublishAdapter under its `type`. The publish queue
 * worker calls `getAdapter(type).publish(draft, opts)` — it never
 * imports a specific adapter directly.
 *
 * Sprint 8 scope: WordPress only. Future sprints add facebook,
 * instagram, gbp, generic_export by importing here.
 */

import type { PublishAdapter, AdapterType } from "./types";
import { wordpressAdapter } from "./wordpressAdapter";
import { gbpAdapter } from "./gbpAdapter";

const REGISTRY: Partial<Record<AdapterType, PublishAdapter>> = {
  wordpress: wordpressAdapter,
  gbp: gbpAdapter,
};

export function getAdapter(type: AdapterType): PublishAdapter {
  const a = REGISTRY[type];
  if (!a) {
    throw new Error(`No publish adapter registered for type='${type}'`);
  }
  return a;
}

/** For tests / observability. */
export function listRegisteredAdapterTypes(): AdapterType[] {
  return Object.keys(REGISTRY) as AdapterType[];
}
