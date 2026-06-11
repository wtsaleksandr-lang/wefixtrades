/**
 * "Sign in with Microsoft" button — shared by /login and /signup.
 *
 * Mirrors GoogleSignInButton.tsx: plain anchor to the server-side OAuth
 * entry point. No client-side Microsoft SDK — the whole flow is server-
 * driven (redirect → Microsoft → callback). Keeps the bundle lean.
 */

interface MicrosoftSignInButtonProps {
  /** "login" or "signup" — passed through so the server can tailor copy. */
  mode: "login" | "signup";
}

export default function MicrosoftSignInButton({ mode }: MicrosoftSignInButtonProps) {
  const label = mode === "signup" ? "Sign up with Microsoft" : "Sign in with Microsoft";

  return (
    <a
      href={`/api/auth/microsoft/start?mode=${mode}`}
      data-testid="button-microsoft-signin"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        width: "100%",
        padding: "11px 14px",
        background: "#FFFFFF",
        color: "#1F1F1F",
        fontSize: 14,
        fontWeight: 600,
        borderRadius: 10,
        // P2-3 (night audit 2026-06-11): neutral border matching the Google
        // button — the glyph carries the brand; the bright brand-blue
        // outline made the SSO row read as mismatched.
        border: "1px solid #DADCE0",
        textDecoration: "none",
        boxSizing: "border-box",
        transition: "box-shadow 160ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 1px 6px rgba(0,0,0,0.25)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
    >
      <MicrosoftGlyph />
      {label}
    </a>
  );
}

/** Microsoft's four-square logo, inline so there's no asset dependency. */
function MicrosoftGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="1" y="1" width="7.5" height="7.5" fill="#F25022" />
      <rect x="9.5" y="1" width="7.5" height="7.5" fill="#7FBA00" />
      <rect x="1" y="9.5" width="7.5" height="7.5" fill="#00A4EF" />
      <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#FFB900" />
    </svg>
  );
}
