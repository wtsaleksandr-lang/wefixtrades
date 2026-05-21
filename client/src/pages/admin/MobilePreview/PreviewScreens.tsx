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
  const [email, setEmail] = useState("you@wefixtrades.com");
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

/* ─── Calls + Messages — real data via /api/admin/mobile-preview/activity ───
 *
 * Wave W-AW-2: replaced the Phase-4 placeholder cards with a working list
 * of recent Twilio call records (mobile_call_records) and SMS messages
 * (sms_messages). When the DB has activity we show it; otherwise we fall
 * back to a clearly-marked sample row so the preview frame stays useful
 * for screenshots / investor walk-throughs.
 */

export interface PreviewCall {
  id: number;
  callSid: string;
  direction: string;
  fromNumber: string | null;
  toNumber: string | null;
  status: string;
  durationSec: number | null;
  startedAt: string;
  endedAt: string | null;
}

export interface PreviewMessage {
  id: number;
  direction: string;
  channel: string;
  body: string;
  fromNumber: string | null;
  toNumber: string | null;
  isAi: boolean;
  createdAt: string;
}

interface ActivityState<T> {
  isLoading: boolean;
  isError: boolean;
  items: T[];
}

const SAMPLE_CALLS: PreviewCall[] = [
  {
    id: -1,
    callSid: "SAMPLE_CA_1",
    direction: "inbound",
    fromNumber: "+16475550118",
    toNumber: "+18005550199",
    status: "completed",
    durationSec: 92,
    startedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    endedAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
  },
  {
    id: -2,
    callSid: "SAMPLE_CA_2",
    direction: "inbound",
    fromNumber: "+14165550144",
    toNumber: "+18005550199",
    status: "no-answer",
    durationSec: null,
    startedAt: new Date(Date.now() - 1000 * 60 * 47).toISOString(),
    endedAt: null,
  },
  {
    id: -3,
    callSid: "SAMPLE_CA_3",
    direction: "outbound",
    fromNumber: "+18005550199",
    toNumber: "+16475550127",
    status: "completed",
    durationSec: 215,
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    endedAt: new Date(Date.now() - 1000 * 60 * 60 * 3 + 215_000).toISOString(),
  },
];

const SAMPLE_MESSAGES: PreviewMessage[] = [
  {
    id: -1,
    direction: "inbound",
    channel: "sms",
    body: "Hi! Do you do emergency drain unclogs on weekends?",
    fromNumber: "+16475550118",
    toNumber: "+18005550199",
    isAi: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
  },
  {
    id: -2,
    direction: "outbound",
    channel: "sms",
    body: "Yes — same-day service available. Can I grab your postal code to confirm?",
    fromNumber: "+18005550199",
    toNumber: "+16475550118",
    isAi: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: -3,
    direction: "inbound",
    channel: "sms",
    body: "M5V 2H1",
    fromNumber: "+16475550118",
    toNumber: "+18005550199",
    isAi: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
  },
];

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatPhone(raw: string | null): string {
  if (!raw) return "Unknown";
  // Render E.164 numbers as +1 (xxx) xxx-xxxx style, else return as-is.
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(raw);
  if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  return raw;
}

function formatDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec) || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function CallStatusBadge({ status, direction }: { status: string; direction: string }) {
  const isMissed = direction === "inbound" && (status === "no-answer" || status === "busy" || status === "failed");
  const isAnswered = status === "completed" || status === "in-progress";
  const tone = isAnswered ? "success" : isMissed ? "danger" : "neutral";
  const styles =
    tone === "success" ? "bg-emerald-100 text-emerald-800" :
    tone === "danger" ? "bg-red-100 text-red-700" :
    "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${styles}`}>
      {status.replace(/-/g, " ")}
    </span>
  );
}

function SampleBanner() {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
      <p className="text-[11px] font-semibold text-amber-800">Demo data</p>
      <p className="text-[11px] text-amber-700 leading-tight">
        No live activity in the database yet. Showing sample rows so you can preview the layout.
      </p>
    </div>
  );
}

function LoadingList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="h-3 w-1/3 bg-gray-200 rounded animate-pulse mb-2" />
          <div className="h-3 w-2/3 bg-gray-100 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card>
      <Body>Couldn't load activity.</Body>
      <div className="mt-1">
        <Body muted>{message}</Body>
      </div>
    </Card>
  );
}

export function CallsScreen({ state }: { state?: ActivityState<PreviewCall> }) {
  const isLoading = state?.isLoading ?? false;
  const isError = state?.isError ?? false;
  const realItems = state?.items ?? [];
  const usingSample = !isLoading && !isError && realItems.length === 0;
  const items = usingSample ? SAMPLE_CALLS : realItems;

  return (
    <ScreenContainer>
      <Section>
        <Caption>Recent</Caption>
        <H1>Calls</H1>
        <Body muted>Most recent calls handled by your TradeLine number.</Body>
      </Section>
      <Section>
        {isLoading ? (
          <LoadingList rows={3} />
        ) : isError ? (
          <ErrorState message="Try the refresh button above the phone frame." />
        ) : (
          <>
            {usingSample && <SampleBanner />}
            <div className="space-y-3">
              {items.map((c) => {
                const isInbound = c.direction === "inbound";
                const peer = isInbound ? c.fromNumber : c.toNumber;
                return (
                  <Card key={c.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[14px]" aria-hidden>{isInbound ? "📥" : "📤"}</span>
                          <H2>{formatPhone(peer)}</H2>
                        </div>
                        <Body muted>
                          {isInbound ? "Inbound" : "Outbound"} · {formatRelative(c.startedAt)} · {formatDuration(c.durationSec)}
                        </Body>
                      </div>
                      <CallStatusBadge status={c.status} direction={c.direction} />
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </Section>
    </ScreenContainer>
  );
}

export function MessagesScreen({ state }: { state?: ActivityState<PreviewMessage> }) {
  const isLoading = state?.isLoading ?? false;
  const isError = state?.isError ?? false;
  const realItems = state?.items ?? [];
  const usingSample = !isLoading && !isError && realItems.length === 0;
  const items = usingSample ? SAMPLE_MESSAGES : realItems;

  return (
    <ScreenContainer>
      <Section>
        <Caption>Threads</Caption>
        <H1>Messages</H1>
        <Body muted>Most recent SMS exchanges through your TradeLine number.</Body>
      </Section>
      <Section>
        {isLoading ? (
          <LoadingList rows={3} />
        ) : isError ? (
          <ErrorState message="Try the refresh button above the phone frame." />
        ) : (
          <>
            {usingSample && <SampleBanner />}
            <div className="space-y-3">
              {items.map((m) => {
                const isInbound = m.direction === "inbound";
                const peer = isInbound ? m.fromNumber : m.toNumber;
                return (
                  <Card key={m.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[14px]" aria-hidden>{isInbound ? "📥" : "📤"}</span>
                        <H2>{formatPhone(peer)}</H2>
                      </div>
                      {m.isAi && !isInbound && <Badge>AI</Badge>}
                    </div>
                    <Body>{m.body}</Body>
                    <div className="mt-1.5">
                      <Body muted>
                        {isInbound ? "Customer" : m.isAi ? "AI reply" : "Manual reply"} · {formatRelative(m.createdAt)}
                      </Body>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
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
          <H2>Demo User</H2>
          <Body muted>you@wefixtrades.com</Body>
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
