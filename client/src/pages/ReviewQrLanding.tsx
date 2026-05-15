import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Loader2, AlertCircle, Star } from "lucide-react";

/**
 * QR landing page — scanned by a customer in the field, right after
 * a job. Creates a review-request session via the API, then redirects
 * to the standard sentiment gate (/review/:token).
 *
 * This is a ~1-second interstitial, but it's the first thing a real
 * customer sees holding their phone — so it gets a branded loading
 * card and a genuinely helpful (not just "Oops") error state.
 */
export default function ReviewQrLanding() {
  const [, params] = useRoute("/review/qr/:widgetToken");
  const [, navigate] = useLocation();
  const widgetToken = params?.widgetToken || "";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!widgetToken) {
      setError("This review link looks incomplete.");
      return;
    }

    fetch(`/api/review/qr/${encodeURIComponent(widgetToken)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load");
        }
        return res.json();
      })
      .then((data) => {
        if (data.accessToken) {
          navigate(`/review/${data.accessToken}`, { replace: true });
        } else {
          setError("Unable to start your review. Please try again.");
        }
      })
      .catch((err) => {
        setError(err.message || "Something went wrong. Please try again.");
      });
  }, [widgetToken, navigate]);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        background: "#f5f5f5",
        padding: 20,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: "40px 32px",
          maxWidth: 380,
          width: "100%",
          textAlign: "center",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        {/* Brand wordmark */}
        <div style={{ marginBottom: 24 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e", letterSpacing: "-0.01em" }}>
            WeFixTrades
          </span>
        </div>

        {error ? (
          <>
            <div
              style={{
                width: 52, height: 52, borderRadius: "50%",
                background: "#FEF2F2", display: "flex",
                alignItems: "center", justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <AlertCircle size={26} style={{ color: "#EF4444" }} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px", color: "#1a1a2e" }}>
              This review link isn't working
            </h2>
            <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              The QR code may have expired or been scanned too many times.
              Ask the team for a fresh link or a new QR code — they can
              generate one in seconds.
            </p>
          </>
        ) : (
          <>
            <div
              style={{
                width: 52, height: 52, borderRadius: "50%",
                background: "#EFF3FF", display: "flex",
                alignItems: "center", justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <Star size={26} style={{ color: "#0d3cfc", fill: "#0d3cfc" }} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px", color: "#1a1a2e" }}>
              Just a moment…
            </h2>
            <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
              We're getting your review page ready.
            </p>
            <Loader2 size={24} style={{ color: "#0d3cfc" }} className="animate-spin" />
          </>
        )}
      </div>
    </div>
  );
}
