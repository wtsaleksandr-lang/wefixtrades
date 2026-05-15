/**
 * CopilotFormContext — universal form registry for the AI copilots
 * (Phase 1a).
 *
 * Any page/component with an editable form calls `useCopilotForm({...})` to
 * register its fields, live values, and an apply handler. Both copilots
 * (portal + admin) read the currently-registered form via
 * `useActiveCopilotForm()` — so form-fill works on every page that opts in,
 * with one hook call, instead of per-page prop threading.
 *
 * Registration is automatic on mount and cleared on unmount. If several
 * forms register at once (e.g. a page form + an open dialog), the most
 * recently registered one is the active target.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface CopilotFormField {
  /** Stable key used by the apply handler + sent to the AI. */
  key: string;
  /** Human label shown to the AI (and used in the apply card). */
  label: string;
  required?: boolean;
}

/** A single proposed fill: which field, what value. */
export interface CopilotFormFill {
  field_key: string;
  value: string;
}

/** A live form registration the copilots read from. */
export interface CopilotFormRegistration {
  /** Optional human label, e.g. "Client details". */
  formLabel?: string;
  fields: CopilotFormField[];
  /** Lazily read current values so the copilot always sees fresh state. */
  getValues: () => Record<string, unknown>;
  /** Apply the AI's proposed fills to the page's own form state. */
  onApply: (fills: CopilotFormFill[]) => void | Promise<void>;
}

interface CopilotFormContextValue {
  register: (id: string, reg: CopilotFormRegistration) => void;
  unregister: (id: string) => void;
  /** The most-recently-registered active form, or null if none. */
  active: CopilotFormRegistration | null;
}

const CopilotFormContext = createContext<CopilotFormContextValue>({
  register: () => {},
  unregister: () => {},
  active: null,
});

export function CopilotFormProvider({ children }: { children: ReactNode }) {
  // Stack of registrations; the last entry is the active form.
  const [stack, setStack] = useState<{ id: string; reg: CopilotFormRegistration }[]>([]);

  const register = useCallback((id: string, reg: CopilotFormRegistration) => {
    setStack((prev) => [...prev.filter((e) => e.id !== id), { id, reg }]);
  }, []);
  const unregister = useCallback((id: string) => {
    setStack((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const active = stack.length > 0 ? stack[stack.length - 1].reg : null;
  const value = useMemo<CopilotFormContextValue>(
    () => ({ register, unregister, active }),
    [register, unregister, active],
  );

  return <CopilotFormContext.Provider value={value}>{children}</CopilotFormContext.Provider>;
}

/**
 * Register the current component's form with the copilots. Call this once
 * from any page/dialog that has an editable form you want the AI to fill.
 *
 * `values` may change every render — that's fine; the registration reads
 * them lazily, so re-registration only happens when the field set changes.
 */
export function useCopilotForm(reg: {
  fields: CopilotFormField[];
  /** Live form state, keyed by field key. */
  values: Record<string, unknown>;
  onApply: (fills: CopilotFormFill[]) => void | Promise<void>;
  formLabel?: string;
  /** Defaults to true. Set false to temporarily withhold the form. */
  enabled?: boolean;
}) {
  const { register, unregister } = useContext(CopilotFormContext);
  const id = useId();

  // Hold the latest props in a ref so the registration always reads fresh
  // values / calls the latest onApply without re-registering each render.
  const latest = useRef(reg);
  latest.current = reg;

  const enabled = reg.enabled !== false;
  // Re-register only when the field set or enabled flag changes.
  const fieldsSig = JSON.stringify(reg.fields);

  useEffect(() => {
    if (!enabled) {
      unregister(id);
      return;
    }
    register(id, {
      formLabel: latest.current.formLabel,
      fields: latest.current.fields,
      getValues: () => latest.current.values,
      onApply: (fills) => latest.current.onApply(fills),
    });
    return () => unregister(id);
  }, [id, register, unregister, enabled, fieldsSig]);
}

/** Read the currently-active registered form. Used by the copilots. */
export function useActiveCopilotForm(): CopilotFormRegistration | null {
  return useContext(CopilotFormContext).active;
}
