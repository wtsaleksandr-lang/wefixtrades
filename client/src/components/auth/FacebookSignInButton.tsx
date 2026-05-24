/**
 * "Sign in with Facebook" button — shared by /login and /signup.
 *
 * Mirrors GoogleSignInButton.tsx: plain anchor to the server-side OAuth
 * entry point. No client-side Facebook SDK — the whole flow is server-
 * driven (redirect → Facebook → callback). Keeps the bundle lean.
 */

interface FacebookSignInButtonProps {
  /** "login" or "signup" — passed through so the server can tailor copy. */
  mode: "login" | "signup";
}

export default function FacebookSignInButton({ mode }: FacebookSignInButtonProps) {
  const label = mode === "signup" ? "Sign up with Facebook" : "Sign in with Facebook";

  return (
    <a
      href={`/api/auth/facebook/start?mode=${mode}`}
      data-testid="button-facebook-signin"
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
        // Facebook brand blue (#1877F2) on the border only — neutral
        // interior keeps the row of social buttons visually consistent.
        border: "1px solid #1877F2",
        textDecoration: "none",
        boxSizing: "border-box",
        transition: "box-shadow 160ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 1px 6px rgba(0,0,0,0.25)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
    >
      <FacebookGlyph />
      {label}
    </a>
  );
}

/** Facebook's "f" mark, inline so there's no asset dependency. */
function FacebookGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M18 9a9 9 0 1 0-10.4 8.9v-6.3H5.3V9h2.3V7c0-2.3 1.4-3.6 3.5-3.6 1 0 2 .2 2 .2v2.3h-1.2c-1.1 0-1.5.7-1.5 1.5V9h2.6l-.4 2.6h-2.2v6.3A9 9 0 0 0 18 9z"
      />
    </svg>
  );
}
