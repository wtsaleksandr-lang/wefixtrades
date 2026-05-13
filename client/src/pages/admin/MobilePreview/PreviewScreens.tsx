/**
 * Web-native mirror of the wefixtrades-softphone screens.
 *
 * Visual parity with the actual RN screens (same layout, copy, palette).
 * NOT the same code — these are plain React + Tailwind, while the real
 * mobile app uses RN's StyleSheet + components. Manual sync needed when
 * either side changes.
 *
 * Lives inside an iPhone / Android phone frame on the admin preview
 * page. Mocked state — no real backend calls.
 */

import { type ReactNode, useState } from "react";

/* ─── Shared primitives (tiny re-implementations of mobile primitives) ─── */

function ScreenContainer({ children }: { children: ReactNode }) {
  return <div className="flex flex-col h-full overflow-y-auto bg-[#F9FAFB]">{children}</div>;
}

function Section({ children }: { children: ReactNode }) {
  return <div className="px-5 py-4 space-y-3">{children}</div>;
}

function Caption({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{children}</p>;
}

function H1({ children }: { children: ReactNode }) {
  return <h1 className="text-[26px] font-bold text-gray-900 tracking-tight leading-tight">{children}</h1>;
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="text-[17px] font-semibold text-gray-900">{children}</h2>;
}

function Body({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <p className={muted ? "text-[15px] leading-[22px] text-gray-500" : "text-[15px] leading-[22px] text-gray-900"}>{children}</p>;
}

function Card({ children, selected = false }: { children: ReactNode; selected?: boolean }) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${selected ? "border-indigo-500 border-2" : "border-gray-200"}`}>{children}</div>
  );
}

function Badge({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "success" }) {
  const styles = tone === "success" ? "bg-emerald-100 text-emerald-800" : "bg-indigo-100 text-indigo-700";
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${styles}`}>{children}</span>;
}

function Button({ onClick, children, variant = "primary" }: { onClick: () => void; children: ReactNode; variant?: "primary" | "outline" | "danger" }) {
  const styles =
    variant === "outline" ? "border border-indigo-600 text-indigo-600 bg-white" :
    variant === "danger" ? "bg-red-600 text-white" :
    "bg-indigo-600 text-white";
  return (
    <button
      onClick={onClick}
      className={`h-12 rounded-[10px] px-4 text-[16px] font-semibold ${styles} active:opacity-80 transition-opacity w-full`}
    >
      {children}
    </button>
  );
}

/* ─── Login screen ─── */

export function LoginScreen({ onSignIn }: { onSignIn: () => void }) {
  const [email, setEmail] = useState("alex@wefixtrades.com");
  const [password, setPassword] = useState("••••••••");
  return (
    <ScreenContainer>
      <Section>
        <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center mb-1">
          <Caption>WFT</Caption>
        </div>
        <H1>Welcome back</H1>
        <Body muted>Sign in with your WeFixTrades credentials.</Body>
      </Section>
      <Section>
        <div className="space-y-1.5">
          <Caption>Email</Caption>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full h-12 px-3 rounded-[10px] border border-gray-200 bg-white text-[16px] text-gray-900 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="space-y-1.5">
          <Caption>Password</Caption>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full h-12 px-3 rounded-[10px] border border-gray-200 bg-white text-[16px] text-gray-900 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <Button onClick={onSignIn}>Sign in</Button>
      </Section>
      <Section>
        <Body muted>Forgot your password? Open the WeFixTrades web dashboard and use the recovery link there — we'll add password reset to the app in a later update.</Body>
      </Section>
    </ScreenContainer>
  );
}

/* ─── Calls (placeholder) ─── */

export function CallsScreen() {
  return (
    <ScreenContainer>
      <Section>
        <Caption>Recent</Caption>
        <H1>Calls</H1>
        <Body muted>Call history will show up here.</Body>
      </Section>
      <Section>
        <Card>
          <Body>📞 Calls integration ships in the next update.</Body>
          <div className="mt-2">
            <Body muted>When Twilio Voice SDK is wired in, this screen will show missed calls, recordings, AI transcripts, and one-tap callback.</Body>
          </div>
        </Card>
      </Section>
    </ScreenContainer>
  );
}

