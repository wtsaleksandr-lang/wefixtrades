/**
 * useVapiCall — React hook that manages a Vapi Web voice session.
 *
 * Fetches the public key and assistant ID from /api/vapi/web-config,
 * then exposes start/stop controls and real-time call state.
 *
 * All AI intelligence stays server-side via the shared assistant core.
 * This hook only manages the browser ↔ Vapi audio transport.
 */

import { useState, useRef, useCallback, useEffect } from "react";

export type VapiCallStatus =
  | "idle"          // Not started
  | "loading"       // Fetching config
  | "connecting"    // SDK connecting to Vapi
  | "active"        // Call in progress (listening/speaking)
  | "ended"         // Call finished normally
  | "error";        // Something went wrong

/** One finalized line of the voice conversation. */
export interface TranscriptLine {
  role: "user" | "assistant";
  text: string;
}

export interface VapiCallState {
  status: VapiCallStatus;
  /** True when the user is speaking (speech-start → speech-end) */
  isSpeaking: boolean;
  /** True when the assistant is responding */
  isAssistantSpeaking: boolean;
  /** 0-1 volume level from Vapi (updated frequently during call) */
  volumeLevel: number;
  /** Human-readable error message if status is "error" */
  errorMessage: string | null;
  /** Vapi call ID once assigned */
  callId: string | null;
  /** Running transcript of the conversation (finalized lines only) */
  transcript: TranscriptLine[];
  /** Service IDs the assistant pushed via the recommend_services tool */
  recommendedServiceIds: string[];
}

export interface UseVapiCallReturn extends VapiCallState {
  /** Start a voice demo session */
  start: () => Promise<void>;
  /** End the current session */
  stop: () => Promise<void>;
  /** Whether the web demo is available (config exists) */
  isAvailable: boolean;
}

export interface UseVapiCallOptions {
  /**
   * Optional assistantOverrides passed to vapi.start(). Useful for pushing
   * a per-page system prompt (e.g. the TradeLine demo persona) without
   * editing the assistant in the Vapi dashboard. Can be a value or a
   * thunk — the thunk is awaited at call-start time so prompts can be
   * fetched lazily.
   *
   * Vapi shape: { model: { messages: [{ role: "system", content: "..." }] } }
   * Other model fields (provider, model name, temperature, etc.) inherit
   * from the dashboard assistant config.
   */
  assistantOverrides?: unknown | (() => Promise<unknown> | unknown);
}

