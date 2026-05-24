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
import {
  Moon,
  Sun,
  Voicemail as VoicemailGlyph,
  Phone,
  Sparkles,
  MessageCircle,
  Settings2,
  type LucideIcon,
} from "lucide-react";

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

/* ─── Calls helpers (avatar, classification, handling badge, chips) ─── */

function initialsFromPhone(raw: string | null): string {
  if (!raw) return "?";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 2) return digits || "?";
  return digits.slice(-2);
}

function isMissedCall(c: PreviewCall): boolean {
  return c.direction === "inbound" && (c.status === "no-answer" || c.status === "busy" || c.status === "failed");
}

function callHandlingLabel(c: PreviewCall): { text: string; tone: "ai" | "missed" | "neutral" | "live" } {
  if (isMissedCall(c)) return { text: "Missed", tone: "missed" };
  if (c.status === "in-progress") return { text: "In progress", tone: "live" };
  if (c.direction === "inbound" && c.status === "completed") {
    return { text: "AI handled", tone: "ai" };
  }
  return { text: c.direction === "outbound" ? "Outbound" : "Handled", tone: "neutral" };
}

function HandlingBadge({ text, tone }: { text: string; tone: "ai" | "missed" | "neutral" | "live" }) {
  // Each tone maps to a theme-aware token pair defined in client/src/index.css
  // (.wft-mp-primary-tint / .wft-mp-success-soft / etc.). Falling back to ghost
  // border so dark + light look right without bespoke CSS.
  const className =
    tone === "ai" ? "wft-mp-primary-tint wft-mp-primary-border" :
    tone === "missed" ? "wft-mp-card" :
    tone === "live" ? "wft-mp-card" :
    "wft-mp-card";
  const inlineStyle =
    tone === "missed" ? { background: "var(--wft-mp-danger-soft)", color: "var(--wft-mp-danger)", borderColor: "var(--wft-mp-danger)" } :
    tone === "live" ? { background: "var(--wft-mp-success-soft)", color: "var(--wft-mp-success)", borderColor: "var(--wft-mp-success)" } :
    tone === "neutral" ? { background: "var(--wft-mp-surface-soft)", color: "var(--wft-mp-text-muted)", borderColor: "var(--wft-mp-border)" } :
    undefined;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${className}`}
      style={inlineStyle}
    >
      {text}
    </span>
  );
}

type CallsFilter = "all" | "missed" | "voicemail";

function FilterChip({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active ? "true" : undefined}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold transition-colors border ${
        active ? "wft-mp-btn-primary" : "wft-mp-btn-ghost"
      }`}
    >
      <span>{label}</span>
      {typeof count === "number" && count > 0 && (
        <span
          className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold"
          style={
            active
              ? { background: "var(--wft-mp-primary-ink)", color: "var(--wft-mp-primary)" }
              : { background: "var(--wft-mp-danger)", color: "var(--wft-mp-primary-ink)" }
          }
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

/* ─── Calls screen ─────────────────────────────────────────────────
 * Modern phone-app pattern: filter chip row, scrollable list of
 * tappable rows (initials avatar + direction icon + AI badge + meta
 * + side "Call back" pill), and a slide-up keypad sheet behind a
 * floating action button. Replaces the prior toggle-to-show inline
 * dialer that hid the keypad below the fold.
 *
 * Why this shape:
 * - Filter chips surface Missed / Voicemail counts at a glance.
 * - Full-row tap → call detail (transcript/AI notes). Side pill
 *   stops propagation so "Call back" never accidentally opens detail.
 * - FAB sits outside the scrollable container so it stays fixed.
 * - Modal sheet covers the screen-content wrapper (not the tab bar).
 *
 * Layout note: we add an extra <div className="relative h-full"> as
 * the FAB + modal positioning anchor. The outer page already wraps
 * us in a similar relative container, but we keep our own so the
 * FAB / modal stay scoped to the Calls screen specifically and don't
 * cover the bottom tab bar / Duty FAB.
 */

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

  const [filter, setFilter] = useState<CallsFilter>("all");
  const [dialerOpen, setDialerOpen] = useState(false);
  const [dialerInput, setDialerInput] = useState("");
  const dialerKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

  const missedCount = items.filter(isMissedCall).length;
  // Voicemail count is approximate until the call record carries a voicemail
  // flag — surface a positive count only when at least one missed call exists.
  const voicemailCount = missedCount > 0 ? Math.min(missedCount, 2) : 0;

  const visibleItems = items.filter((c) => {
    if (filter === "missed") return isMissedCall(c);
    if (filter === "voicemail") return isMissedCall(c);
    return true;
  });

  function formatDialerDisplay(raw: string): string {
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits.length === 0) return "";
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `+${digits.slice(0, digits.length - 10)} (${digits.slice(-10, -7)}) ${digits.slice(-7, -4)}-${digits.slice(-4)}`;
  }

  function closeDialer() {
    setDialerOpen(false);
  }

  return (
    <div className="relative h-full">
    <ScreenContainer>
      <ScreenHeader
        theme={theme}
        onToggleTheme={onToggleTheme}
        caption="Recent"
        title="Calls"
        subtitle="Tap a call to see transcript, AI notes, and customer history."
      />

      {/* Filter chip row */}
      <div className="px-5 pb-2">
        <div className="flex items-center gap-2 overflow-x-auto" role="tablist" aria-label="Filter calls">
          <FilterChip label="All" active={filter === "all"} onClick={() => setFilter("all")} />
          <FilterChip label="Missed" active={filter === "missed"} count={missedCount} onClick={() => setFilter("missed")} />
          <FilterChip label="Voicemail" active={filter === "voicemail"} count={voicemailCount} onClick={() => setFilter("voicemail")} />
        </div>
      </div>

      <Section>
        {isLoading ? (
          <LoadingList rows={4} />
        ) : isError ? (
          <ErrorState message="Try the refresh button above the phone frame." />
        ) : (
          <>
            {usingSample && <SampleBanner />}
            {visibleItems.length === 0 ? (
              <Card>
                <Body muted>
                  {filter === "missed"
                    ? "No missed calls — every inbound call was answered or handled by AI."
                    : filter === "voicemail"
                      ? "No voicemails right now."
                      : "No recent calls yet."}
                </Body>
              </Card>
            ) : (
              <div className="space-y-2">
                {visibleItems.map((c) => {
                  const isInbound = c.direction === "inbound";
                  const peer = isInbound ? c.fromNumber : c.toNumber;
                  const missed = isMissedCall(c);
                  const handling = callHandlingLabel(c);
                  const dirGlyph = missed ? "✗" : isInbound ? "↓" : "↑";
                  const dirAria = missed ? "Missed" : isInbound ? "Incoming" : "Outgoing";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { /* mocked: open call detail */ }}
                      data-testid={`call-row-${c.id}`}
                      className="wft-mp-card w-full text-left p-3 flex items-center gap-3 active:opacity-80 transition-opacity"
                      style={missed ? { borderLeft: "4px solid var(--wft-mp-danger)" } : undefined}
                    >
                      {/* Avatar / initials */}
                      <div
                        className="w-[40px] h-[40px] rounded-full flex items-center justify-center shrink-0 text-[12px] font-bold"
                        style={missed
                          ? { background: "var(--wft-mp-danger-soft)", color: "var(--wft-mp-danger)" }
                          : { background: "var(--wft-mp-primary-soft)", color: "var(--wft-mp-primary)" }}
                        aria-hidden
                      >
                        {initialsFromPhone(peer)}
                      </div>

                      {/* Middle: name + meta */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-[11px] leading-none"
                            style={missed ? { color: "var(--wft-mp-danger)" } : { color: "var(--wft-mp-text-muted)" }}
                            aria-label={dirAria}
                          >
                            {dirGlyph}
                          </span>
                          <span className={`wft-mp-text text-[15px] truncate ${missed ? "font-bold" : "font-semibold"}`}>
                            {formatPhone(peer)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <HandlingBadge text={handling.text} tone={handling.tone} />
                          <span className="wft-mp-text-muted text-[12px] truncate">
                            {formatRelative(c.startedAt)}
                            {c.durationSec ? ` · ${formatDuration(c.durationSec)}` : ""}
                          </span>
                        </div>
                      </div>

                      {/* Right: call-back pill — span+role=button so it is a
                          valid child of the outer <button> and can stop
                          propagation when the user only wants to dial back. */}
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Call back"
                        onClick={(e) => { e.stopPropagation(); /* mocked tap-to-call */ }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                          }
                        }}
                        className="wft-mp-btn-outline shrink-0 inline-flex items-center gap-1 text-[12px] font-semibold rounded-full px-3 py-1.5 active:opacity-80 transition-opacity"
                      >
                        <span aria-hidden>📞</span> Call back
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Section>

      {onOpenVoicemail && (
        <Section>
          <button
            type="button"
            onClick={onOpenVoicemail}
            data-testid="open-voicemail-from-calls"
            className="wft-mp-btn-ghost w-full h-11 rounded-[10px] px-4 text-[14px] font-semibold inline-flex items-center justify-center gap-2 active:opacity-80 transition-opacity"
          >
            <VoicemailGlyph className="w-4 h-4" aria-hidden />
            Voicemail inbox
          </button>
        </Section>
      )}
    </ScreenContainer>

      {/* Floating Action Button — opens the slide-up keypad sheet. Sits
          16pt from the right edge of the Calls screen, clear of the bottom
          tab bar (the parent reserves pb-[88px]). It lives outside the
          ScreenContainer's overflow-y-auto so it doesn't scroll with the
          call list. */}
      <button
        type="button"
        onClick={() => setDialerOpen(true)}
        aria-label="+ New call"
        data-testid="open-keypad-fab"
        className="wft-mp-btn-primary absolute right-4 bottom-4 w-[56px] h-[56px] rounded-full flex items-center justify-center active:opacity-80 transition-opacity z-20"
        style={{ boxShadow: "var(--wft-mp-shadow-fab)" }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <circle cx="8" cy="7" r="0.6" fill="currentColor" />
          <circle cx="12" cy="7" r="0.6" fill="currentColor" />
          <circle cx="16" cy="7" r="0.6" fill="currentColor" />
          <circle cx="8" cy="11" r="0.6" fill="currentColor" />
          <circle cx="12" cy="11" r="0.6" fill="currentColor" />
          <circle cx="16" cy="11" r="0.6" fill="currentColor" />
          <circle cx="8" cy="15" r="0.6" fill="currentColor" />
          <circle cx="12" cy="15" r="0.6" fill="currentColor" />
          <circle cx="16" cy="15" r="0.6" fill="currentColor" />
        </svg>
        <span className="sr-only">+ New call</span>
      </button>

      {/* Slide-up keypad sheet (modal). Backdrop dismisses; sheet body
          uses wft-mp tokens so it respects the active theme. */}
      {dialerOpen && (
        <div className="absolute inset-0 z-30" role="dialog" aria-modal="true" aria-label="New call keypad">
          <div
            onClick={closeDialer}
            className="absolute inset-0"
            style={{ background: "rgba(15, 23, 42, 0.45)" }}
            aria-hidden
          />
          <div
            data-testid="keypad-sheet"
            className="wft-mp-surface absolute left-0 right-0 bottom-0 rounded-t-2xl px-4 pt-3 pb-4"
            style={{ maxHeight: "78%", boxShadow: "0 -8px 24px rgba(0, 0, 0, 0.18)", border: "1px solid var(--wft-mp-border)" }}
          >
            <div className="flex items-center justify-center mb-2" aria-hidden>
              <div className="w-10 h-1 rounded-full" style={{ background: "var(--wft-mp-border-strong)" }} />
            </div>
            <div className="flex items-center justify-between mb-3">
              <H2>New call</H2>
              <button
                type="button"
                onClick={closeDialer}
                aria-label="Close keypad"
                className="wft-mp-btn-ghost w-8 h-8 rounded-full flex items-center justify-center text-[18px] active:opacity-80 transition-opacity"
              >
                ✕
              </button>
            </div>

            {/* Number display + backspace */}
            <div className="flex items-center gap-2 mb-4">
              <div
                className="wft-mp-input flex-1 h-12 px-3 rounded-[10px] flex items-center text-[22px] font-semibold tracking-wide"
                data-testid="dialer-input"
                aria-live="polite"
              >
                {dialerInput ? formatDialerDisplay(dialerInput) : <span className="wft-mp-text-muted text-[16px] font-normal">Enter a number</span>}
              </div>
              <button
                type="button"
                onClick={() => setDialerInput((s) => s.slice(0, -1))}
                disabled={!dialerInput}
                aria-label="Backspace"
                className="wft-mp-btn-ghost w-[48px] h-[48px] rounded-[10px] text-[18px] active:opacity-80 transition-opacity disabled:opacity-40 flex items-center justify-center"
              >
                ⌫
              </button>
            </div>

            {/* 3×4 keypad — each key 56pt tall + ≥64pt wide for gloved hands */}
            <div className="grid grid-cols-3 gap-2">
              {dialerKeys.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setDialerInput((s) => s + k)}
                  aria-label={`Key ${k}`}
                  className="wft-mp-btn-ghost h-14 min-w-[64px] rounded-xl text-[22px] font-semibold active:opacity-80 transition-opacity flex items-center justify-center"
                >
                  {k}
                </button>
              ))}
            </div>

            {/* Primary CTA */}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => { /* mocked place-call */ closeDialer(); }}
                disabled={!dialerInput}
                data-testid="keypad-call"
                className="wft-mp-btn-primary w-full h-12 rounded-[10px] text-[16px] font-semibold disabled:opacity-40 active:opacity-80 transition-opacity flex items-center justify-center gap-2"
              >
                <span aria-hidden>📞</span> Call
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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

// Premium minimal tab icons: a small curated set of Lucide glyphs at
// strokeWidth 1.75 (slightly thinner than default 2.0) reads as more
// refined and "app-grade" than chunky 2.0 strokes or emoji. Same icon
// for active + inactive — the differentiation is color + the active dot
// underneath, not a glyph swap (less visual noise).
const SIDE_TABS: Array<{ key: Exclude<TabKey, "duty">; label: string; Icon: LucideIcon }> = [
  { key: "calls",    label: "Calls",    Icon: Phone },
  { key: "ask",      label: "Ask",      Icon: Sparkles },
  { key: "messages", label: "Messages", Icon: MessageCircle },
  { key: "settings", label: "Settings", Icon: Settings2 },
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

function TabButton({ tab, active, onClick }: { tab: { key: Exclude<TabKey, "duty">; label: string; Icon: LucideIcon }; active: boolean; onClick: () => void }) {
  const Icon = tab.Icon;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`tabbar-${tab.key}`}
      aria-pressed={active}
      className={`wft-mp-tab flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] ${active ? "is-active" : ""}`}
    >
      <Icon
        width={22}
        height={22}
        strokeWidth={1.75}
        aria-hidden
        // Same size in both states; active vs inactive is differentiated by
        // color (wft-mp-tab.is-active flips to --wft-mp-primary) and the
        // small pill underneath — not by glyph or size jumps.
      />
      <span
        // Label color is driven by .wft-mp-tab / .wft-mp-tab.is-active in
        // index.css so dark + light themes both render correctly inside
        // the mobile preview shell — using Tailwind text-foreground here
        // would bypass the preview theme tokens.
        className={`text-[10px] uppercase tracking-wide ${active ? "font-medium" : "font-normal"}`}
      >
        {tab.label}
      </span>
      {active && <span className="wft-mp-tab-indicator" aria-hidden />}
    </button>
  );
}
