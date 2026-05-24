/**
 * Web-native mirror of the wefixtrades-softphone screens.
 *
 * Visual parity with the actual RN screens (same layout, copy). The visual
 * polish wave introduced:
 *   - Brand-blue primary on every CTA + selected/active outline.
 *   - Per-mode colors on the Duty screen status cards (green / blue / dark
 *     grey for available / on_the_job / after_hours).
 *   - Day / night theme toggle on every screen header. The host wraps these
 *     screens in `.wft-mob-preview[data-theme="…"]` so every semantic token
 *     (background, surface, text, primary, success, danger, warn, night)
 *     flips with the toggle.
 *   - Premium five-tab bar with a centered FAB for the Duty control.
 *     Voicemail moved to a sub-screen reachable from Calls + Messages.
 *
 * All colors come from CSS variables defined under
 * `.wft-mob-preview[data-theme="…"]` in client/src/index.css. Literal hex
 * values are NOT used here so the hardcoded-color guard stays green.
 */

import React, { type ReactNode, useState } from "react";
import { Moon, Sun, Voicemail as VoicemailGlyph } from "lucide-react";

/* ─── Shared primitives (tiny re-implementations of mobile primitives) ─── */

function ScreenContainer({ children }: { children: ReactNode }) {
  return <div className="flex flex-col h-full overflow-y-auto wft-mp-surface-soft">{children}</div>;
}

function Section({ children }: { children: ReactNode }) {
  return <div className="px-5 py-4 space-y-3">{children}</div>;
}

function Caption({ children }: { children: ReactNode }) {
  return <p className="wft-mp-text-muted text-[11px] font-semibold uppercase tracking-wider">{children}</p>;
}

function H1({ children }: { children: ReactNode }) {
  return <h1 className="wft-mp-text text-[26px] font-bold tracking-tight leading-tight">{children}</h1>;
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="wft-mp-text text-[17px] font-semibold">{children}</h2>;
}

function Body({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <p className={`text-[15px] leading-[22px] ${muted ? "wft-mp-text-muted" : "wft-mp-text"}`}>{children}</p>;
}

function Card({ children, selected = false }: { children: ReactNode; selected?: boolean }) {
  return (
    <div className={`wft-mp-card p-4 ${selected ? "wft-mp-card--selected" : ""}`}>{children}</div>
  );
}

function Badge({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "success" | "neutral" }) {
  const cls =
    tone === "success" ? "wft-mp-badge-success" :
    tone === "neutral" ? "wft-mp-badge-neutral" :
    "wft-mp-badge-primary";
  return <span className={`wft-mp-badge ${cls}`}>{children}</span>;
}

function Button({ onClick, children, variant = "primary" }: { onClick: () => void; children: ReactNode; variant?: "primary" | "outline" | "danger" }) {
  const cls =
    variant === "outline" ? "wft-mp-btn-outline" :
    variant === "danger" ? "wft-mp-btn-danger" :
    "wft-mp-btn-primary";
  return (
    <button
      onClick={onClick}
      className={`h-12 rounded-[10px] px-4 text-[16px] font-semibold active:opacity-80 transition-opacity w-full ${cls}`}
    >
      {children}
    </button>
  );
}

/* ─── Theme toggle (shared header control) ───────────────────────────── */

export type Theme = "light" | "dark";

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const Icon = theme === "dark" ? Sun : Moon;
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      data-testid="mobile-preview-theme-toggle"
      className="wft-mp-theme-toggle inline-flex items-center justify-center w-8 h-8 rounded-full"
    >
      <Icon className="w-4 h-4" aria-hidden />
    </button>
  );
}

interface HeaderProps {
  theme: Theme;
  onToggleTheme: () => void;
  caption?: string;
  title: string;
  subtitle?: string;
  leadingIcon?: ReactNode;
}

function ScreenHeader({ theme, onToggleTheme, caption, title, subtitle, leadingIcon }: HeaderProps) {
  return (
    <Section>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          {leadingIcon}
          <div className="min-w-0">
            {caption && <Caption>{caption}</Caption>}
            <H1>{title}</H1>
          </div>
        </div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      {subtitle && <Body muted>{subtitle}</Body>}
    </Section>
  );
}

/* ─── Login screen ─── */

