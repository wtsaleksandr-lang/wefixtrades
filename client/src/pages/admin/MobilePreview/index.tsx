/**
 * Admin mobile preview — Phase 5 from the original softphone spec.
 *
 * Renders the wefixtrades-softphone UI inside iPhone / Android frames
 * with live data from /api/admin/mobile-preview/activity so Alex (and
 * investors) can click through the app without an actual device or
 * simulator AND see the most recent calls + SMS handled by the
 * TradeLine number.
 *
 * Mounted at /admin/mobile-preview. Implementation note: this is a
 * web-native mirror of the mobile screens (plain React + Tailwind),
 * NOT react-native-web. Adding RN-Web to the WeFixTrades Vite bundle
 * is an option for a future iteration — for v1 the mirror is faster
 * to ship and zero risk of breaking the existing web build.
 *
 * Wave W-AW-2 wired the Calls + Messages tabs to real data (was
 * placeholders before). Empty/error states fall back to clearly-marked
 * sample rows so the preview frame stays useful for screenshots.
 *
 * Polish wave (mobile-preview-redesign):
 *   - The preview now lives inside a `.wft-mob-preview[data-theme]` shell
 *     so the on-device sun/moon toggle flips every screen between light
 *     and dark theming. Choice persists in localStorage.
 *   - Tab bar trimmed to 5 entries with a centered Duty FAB. Voicemail
 *     moved to a sub-screen reachable from Calls + Messages.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Monitor, RotateCcw, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PhoneFrame } from "./PhoneFrame";
import {
  LoginScreen,
  CallsScreen,
  AskScreen,
  VoicemailScreen,
  MessagesScreen,
  DutyScreen,
  SettingsScreen,
  TabBar,
  type DutyMode,
  type TabKey,
  type PreviewCall,
  type PreviewMessage,
  type Theme,
} from "./PreviewScreens";

type AuthStatus = "anonymous" | "authenticated";

interface ActivityResponse {
  calls: PreviewCall[];
  messages: PreviewMessage[];
  hasRealData: boolean;
}

const ACTIVITY_REFETCH_MS = 30_000;
const THEME_STORAGE_KEY = "wft_mobile_preview_theme";

function readPersistedTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // localStorage can throw in sandboxed iframes — fall back silently.
  }
  return "light";
}

export default function MobilePreviewPage() {
  const [variant, setVariant] = useState<"iphone" | "android">("iphone");
  const [auth, setAuth] = useState<AuthStatus>("anonymous");
  const [activeTab, setActiveTab] = useState<TabKey>("duty");
  const [dutyMode, setDutyMode] = useState<DutyMode>("available");
  const [theme, setTheme] = useState<Theme>(() => readPersistedTheme());
  // Voicemail is a sub-screen reachable from Calls + Messages. We track its
  // open state separately so the active tab stays visually consistent.
  const [voicemailOpen, setVoicemailOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Safe to ignore — see readPersistedTheme.
    }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  const activity = useQuery<ActivityResponse>({
    queryKey: ["/api/admin/mobile-preview/activity"],
    refetchInterval: ACTIVITY_REFETCH_MS,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });

  function reset() {
    setAuth("anonymous");
    setActiveTab("duty");
    setDutyMode("available");
    setVoicemailOpen(false);
  }

  function renderScreen() {
    if (auth === "anonymous") {
      return <LoginScreen onSignIn={() => setAuth("authenticated")} theme={theme} onToggleTheme={toggleTheme} />;
    }
    if (voicemailOpen) {
      return (
        <div className="relative h-full">
          <div className="absolute inset-0 pb-[88px]">
            <VoicemailScreen theme={theme} onToggleTheme={toggleTheme} onBack={() => setVoicemailOpen(false)} />
          </div>
          <TabBar active={activeTab} onChange={(k) => { setVoicemailOpen(false); setActiveTab(k); }} dutyMode={dutyMode} />
        </div>
      );
    }
    const callsState = {
      isLoading: activity.isLoading,
      isError: activity.isError,
      items: activity.data?.calls ?? [],
    };
    const messagesState = {
      isLoading: activity.isLoading,
      isError: activity.isError,
      items: activity.data?.messages ?? [],
    };
    const tabScreen =
      activeTab === "calls" ? <CallsScreen state={callsState} theme={theme} onToggleTheme={toggleTheme} onOpenVoicemail={() => setVoicemailOpen(true)} /> :
      activeTab === "ask" ? <AskScreen theme={theme} onToggleTheme={toggleTheme} /> :
      activeTab === "messages" ? <MessagesScreen state={messagesState} theme={theme} onToggleTheme={toggleTheme} onOpenVoicemail={() => setVoicemailOpen(true)} /> :
      activeTab === "duty" ? <DutyScreen currentMode={dutyMode} onSelect={setDutyMode} theme={theme} onToggleTheme={toggleTheme} /> :
      <SettingsScreen onSignOut={() => setAuth("anonymous")} theme={theme} onToggleTheme={toggleTheme} />;
    return (
      <div className="relative h-full">
        {/* The tab bar reserves 88px (64px chrome + 24px iOS bottom inset). */}
        <div className="absolute inset-0 pb-[88px]">{tabScreen}</div>
        <TabBar active={activeTab} onChange={setActiveTab} dutyMode={dutyMode} />
      </div>
    );
  }

  const showRefresh = auth === "authenticated" && (activeTab === "calls" || activeTab === "messages");
  const dataUpdatedAt = activity.dataUpdatedAt
    ? new Date(activity.dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;
  const hasRealData = activity.data?.hasRealData ?? false;

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <img src="/brand/icon.svg" alt="WeFixTrades" className="w-6 h-6" />
              Mobile App Preview
            </h1>
            <p className="text-sm text-gray-600 mt-0.5">
              Click through the softphone UI in an iPhone or Android frame. Calls + Messages show live data from your TradeLine number.
            </p>
          </div>
          <a
            href="https://github.com/wtsaleksandr-lang/wefixtrades-softphone"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700"
          >
            <Monitor className="w-3.5 h-3.5" />
            Open mobile repo on GitHub
          </a>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <Card className="p-1 inline-flex gap-1">
            <button
              onClick={() => setVariant("iphone")}
              className={
                variant === "iphone"
                  ? "px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 text-white"
                  : "px-3 py-1.5 text-xs font-semibold rounded-md text-gray-700 hover:bg-gray-100"
              }
            >
              iPhone
            </button>
            <button
              onClick={() => setVariant("android")}
              className={
                variant === "android"
                  ? "px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 text-white"
                  : "px-3 py-1.5 text-xs font-semibold rounded-md text-gray-700 hover:bg-gray-100"
              }
            >
              Android
            </button>
          </Card>
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Reset preview state
          </Button>
          {showRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => activity.refetch()}
              disabled={activity.isFetching}
              data-testid="refresh-activity"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${activity.isFetching ? "animate-spin" : ""}`} />
              {activity.isFetching ? "Refreshing..." : "Refresh activity"}
            </Button>
          )}
          <div className="text-xs text-gray-500 ml-2 flex items-center gap-2">
            <span>
              Status: <span className="font-semibold text-gray-700">{auth === "authenticated" ? `signed in (${voicemailOpen ? "voicemail" : activeTab})` : "logged out"}</span>
              <span className="ml-1.5">· theme: {theme}</span>
            </span>
            {showRefresh && dataUpdatedAt && (
              <span>· Updated {dataUpdatedAt} {hasRealData ? "(live)" : "(no live data)"}</span>
            )}
          </div>
        </div>

        {/* Phone frame + screen.
         *
         * The .wft-mob-preview wrapper carries the live theme. Every preview
         * screen inside uses semantic tokens (wft-mp-*) defined under
         * .wft-mob-preview[data-theme="…"] in client/src/index.css, so light /
         * dark mode flips with this attribute. */}
        <div className="flex flex-col items-center justify-start py-6">
          <div className="wft-mob-preview" data-theme={theme} data-testid="mobile-preview-shell">
            <PhoneFrame variant={variant}>{renderScreen()}</PhoneFrame>
          </div>
        </div>

        {/* Notes */}
        <Card className="p-4 max-w-2xl mx-auto">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">What this preview covers</h3>
          <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
            <li>Login → tab navigator transition (click "Sign in")</li>
            <li>Five-tab bottom bar (Calls, Ask, Duty FAB, Messages, Settings) with the Duty control raised as a centered FAB</li>
            <li>Voicemail reachable as a sub-screen from Calls or Messages (low volume for AI-handled calls)</li>
            <li>Duty mode toggle with all three states (available / on_the_job / after_hours) — per-mode green / blue / dark-grey color treatment on the cards</li>
            <li>Day / night theme toggle in every screen header (sun + moon icon top-right) — persists in localStorage</li>
            <li>Calls + Messages tabs show the 5 most recent rows from <code>mobile_call_records</code> and <code>sms_messages</code> (auto-refresh every 30s, manual refresh button)</li>
            <li>Calls tab includes per-row "Call back" buttons and a "+ New call" dialer launcher with number pad</li>
            <li>Messages tab includes a bottom compose bar (input + Send)</li>
            <li>Ask tab shows assistant header, suggestion chips, sample thread, and a composer with mic/camera glyphs</li>
            <li>Voicemail sub-screen lists callers with duration + transcript preview + play button</li>
            <li>Settings → sign-out flow (returns to login)</li>
            <li>iPhone Dynamic Island + home indicator, Android punch-hole + nav bar</li>
          </ul>
          <h3 className="text-sm font-semibold text-gray-900 mt-3 mb-2">What's mocked</h3>
          <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
            <li>No real auth — clicking "Sign in" jumps straight to the tabs</li>
            <li>Duty toggle is local state — doesn't hit <code>/api/mobile/duty</code></li>
            <li>Ask thread, suggestion chips, and the mic/camera glyphs are static — no AI calls, no recording, no upload</li>
            <li>Voicemail rows are static — no audio playback</li>
            <li>Dialer keypad + "Call back" + SMS Send buttons are stubbed — no Twilio calls or SMS go out</li>
            <li>Profile data is hardcoded (Demo User / Demo Plumbing &amp; Drains)</li>
            <li>If the DB has no calls/SMS yet, Calls + Messages fall back to clearly-marked sample rows</li>
          </ul>
        </Card>
      </div>
    </AdminLayout>
  );
}