export function useVapiCall(options?: UseVapiCallOptions): UseVapiCallReturn {
  const [state, setState] = useState<VapiCallState>({
    status: "idle",
    isSpeaking: false,
    isAssistantSpeaking: false,
    volumeLevel: 0,
    errorMessage: null,
    callId: null,
    transcript: [],
    recommendedServiceIds: [],
  });

  const vapiRef = useRef<any>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const configRef = useRef<{ publicKey: string; assistantId: string } | null>(null);
  // Keep the latest assistantOverrides without invalidating the start callback
  const overridesRef = useRef(options?.assistantOverrides);
  overridesRef.current = options?.assistantOverrides;

  // Fetch config once on mount to check availability
  useEffect(() => {
    fetch("/api/vapi/web-config")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.publicKey && data?.assistantId) {
          configRef.current = { publicKey: data.publicKey, assistantId: data.assistantId };
          setIsAvailable(true);
        }
      })
      .catch(() => {});
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vapiRef.current) {
        try { vapiRef.current.stop(); } catch {}
        vapiRef.current = null;
      }
    };
  }, []);

  const start = useCallback(async () => {
    // Prevent double-start
    if (state.status === "connecting" || state.status === "active") return;

    setState((s) => ({ ...s, status: "loading", errorMessage: null, callId: null, transcript: [], recommendedServiceIds: [] }));

    try {
      // Fetch config if not cached
      if (!configRef.current) {
        const res = await fetch("/api/vapi/web-config");
        if (!res.ok) {
          setState((s) => ({
            ...s,
            status: "error",
            errorMessage: "Voice demo is not available right now.",
          }));
          return;
        }
        const data = await res.json();
        if (!data?.publicKey || !data?.assistantId) {
          setState((s) => ({
            ...s,
            status: "error",
            errorMessage: "Voice demo configuration is incomplete.",
          }));
          return;
        }
        configRef.current = { publicKey: data.publicKey, assistantId: data.assistantId };
      }

      setState((s) => ({ ...s, status: "connecting" }));

      // Dynamically import the SDK to avoid SSR issues and keep bundle smaller
      const { default: Vapi } = await import("@vapi-ai/web");

      // Create a fresh instance each call (Vapi SDK is designed for this)
      const vapi = new Vapi(configRef.current.publicKey);
      vapiRef.current = vapi;

      // ─── Event listeners ───

      vapi.on("call-start", () => {
        setState((s) => ({
          ...s,
          status: "active",
          isSpeaking: false,
          isAssistantSpeaking: false,
        }));
      });

      vapi.on("call-end", () => {
        setState((s) => ({
          ...s,
          status: "ended",
          isSpeaking: false,
          isAssistantSpeaking: false,
          volumeLevel: 0,
        }));
        vapiRef.current = null;
      });

      vapi.on("speech-start", () => {
        setState((s) => ({ ...s, isSpeaking: true }));
      });

      vapi.on("speech-end", () => {
        setState((s) => ({ ...s, isSpeaking: false }));
      });

      vapi.on("volume-level", (volume: number) => {
        setState((s) => ({ ...s, volumeLevel: volume }));
      });

      vapi.on("message", (msg: any) => {
        // Track when the assistant starts/stops speaking
        if (msg.type === "speech-update") {
          setState((s) => ({
            ...s,
            isAssistantSpeaking: msg.status === "started",
          }));
        } else if (
          msg.type === "transcript" &&
          msg.transcriptType === "final" &&
          typeof msg.transcript === "string" &&
          msg.transcript.trim()
        ) {
          // Accumulate the conversation so it can be read on screen.
          const role: "user" | "assistant" = msg.role === "assistant" ? "assistant" : "user";
          setState((s) => ({
            ...s,
            transcript: [...s.transcript, { role, text: msg.transcript.trim() }],
          }));
        } else if (msg.type === "tool-calls" || msg.type === "function-call") {
          // The recommend_services tool fires alongside the spoken reply —
          // pull the service IDs out so the UI can show product cards.
          const calls: any[] =
            msg.toolCalls || msg.toolCallList ||
            (msg.functionCall ? [{ function: msg.functionCall }] : []);
          const ids: string[] = [];
          for (const call of calls) {
            const fn = call?.function || call;
            if (fn?.name !== "recommend_services") continue;
            let args = fn.arguments ?? fn.parameters;
            if (typeof args === "string") {
              try { args = JSON.parse(args); } catch { args = {}; }
            }
            if (Array.isArray(args?.serviceIds)) {
              ids.push(...args.serviceIds.filter((x: unknown): x is string => typeof x === "string"));
            }
          }
          if (ids.length) {
            setState((s) => ({
              ...s,
              recommendedServiceIds: Array.from(new Set([...s.recommendedServiceIds, ...ids])),
            }));
          }
        }
      });

      vapi.on("error", (err: any) => {
        const message = typeof err === "string"
          ? err
          : err?.message || err?.errorMessage || "Something went wrong with the voice connection.";
        console.error("[vapi] Error:", err);
        setState((s) => ({
          ...s,
          status: "error",
          errorMessage: message,
          isSpeaking: false,
          isAssistantSpeaking: false,
          volumeLevel: 0,
        }));
        vapiRef.current = null;
      });

      vapi.on("call-start-failed" as any, (event: any) => {
        console.error("[vapi] Call start failed:", event);
        setState((s) => ({
          ...s,
          status: "error",
          errorMessage: event?.error || "Could not start the voice call. Please check your microphone permissions.",
        }));
        vapiRef.current = null;
      });

      // ─── Start the call ───
      // Resolve assistantOverrides if provided. Thunk form is awaited so
      // callers can fetch a prompt over the network at call-start time.
      let resolvedOverrides: unknown | undefined;
      try {
        const raw = overridesRef.current;
        resolvedOverrides = typeof raw === "function" ? await (raw as () => Promise<unknown>)() : raw;
      } catch (err) {
        console.warn("[vapi] assistantOverrides resolver failed; falling back to dashboard config", err);
        resolvedOverrides = undefined;
      }
      const call = resolvedOverrides
        ? await vapi.start(configRef.current.assistantId, resolvedOverrides)
        : await vapi.start(configRef.current.assistantId);
      if (call?.id) {
        setState((s) => ({ ...s, callId: call.id }));
      }
    } catch (err: any) {
      console.error("[vapi] Start error:", err);
      const message = err?.message || "Failed to start voice demo.";
      // Detect microphone permission issues
      const isMicError =
        message.includes("Permission") ||
        message.includes("NotAllowed") ||
        message.includes("getUserMedia");
      setState((s) => ({
        ...s,
        status: "error",
        errorMessage: isMicError
          ? "Microphone access is required for the voice demo. Please allow microphone access and try again."
          : message,
      }));
      vapiRef.current = null;
    }
  }, [state.status]);

  const stop = useCallback(async () => {
    try {
      if (vapiRef.current) {
        await vapiRef.current.stop();
      }
    } catch {
      // Ignore stop errors
    }
    vapiRef.current = null;
    setState((s) => ({
      ...s,
      status: "ended",
      isSpeaking: false,
      isAssistantSpeaking: false,
      volumeLevel: 0,
    }));
  }, []);

  return {
    ...state,
    start,
    stop,
    isAvailable,
  };
}