export function LoginScreen({ onSignIn, theme, onToggleTheme }: { onSignIn: () => void; theme: Theme; onToggleTheme: () => void }) {
  const [email, setEmail] = useState("you@wefixtrades.com");
  const [password, setPassword] = useState("••••••••");
  return (
    <ScreenContainer>
      <Section>
        <div className="flex items-start justify-between gap-3">
          <img src="/brand/icon.svg" alt="WeFixTrades" className="w-8 h-8 mb-1" />
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
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
            className="wft-mp-input w-full h-12 px-3 rounded-[10px] text-[16px]"
          />
        </div>
        <div className="space-y-1.5">
          <Caption>Password</Caption>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="wft-mp-input w-full h-12 px-3 rounded-[10px] text-[16px]"
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
  const cls =
    isAnswered ? "wft-mp-badge-success" :
    isMissed ? "wft-mp-badge-danger" :
    "wft-mp-badge-neutral";
  return <span className={`wft-mp-badge ${cls}`}>{status.replace(/-/g, " ")}</span>;
}

function SampleBanner() {
  return (
    <div className="wft-mp-demo-banner rounded-lg px-3 py-2">
      <p className="text-[11px] font-semibold">Demo data</p>
      <p className="text-[11px] leading-tight opacity-90">
        No live activity in the database yet. Showing sample rows so you can preview the layout.
      </p>
    </div>
  );
}

function LoadingList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="wft-mp-card p-4">
          <div className="h-3 w-1/3 wft-mp-surface-soft rounded animate-pulse mb-2" />
          <div className="h-3 w-2/3 wft-mp-surface-soft rounded animate-pulse" />
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

interface CallsScreenProps {
  state?: ActivityState<PreviewCall>;
  theme?: Theme;
  onToggleTheme?: () => void;
  onOpenVoicemail?: () => void;
}

export function CallsScreen({ state, theme = "light", onToggleTheme = () => {}, onOpenVoicemail }: CallsScreenProps) {
  const isLoading = state?.isLoading ?? false;
  const isError = state?.isError ?? false;
  const realItems = state?.items ?? [];
  const usingSample = !isLoading && !isError && realItems.length === 0;
  const items = usingSample ? SAMPLE_CALLS : realItems;

  const [dialerOpen, setDialerOpen] = useState(false);
  const [dialerInput, setDialerInput] = useState("");
  const dialerKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

  return (
    <ScreenContainer>
      <ScreenHeader
        theme={theme}
        onToggleTheme={onToggleTheme}
        caption="Recent"
        title="Calls"
        subtitle="Most recent calls handled by your TradeLine number."
      />
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
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => { /* mocked tap-to-call */ }}
                        className="wft-mp-btn-outline text-[12px] font-semibold rounded-md px-3 py-1.5 active:opacity-80 transition-opacity"
                      >
                        <span aria-hidden>📞</span> Call back
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </Section>
      <Section>
        <Button variant="outline" onClick={() => setDialerOpen((v) => !v)}>
          {dialerOpen ? "Close dialer" : "+ New call"}
        </Button>
        {onOpenVoicemail && (
          <button
            type="button"
            onClick={onOpenVoicemail}
            data-testid="open-voicemail-from-calls"
            className="wft-mp-btn-ghost mt-1 w-full h-11 rounded-[10px] px-4 text-[14px] font-semibold inline-flex items-center justify-center gap-2 active:opacity-80 transition-opacity"
          >
            <VoicemailGlyph className="w-4 h-4" aria-hidden />
            Voicemail inbox
          </button>
        )}
        {dialerOpen && (
          <Card>
            <Caption>Dialer</Caption>
            <div className="wft-mp-text mt-1.5 mb-3 text-[20px] font-semibold min-h-[28px]" data-testid="dialer-input">
              {dialerInput || <span className="wft-mp-text-muted">Enter a number</span>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {dialerKeys.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setDialerInput((s) => s + k)}
                  className="wft-mp-btn-ghost h-12 rounded-md text-[18px] font-semibold active:opacity-80 transition-opacity"
                >
                  {k}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDialerInput("")}
                className="wft-mp-btn-ghost h-12 rounded-md text-[14px] font-semibold active:opacity-80 transition-opacity"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => { /* mocked place-call */ }}
                disabled={!dialerInput}
                className="wft-mp-btn-primary h-12 rounded-md text-[14px] font-semibold disabled:opacity-40 active:opacity-80 transition-opacity"
              >
                <span aria-hidden>📞</span> Call
              </button>
            </div>
          </Card>
        )}
      </Section>
    </ScreenContainer>
  );
}

