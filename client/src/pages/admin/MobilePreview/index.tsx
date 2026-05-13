/**
 * Admin mobile preview — Phase 5 from the original softphone spec.
 *
 * Renders the wefixtrades-softphone UI inside iPhone / Android frames
 * with mocked state so Alex (and investors) can click through the app
 * without an actual device or simulator.
 *
 * Mounted at /admin/mobile-preview. Implementation note: this is a
 * web-native mirror of the mobile screens (plain React + Tailwind),
 * NOT react-native-web. Adding RN-Web to the WeFixTrades Vite bundle
 * is an option for a future iteration — for v1 the mirror is faster
 * to ship and zero risk of breaking the existing web build.
 */

import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Smartphone, Monitor, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PhoneFrame } from "./PhoneFrame";
import {
  LoginScreen,
  CallsScreen,
  MessagesScreen,
  DutyScreen,
  SettingsScreen,
  TabBar,
  type DutyMode,
  type TabKey,
} from "./PreviewScreens";

type AuthStatus = "anonymous" | "authenticated";

export default function MobilePreviewPage() {
  const [variant, setVariant] = useState<"iphone" | "android">("iphone");
  const [auth, setAuth] = useState<AuthStatus>("anonymous");
  const [activeTab, setActiveTab] = useState<TabKey>("duty");
  const [dutyMode, setDutyMode] = useState<DutyMode>("available");

  function reset() {
    setAuth("anonymous");
    setActiveTab("duty");
    setDutyMode("available");
  }

  function renderScreen() {
    if (auth === "anonymous") {
      return <LoginScreen onSignIn={() => setAuth("authenticated")} />;
    }
    const tabScreen =
      activeTab === "calls" ? <CallsScreen /> :
      activeTab === "messages" ? <MessagesScreen /> :
      activeTab === "duty" ? <DutyScreen currentMode={dutyMode} onSelect={setDutyMode} /> :
      <SettingsScreen onSignOut={() => setAuth("anonymous")} />;
    return (
      <div className="relative h-full">
        <div className="absolute inset-0 pb-[60px]">{tabScreen}</div>
        <TabBar active={activeTab} onChange={setActiveTab} />
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Smartphone className="w-6 h-6 text-indigo-600" />
              Mobile App Preview
            </h1>
            <p className="text-sm text-gray-600 mt-0.5">
              Click through the softphone UI in an iPhone or Android frame. Mocked state — no real backend calls.
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
              📱 iPhone
            </button>
            <button
              onClick={() => setVariant("android")}
              className={
                variant === "android"
                  ? "px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 text-white"
                  : "px-3 py-1.5 text-xs font-semibold rounded-md text-gray-700 hover:bg-gray-100"
              }
            >
              🤖 Android
            </button>
          </Card>
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Reset preview state
          </Button>
          <div className="text-xs text-gray-500 ml-2">
            Status: <span className="font-semibold text-gray-700">{auth === "authenticated" ? `signed in (${activeTab})` : "logged out"}</span>
          </div>
        </div>

        {/* Phone frame + screen */}
        <div className="flex flex-col items-center justify-start py-6">
          <PhoneFrame variant={variant}>{renderScreen()}</PhoneFrame>
        </div>

        {/* Notes */}
        <Card className="p-4 max-w-2xl mx-auto">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">What this preview covers</h3>
          <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
            <li>Login → tab navigator transition (click "Sign in")</li>
            <li>Duty mode toggle with all three states (available / on_the_job / after_hours)</li>
            <li>Calls + Messages placeholder cards (real history lands in Phase 4)</li>
            <li>Settings → sign-out flow (returns to login)</li>
            <li>iPhone Dynamic Island + home indicator, Android punch-hole + nav bar</li>
          </ul>
          <h3 className="text-sm font-semibold text-gray-900 mt-3 mb-2">What's mocked</h3>
          <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
            <li>No real auth — clicking "Sign in" jumps straight to the tabs</li>
            <li>Duty toggle is local state — doesn't hit <code>/api/mobile/duty</code></li>
            <li>Profile data is hardcoded (Alex / Demo Plumbing &amp; Drains)</li>
          </ul>
        </Card>
      </div>
    </AdminLayout>
  );
}
