import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { mkt } from "@/theme/tokens";

export default function NotFound() {
  return (
    <MarketingLayout>
      <PageMeta
        title="Page not found"
        description="The page you're looking for doesn't exist or has been moved."
        noIndex
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "50vh",
          padding: "80px 24px 40px",
          textAlign: "center",
        }}
      >
        <div>
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: mkt.onDarkFaint,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 12,
            }}
          >
            404
          </p>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: mkt.onDark,
              marginBottom: 8,
              letterSpacing: "-0.02em",
            }}
          >
            Page not found
          </h1>
          <p
            style={{
              fontSize: 14,
              color: mkt.onDarkMuted,
              marginBottom: 28,
              lineHeight: 1.5,
            }}
          >
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Link
            href="/"
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: mkt.accent,
              textDecoration: "none",
            }}
          >
            Back to home
          </Link>
        </div>
      </div>
    </MarketingLayout>
  );
}