interface MessagesScreenProps {
  state?: ActivityState<PreviewMessage>;
  theme?: Theme;
  onToggleTheme?: () => void;
  onOpenVoicemail?: () => void;
}

export function MessagesScreen({ state, theme = "light", onToggleTheme = () => {}, onOpenVoicemail }: MessagesScreenProps) {
  const isLoading = state?.isLoading ?? false;
  const isError = state?.isError ?? false;
  const realItems = state?.items ?? [];
  const usingSample = !isLoading && !isError && realItems.length === 0;
  const items = usingSample ? SAMPLE_MESSAGES : realItems;

  const [draft, setDraft] = useState("");

  return (
    <ScreenContainer>
      <ScreenHeader
        theme={theme}
        onToggleTheme={onToggleTheme}
        caption="Threads"
        title="Messages"
        subtitle="Most recent SMS exchanges through your TradeLine number."
      />
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
      <Section>
        <div className="flex items-end gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a reply…"
            aria-label="Message compose"
            className="wft-mp-input flex-1 h-12 px-3 rounded-[10px] text-[16px]"
          />
          <button
            type="button"
            onClick={() => { /* mocked send */ setDraft(""); }}
            disabled={!draft.trim()}
            className="wft-mp-btn-primary h-12 px-4 rounded-[10px] text-[14px] font-semibold disabled:opacity-40 active:opacity-80 transition-opacity"
          >
            Send
          </button>
        </div>
        {onOpenVoicemail && (
          <button
            type="button"
            onClick={onOpenVoicemail}
            data-testid="open-voicemail-from-messages"
            className="wft-mp-btn-ghost w-full h-11 rounded-[10px] px-4 text-[14px] font-semibold inline-flex items-center justify-center gap-2 active:opacity-80 transition-opacity"
          >
            <VoicemailGlyph className="w-4 h-4" aria-hidden />
            Voicemail inbox
          </button>
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

interface DutyScreenProps {
  currentMode: DutyMode;
  onSelect: (m: DutyMode) => void;
  theme?: Theme;
  onToggleTheme?: () => void;
}

export function DutyScreen({ currentMode, onSelect, theme = "light", onToggleTheme = () => {} }: DutyScreenProps) {
  return (
    <ScreenContainer>
      <ScreenHeader
        theme={theme}
        onToggleTheme={onToggleTheme}
        caption="Your status"
        title="Duty mode"
        subtitle="Pick how incoming calls route right now."
      />
      <Section>
        <div className="space-y-3">
          {MODES.map((m) => {
            const selected = m.key === currentMode;
            return (
              <div
                key={m.key}
                className={`wft-mp-card wft-mp-mode-card wft-mp-mode-${m.key} ${selected ? "is-active" : ""} p-4`}
                data-mode={m.key}
                data-active={selected ? "true" : "false"}
              >
                <div className="flex items-center justify-between mb-1">
                  <H2>{m.title}</H2>
                  {selected && (
                    <span className="wft-mp-badge wft-mp-badge-current">Current</span>
                  )}
                </div>
                <Body muted>{m.description}</Body>
                {!selected && (
                  <div className="mt-3">
                    <Button variant="outline" onClick={() => onSelect(m.key)}>
                      Switch to {m.title}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </ScreenContainer>
  );
}

/* ─── Settings ─── */

export function SettingsScreen({ onSignOut, theme = "light", onToggleTheme = () => {} }: { onSignOut: () => void; theme?: Theme; onToggleTheme?: () => void }) {
  return (
    <ScreenContainer>
      <ScreenHeader theme={theme} onToggleTheme={onToggleTheme} caption="Account" title="Settings" />
      <Section>
        <Card>
          <div className="flex items-center gap-3 mb-2">
            <img src="/brand/icon.svg" alt="WeFixTrades" className="w-8 h-8" />
            <div className="min-w-0">
              <H2>Demo User</H2>
              <Body muted>you@wefixtrades.com</Body>
            </div>
          </div>
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

/* ─── Ask (AI assistant) screen ─── */

const ASK_SUGGESTIONS = [
  "Summarize last call",
  "Draft a follow-up",
  "Find unpaid jobs",
];

interface AskMessageStub {
  id: number;
  role: "user" | "assistant";
  text: string;
}

const ASK_MESSAGES: AskMessageStub[] = [
  { id: 1, role: "user", text: "What did Sarah at 647-555-0118 call about earlier?" },
  {
    id: 2,
    role: "assistant",
    text: "Sarah called at 11:48am about an emergency drain unclog. She's in M5V 2H1 and asked about weekend availability — you replied confirming same-day service.",
  },
];

export function AskScreen({ theme = "light", onToggleTheme = () => {} }: { theme?: Theme; onToggleTheme?: () => void } = {}) {
  const [draft, setDraft] = useState("");
  return (
    <ScreenContainer>
      <ScreenHeader
        theme={theme}
        onToggleTheme={onToggleTheme}
        caption="Assistant"
        title="Ask"
        subtitle="Same context as your WeFixTrades dashboard. Mocked here."
        leadingIcon={<img src="/brand/icon.svg" alt="WeFixTrades" className="w-8 h-8" />}
      />
      <Section>
        <Caption>Try</Caption>
        <div className="flex flex-wrap gap-2">
          {ASK_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setDraft(s)}
              className="wft-mp-btn-ghost text-[13px] font-medium rounded-full px-3 py-1.5 active:opacity-80 transition-opacity"
            >
              {s}
            </button>
          ))}
        </div>
      </Section>
      <Section>
        <div className="space-y-2">
          {ASK_MESSAGES.map((m) => {
            const isUser = m.role === "user";
            return (
              <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"} gap-2 items-start`}>
                {!isUser && (
                  <div className="wft-mp-primary-tint w-8 h-8 rounded-full flex items-center justify-center shrink-0" aria-hidden>
                    <span className="text-[14px]">✨</span>
                  </div>
                )}
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl ${
                    isUser
                      ? "wft-mp-bubble-user rounded-br-sm"
                      : "wft-mp-bubble-assistant rounded-bl-sm"
                  }`}
                >
                  <p className="text-[15px] leading-[22px]">{m.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Section>
      <Section>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => { /* mocked attach */ }}
            aria-label="Attach photo"
            className="wft-mp-btn-ghost w-8 h-8 rounded-full text-[14px] active:opacity-80 transition-opacity"
          >
            📷
          </button>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about a customer, a job, an estimate…"
            aria-label="Ask the assistant"
            className="wft-mp-input flex-1 h-11 px-3 rounded-full text-[15px]"
          />
          <button
            type="button"
            onClick={() => { /* mocked mic */ }}
            aria-label="Record voice note"
            className="wft-mp-btn-ghost w-8 h-8 rounded-full text-[14px] active:opacity-80 transition-opacity"
          >
            🎤
          </button>
        </div>
      </Section>
    </ScreenContainer>
  );
}

/* ─── Voicemail screen (sub-screen reachable from Calls or Messages) ─── */

interface VoicemailStub {
  id: number;
  caller: string;
  duration: string;
  preview: string;
}

const SAMPLE_VOICEMAILS: VoicemailStub[] = [
  {
    id: 1,
    caller: "Sarah · Plumbing lead",
    duration: "0m 42s",
    preview: "Hi, my kitchen sink is backing up and I need someone today if possible…",
  },
  {
    id: 2,
    caller: "Marcus · ETA question",
    duration: "0m 18s",
    preview: "Just checking the ETA for the Tuesday job — any earlier slot opened up?",
  },
  {
    id: 3,
    caller: "Unknown · 555-0188",
    duration: "1m 05s",
    preview: "Hi, I got your number from a neighbour. Wondering if you do hot-water tank installs…",
  },
];

interface VoicemailScreenProps {
  theme?: Theme;
  onToggleTheme?: () => void;
  onBack?: () => void;
}

export function VoicemailScreen({ theme = "light", onToggleTheme = () => {}, onBack }: VoicemailScreenProps = {}) {
  return (
    <ScreenContainer>
      <ScreenHeader
        theme={theme}
        onToggleTheme={onToggleTheme}
        caption="Inbox"
        title="Voicemail"
        subtitle="Customers who left a message while you were busy."
      />
      {onBack && (
        <Section>
          <button
            type="button"
            onClick={onBack}
            data-testid="voicemail-back"
            className="wft-mp-btn-ghost w-full h-11 rounded-[10px] px-4 text-[14px] font-semibold active:opacity-80 transition-opacity"
          >
            ← Back
          </button>
        </Section>
      )}
      <Section>
        <div className="space-y-3">
          {SAMPLE_VOICEMAILS.map((vm) => (
            <Card key={vm.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <H2>{vm.caller}</H2>
                  <Body muted>{vm.duration}</Body>
                  <div className="mt-1.5">
                    <Body>{vm.preview}</Body>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { /* mocked playback */ }}
                  aria-label="Play voicemail"
                  className="wft-mp-btn-primary w-8 h-8 rounded-full text-[14px] flex items-center justify-center shrink-0 active:opacity-80 transition-opacity"
                >
                  ▶
                </button>
              </div>
            </Card>
          ))}
        </div>
      </Section>
    </ScreenContainer>
  );
}

/* ─── Bottom tab bar — 5 tabs + centered Duty FAB ───────────────────── */

export type TabKey = "calls" | "ask" | "duty" | "messages" | "settings";

const SIDE_TABS: Array<{ key: Exclude<TabKey, "duty">; label: string; activeGlyph: string; restGlyph: string }> = [
  { key: "calls",    label: "Calls",    activeGlyph: "📞", restGlyph: "📞" },
  { key: "ask",      label: "Ask",      activeGlyph: "✨", restGlyph: "✦" },
  { key: "messages", label: "Messages", activeGlyph: "💬", restGlyph: "💭" },
  { key: "settings", label: "Settings", activeGlyph: "⚙",  restGlyph: "⚙" },
];

const DUTY_GLYPH: Record<DutyMode, string> = {
  available: "🟢",
  on_the_job: "🔵",
  after_hours: "🌙",
};

interface TabBarProps {
  active: TabKey;
  onChange: (k: TabKey) => void;
  dutyMode?: DutyMode;
  /** iOS home-indicator inset reservation (px). Defaults to 24 to match
   * the modern iPhone bottom safe area. */
  safeAreaBottom?: number;
}

export function TabBar({ active, onChange, dutyMode = "available", safeAreaBottom = 24 }: TabBarProps) {
  const isDutyActive = active === "duty";
  const left = SIDE_TABS.slice(0, 2);
  const right = SIDE_TABS.slice(2);
  return (
    <div
      className="wft-mp-tabbar absolute bottom-0 left-0 right-0 flex items-stretch"
      style={{ height: `${64 + safeAreaBottom}px`, paddingBottom: `${safeAreaBottom}px` }}
    >
      {left.map((t) => (
        <TabButton key={t.key} tab={t} active={active === t.key} onClick={() => onChange(t.key)} />
      ))}
      {/* Centered spacer where the FAB sits */}
      <div className="w-[72px] flex-shrink-0" aria-hidden />
      {right.map((t) => (
        <TabButton key={t.key} tab={t} active={active === t.key} onClick={() => onChange(t.key)} />
      ))}
      <button
        type="button"
        onClick={() => onChange("duty")}
        data-testid="tabbar-duty-fab"
        aria-label={`Duty mode (current: ${dutyMode.replace(/_/g, " ")})`}
        className={`wft-mp-fab wft-mp-fab-${dutyMode} ${isDutyActive ? "is-active" : ""} absolute left-1/2 -translate-x-1/2 w-[64px] h-[64px] rounded-full flex flex-col items-center justify-center gap-0.5`}
        style={{ top: `-18px` }}
      >
        <span className="text-[22px] leading-none" aria-hidden>{DUTY_GLYPH[dutyMode]}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider">Duty</span>
      </button>
    </div>
  );
}

function TabButton({ tab, active, onClick }: { tab: { key: Exclude<TabKey, "duty">; label: string; activeGlyph: string; restGlyph: string }; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`tabbar-${tab.key}`}
      aria-pressed={active}
      className={`wft-mp-tab flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] ${active ? "is-active" : ""}`}
    >
      <span className="text-[20px] leading-[20px]" aria-hidden>{active ? tab.activeGlyph : tab.restGlyph}</span>
      <span className={`text-[11px] ${active ? "font-bold" : "font-medium"}`}>{tab.label}</span>
      {active && <span className="wft-mp-tab-indicator" aria-hidden />}
    </button>
  );
}