/* ─── Messages (placeholder) ─── */

export function MessagesScreen() {
  return (
    <ScreenContainer>
      <Section>
        <Caption>Threads</Caption>
        <H1>Messages</H1>
        <Body muted>SMS conversations from your customers will appear here.</Body>
      </Section>
      <Section>
        <Card>
          <Body>💬 SMS integration ships in the next update.</Body>
          <div className="mt-2">
            <Body muted>Two-way text conversations with your WeFixTrades number as the sender, AI summaries, and one-tap reply.</Body>
          </div>
        </Card>
      </Section>
    </ScreenContainer>
  );
}

/* ─── Duty screen (real-feeling interaction with mocked state) ─── */

export type DutyMode = "available" | "on_the_job" | "after_hours";

const MODES: Array<{ key: DutyMode; title: string; description: string }> = [
  { key: "available", title: "Available", description: "Calls ring this phone first. AI picks up if you don't answer." },
  { key: "on_the_job", title: "On the job", description: "Calls go straight to AI. You see transcripts after the job." },
  { key: "after_hours", title: "After hours", description: "Same routing as 'on the job', tracked separately for scheduling." },
];

export function DutyScreen({ currentMode, onSelect }: { currentMode: DutyMode; onSelect: (m: DutyMode) => void }) {
  return (
    <ScreenContainer>
      <Section>
        <Caption>Your status</Caption>
        <H1>Duty mode</H1>
        <Body muted>Pick how incoming calls route right now.</Body>
      </Section>
      <Section>
        <div className="space-y-3">
          {MODES.map((m) => {
            const selected = m.key === currentMode;
            return (
              <Card key={m.key} selected={selected}>
                <div className="flex items-center justify-between mb-1">
                  <H2>{m.title}</H2>
                  {selected && <Badge>Current</Badge>}
                </div>
                <Body muted>{m.description}</Body>
                {!selected && (
                  <div className="mt-3">
                    <Button variant="outline" onClick={() => onSelect(m.key)}>
                      Switch to {m.title}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </Section>
    </ScreenContainer>
  );
}

/* ─── Settings ─── */

export function SettingsScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <ScreenContainer>
      <Section>
        <Caption>Account</Caption>
        <H1>Settings</H1>
      </Section>
      <Section>
        <Card>
          <H2>Alex T.</H2>
          <Body muted>alex@wefixtrades.com</Body>
          <div className="mt-2">
            <Caption>Business</Caption>
            <Body>Demo Plumbing & Drains</Body>
          </div>
        </Card>
      </Section>
      <Section>
        <Button variant="outline" onClick={onSignOut}>Sign out</Button>
        <div className="h-2" />
        <Button variant="danger" onClick={onSignOut}>Sign out everywhere</Button>
      </Section>
      <Section>
        <Body muted>Manage billing, change your password, and update your business profile from the WeFixTrades web dashboard.</Body>
      </Section>
    </ScreenContainer>
  );
}

/* ─── Bottom tab bar ─── */

export type TabKey = "calls" | "messages" | "duty" | "settings";

const TABS: Array<{ key: TabKey; label: string; glyph: string }> = [
  { key: "calls", label: "Calls", glyph: "📞" },
  { key: "messages", label: "Messages", glyph: "💬" },
  { key: "duty", label: "Duty", glyph: "⚡" },
  { key: "settings", label: "Settings", glyph: "⚙️" },
];

export function TabBar({ active, onChange }: { active: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-[60px] bg-white border-t border-gray-200 flex items-stretch">
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${isActive ? "text-indigo-600" : "text-gray-500"}`}
          >
            <span className="text-[20px] leading-[22px]">{t.glyph}</span>
            <span className="text-[11px] font-semibold">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
