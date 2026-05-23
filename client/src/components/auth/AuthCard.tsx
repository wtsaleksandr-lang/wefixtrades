import type { ReactNode } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { V7PageShell } from "@/components/marketing/v7";
import { mkt } from "@/theme/tokens";

/**
 * Shared shell for unauthenticated pages — login, reset-password,
 * future signup variants. Extracts the centered card chrome
 * (MarketingLayout + V7PageShell + dark glass card) so individual
 * pages provide only the title, optional subtitle, form body, and
 * footer links.
 *
 * Visual standard: matches the existing /login look — dark glass
 * card on the marketing site's gradient backdrop, 420px max width,
 * subtle border + 16px radius. Tokens come from
 * `client/src/theme/tokens.ts` so light/dark drift stays in one
 * place.
 *
 * Why we keep MarketingLayout inside the shell: every auth page
 * needs the same global chrome (top nav, scroll behaviour,
 * font-loading guard). Pulling MarketingLayout into AuthCard means
 * the consumer is a 1-component file rather than a 3-component
 * sandwich.
 */
export interface AuthCardProps {
  /** Card heading, e.g. "Sign in" or "Set new password". */
  title: string;
  /** Optional supporting line under the title. */
  subtitle?: ReactNode;
  /** Form / panel body. */
  children: ReactNode;
  /** Optional footer slot for links — "Forgot password?", "Sign up", etc. */
  footer?: ReactNode;
  /** Optional override for `data-testid` so tests can target each page. */
  testId?: string;
}

export function AuthCard({ title, subtitle, children, footer, testId }: AuthCardProps) {
  return (
    <MarketingLayout>
      <V7PageShell>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "70vh",
            padding: "40px 16px",
          }}
        >
          <div style={{ width: "100%", maxWidth: 420 }}>
            <div
              data-testid={testId}
              style={{
                background: "rgba(21, 26, 33, 0.7)",
                border: `1px solid ${mkt.onDarkBorder}`,
                borderRadius: 16,
                padding: "32px 28px",
              }}
            >
              <h1
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: mkt.onDark,
                  marginBottom: subtitle ? 8 : 24,
                  letterSpacing: "-0.02em",
                }}
              >
                {title}
              </h1>
              {subtitle ? (
                <p style={{ fontSize: 14, color: mkt.onDarkMuted, marginBottom: 24, lineHeight: 1.5 }}>
                  {subtitle}
                </p>
              ) : null}
              {children}
            </div>
            {footer ? (
              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      </V7PageShell>
    </MarketingLayout>
  );
}

export default AuthCard;
