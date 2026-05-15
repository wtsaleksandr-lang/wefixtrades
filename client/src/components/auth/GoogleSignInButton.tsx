/**
 * "Continue with Google" button — shared by /login and /signup.
 *
 * A plain anchor to the server-side OAuth entry point. No client-side
 * Google SDK: the whole flow is server-driven (redirect → Google →
 * callback). Keeps the bundle lean and avoids a third-party script.
 */

interface GoogleSignInButtonProps {
  /** "login" or "signup" — passed through so the server can tailor copy. */
  mode: "login" | "signup";
}

export default function GoogleSignInButton({ mode }: GoogleSignInButtonProps) {
  const label = mode === "signup" ? "Sign up with Google" : "Continue with Google";

  return (
    <a
      href={`/api/auth/google/start?mode=${mode}`}
      data-testid="button-google-signin"
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
        border: "1px solid #DADCE0",
        textDecoration: "none",
        boxSizing: "border-box",
        transition: "box-shadow 160ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 1px 6px rgba(0,0,0,0.25)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
    >
      <GoogleGlyph />
      {label}
    </a>
  );
}

/** Google's four-color "G" mark, inline so there's no asset dependency. */
function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
