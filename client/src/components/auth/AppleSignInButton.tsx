/**
 * "Continue with Apple" button — shared by /login and /signup.
 *
 * Mirrors GoogleSignInButton / FacebookSignInButton: a plain anchor to the
 * server-side OAuth entry point. No client-side Apple JS — the whole flow is
 * server-driven (redirect → Apple → form_post callback). Keeps the bundle
 * lean and avoids a third-party script.
 *
 * Apple's Human Interface Guidelines call for a solid black button with
 * white label + white Apple glyph; the glyph uses pure white (#FFFFFF) so it
 * reads crisply on the black fill.
 */

interface AppleSignInButtonProps {
  /** "login" or "signup" — passed through so the server can tailor copy. */
  mode: "login" | "signup";
}

export default function AppleSignInButton({ mode }: AppleSignInButtonProps) {
  const label = mode === "signup" ? "Sign up with Apple" : "Continue with Apple";

  return (
    <a
      href={`/api/auth/apple/start?mode=${mode}`}
      data-testid="button-apple-signin"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        width: "100%",
        padding: "11px 14px",
        background: "#000000",
        color: "#FFFFFF",
        fontSize: 14,
        fontWeight: 600,
        borderRadius: 10,
        border: "1px solid #000000",
        textDecoration: "none",
        boxSizing: "border-box",
        transition: "box-shadow 160ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 1px 6px rgba(0,0,0,0.35)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
    >
      <AppleGlyph />
      {label}
    </a>
  );
}

/** Apple's mark, inline so there's no asset dependency. Pure-white fill for
 *  crisp visibility on the black button. */
function AppleGlyph() {
  return (
    <svg width="16" height="18" viewBox="0 0 14 17" aria-hidden="true" style={{ display: "block" }}>
      <path
        fill="#FFFFFF"
        d="M11.62 9.02c-.02-1.9 1.55-2.81 1.62-2.86-.88-1.29-2.26-1.47-2.75-1.49-1.17-.12-2.28.69-2.87.69-.59 0-1.5-.67-2.47-.65-1.27.02-2.44.74-3.09 1.87-1.32 2.29-.34 5.68.94 7.54.63.91 1.37 1.93 2.34 1.89.94-.04 1.29-.61 2.43-.61 1.13 0 1.45.61 2.44.59 1.01-.02 1.65-.92 2.27-1.84.72-1.05 1.01-2.07 1.03-2.12-.02-.01-1.97-.76-1.99-3-.02-1.87 1.53-2.77 1.6-2.82"
      />
      <path
        fill="#FFFFFF"
        d="M9.73 3.5c.52-.63.87-1.51.77-2.38-.75.03-1.65.5-2.19 1.13-.48.55-.9 1.44-.79 2.29.84.06 1.69-.42 2.21-1.04"
      />
    </svg>
  );
}
