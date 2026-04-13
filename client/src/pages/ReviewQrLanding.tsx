import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Loader2, AlertCircle } from "lucide-react";

/**
 * QR landing page — scanned by customer in the field.
 * Creates a review request session via the API, then redirects
 * to the standard sentiment gate (/review/:token).
 */
export default function ReviewQrLanding() {
  const [, params] = useRoute("/review/qr/:widgetToken");
  const [, navigate] = useLocation();
  const widgetToken = params?.widgetToken || "";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!widgetToken) return;

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
          setError("Unable to start review. Please try again.");
        }
      })
      .catch((err) => {
        setError(err.message || "Something went wrong. Please try again.");
      });
  }, [widgetToken, navigate]);

  if (error) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f5f5f5", padding: 20 }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: 32, maxWidth: 400, textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <AlertCircle size={40} style={{ color: "#EF4444", marginBottom: 16 }} />
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Oops</h2>
          <p style={{ color: "#666", fontSize: 14 }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f5f5f5" }}>
      <Loader2 size={32} style={{ color: "#00D4C8" }} className="animate-spin" />
    </div>
  );
}
