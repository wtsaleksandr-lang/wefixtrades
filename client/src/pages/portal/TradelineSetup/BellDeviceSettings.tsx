/**
 * Bell / Virgin Plus device-settings fallback for Option B.
 *
 * Bell Mobility (and Virgin Plus, its MVNO) doesn't officially support
 * GSM MMI conditional-forwarding codes — the wizard can't tel:-dial a
 * one-tap activation. Instead we walk the user through iOS Phone Settings
 * or Android dialer Settings.
 *
 * Real screenshots ship in a follow-up — for v1 we render labelled
 * placeholders + step-by-step text. Trades who can't follow the text-only
 * version can use the "I'll use unconditional forwarding instead" escape
 * hatch (sends customer calls straight to AI; user loses ability to pick
 * up first).
 */

import { useState } from "react";
import { Smartphone } from "lucide-react";

interface Props {
  weFixTradesNumber: string;
  onContinueToVerify: () => void;
  onUseUnconditional: () => void;
}

export function BellDeviceSettings({ weFixTradesNumber, onContinueToVerify, onUseUnconditional }: Props) {
  const [tab, setTab] = useState<"ios" | "android">("ios");
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold mb-1">Bell needs device settings, not a code</p>
        <p className="text-xs">
          Bell Mobility doesn't support the standard activation codes other carriers use, so we'll
          set forwarding up in your phone's call-forwarding settings instead. It's a one-time setup.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("ios")}
          className={
            tab === "ios"
              ? "flex-1 rounded-lg border-2 border-indigo-500 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900"
              : "flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
          }
        >
          📱 iPhone
        </button>
        <button
          type="button"
          onClick={() => setTab("android")}
          className={
            tab === "android"
              ? "flex-1 rounded-lg border-2 border-indigo-500 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900"
              : "flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
          }
        >
          🤖 Android
        </button>
      </div>

      {tab === "ios" ? <IosSteps weFixTradesNumber={weFixTradesNumber} /> : <AndroidSteps weFixTradesNumber={weFixTradesNumber} />}

      <div className="space-y-2 pt-2">
        <button
          type="button"
          onClick={onContinueToVerify}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          I've set it up — verify forwarding
        </button>
        <button
          type="button"
          onClick={onUseUnconditional}
          className="w-full text-xs text-gray-500 hover:text-gray-700"
        >
          Use unconditional forwarding instead (all calls go to AI)
        </button>
      </div>
    </div>
  );
}

function IosSteps({ weFixTradesNumber }: { weFixTradesNumber: string }) {
  return (
    <ol className="space-y-3 text-sm">
      <Step n={1} title="Open Settings → Phone">
        On your iPhone home screen, tap the gray Settings app, scroll to Phone.
      </Step>
      <Step n={2} title="Tap Call Forwarding">
        Inside Phone, you'll see a Call Forwarding row.
      </Step>
      <Step n={3} title="Toggle Call Forwarding on">
        Flip the switch. You'll be asked for a number to forward to.
      </Step>
      <Step n={4} title={`Enter ${weFixTradesNumber}`}>
        Type your WeFixTrades number exactly as shown. Tap back to save.
      </Step>
      <ScreenshotPlaceholder caption="iOS Settings → Phone → Call Forwarding" />
    </ol>
  );
}

function AndroidSteps({ weFixTradesNumber }: { weFixTradesNumber: string }) {
  return (
    <ol className="space-y-3 text-sm">
      <Step n={1} title="Open the Phone app">
        The default dialer (green phone icon).
      </Step>
      <Step n={2} title="Tap ⋮ (top right) → Settings → Calls">
        Menu may say "Calls" or "Call forwarding" directly depending on your phone.
      </Step>
      <Step n={3} title="Tap Call forwarding → Voice calls">
        Some phones group these under "More" — look for "Always forward" and the conditional options.
      </Step>
      <Step n={4} title='Pick "When unanswered"'>
        You may also see "When busy" and "When unreachable" — set all three to the same number.
      </Step>
      <Step n={5} title={`Enter ${weFixTradesNumber}`}>
        Tap Enable / Turn on.
      </Step>
      <ScreenshotPlaceholder caption="Android Phone app → Settings → Call forwarding" />
    </ol>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
        {n}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900">{title}</p>
        <p className="text-xs text-gray-600 mt-0.5">{children}</p>
      </div>
    </li>
  );
}

function ScreenshotPlaceholder({ caption }: { caption: string }) {
  return (
    <li className="flex gap-3">
      <div className="w-6 h-6 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 aspect-[9/16] max-h-64 flex flex-col items-center justify-center text-gray-400">
          <Smartphone className="w-8 h-8 mb-2" />
          <p className="text-xs font-medium">Screenshot placeholder</p>
          <p className="text-[10px] mt-0.5 px-2 text-center">{caption}</p>
        </div>
      </div>
    </li>
  );
}
