import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Star, MessageSquare, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";

interface ReviewData {
  businessName: string;
  customerName: string;
  status: string;
  sentiment: string | null;
  reviewUrl: string | null;
  facebookReviewUrl: string | null;
  hasFeedback: boolean;
}

type PageState = "loading" | "error" | "gate" | "choose_platform" | "positive" | "negative" | "submitted" | "already_done";

export default function ReviewFunnel() {
  const [, params] = useRoute("/review/:token");
  const token = params?.token || "";

  const [data, setData] = useState<ReviewData | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/review/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((d: ReviewData) => {
        setData(d);
        const terminal = ["completed", "stopped", "feedback_captured"];
        if (terminal.includes(d.status) || d.hasFeedback) {
          setPageState("already_done");
        } else if (d.status === "routed_positive") {
          setPageState("positive");
        } else if (d.status === "routed_negative") {
          setPageState("negative");
        } else {
          setPageState("gate");
        }
      })
      .catch(() => setPageState("error"));
  }, [token]);

  async function handleSentiment(sentiment: "positive" | "negative") {
    setSubmitting(true);
    try {
      if (sentiment === "positive" && data?.reviewUrl && data?.facebookReviewUrl) {
        // Both platforms available — show choice screen (don't POST yet)
        setPageState("choose_platform");
        setSubmitting(false);
        return;
      }
      await sendSentiment(sentiment);
    } catch {
      setPageState("error");
    } finally {
      setSubmitting(false);
    }
  }

  async function sendSentiment(sentiment: string, platform?: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/review/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentiment, platform }),
      });
      const result = await res.json();
      if (!res.ok) {
        if (res.status === 400) {
          setPageState("already_done");
          return;
        }
        throw new Error(result.error);
      }
      if (sentiment === "positive" || sentiment === "neutral") {
        if (result.reviewUrl) {
          setData((d) => d ? { ...d, reviewUrl: result.reviewUrl } : d);
        }
        setPageState("positive");
      } else {
        setPageState("negative");
      }
    } catch {
      setPageState("error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!feedback.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/review/${token}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: feedback.trim() }),
      });
      if (!res.ok) {
        const result = await res.json();
        if (res.status === 400) {
          setPageState("already_done");
          return;
        }
        throw new Error(result.error);
      }
      setPageState("submitted");
    } catch {
      setPageState("error");
    } finally {
      setSubmitting(false);
    }
  }

  if (pageState === "loading") {
    return (
      <div data-theme="light" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f5f5f5" }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "#0d3cfc" }} />
      </div>
    );
  }

  if (pageState === "error") {
    return (
      <Wrapper>
        <AlertCircle size={32} style={{ color: "#EF4444", marginBottom: 16 }} />
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Link not found</h2>
        <p style={{ color: "#666", fontSize: 14 }}>This review link is no longer valid or has expired.</p>
      </Wrapper>
    );
  }

  if (pageState === "already_done") {
    return (
      <Wrapper>
        <CheckCircle2 size={32} style={{ color: "#22C55E", marginBottom: 16 }} />
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Thank you!</h2>
        <p style={{ color: "#666", fontSize: 14 }}>You've already submitted your feedback. We appreciate it.</p>
      </Wrapper>
    );
  }

  if (pageState === "gate") {
    return (
      <Wrapper>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: "#1a1a2e" }}>
          How was your experience?
        </h2>
        <p style={{ color: "#555", fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" }}>
          {data?.customerName ? `Hi ${data.customerName}, your` : "Your"} feedback about <strong>{data?.businessName}</strong> helps other local customers and takes less than a minute.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Button
            onClick={() => handleSentiment("positive")}
            disabled={submitting}
            style={{ background: "#22C55E", color: "#fff", padding: "14px 28px", fontSize: 14, fontWeight: 600, borderRadius: 10, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
          >
            <Star size={20} /> Great experience!
          </Button>
          <Button
            onClick={() => handleSentiment("negative")}
            disabled={submitting}
            variant="outline"
            style={{ padding: "14px 28px", fontSize: 14, fontWeight: 600, borderRadius: 10, display: "flex", alignItems: "center", gap: 8 }}
          >
            <MessageSquare size={20} /> I had an issue
          </Button>
        </div>
      </Wrapper>
    );
  }

  if (pageState === "choose_platform") {
    const btnBase: React.CSSProperties = {
      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      background: "#fff", border: "2px solid #E5E7EB", borderRadius: 12,
      padding: "16px 24px", fontSize: 15, fontWeight: 600, cursor: "pointer",
      color: "#1a1a2e", transition: "all 0.15s ease", width: "100%",
      outline: "none",
    };
    return (
      <Wrapper>
        <CheckCircle2 size={32} style={{ color: "#22C55E", marginBottom: 16 }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: "#1a1a2e" }}>
          Great to hear!
        </h2>
        <p style={{ color: "#555", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
          Where would you like to leave your review for <strong>{data?.businessName}</strong>?
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 320 }}>
          <button
            onClick={() => sendSentiment("positive", "google")}
            disabled={submitting}
            aria-label="Leave a Google Review"
            style={btnBase}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.borderColor = "#4285F4"; (e.target as HTMLElement).style.boxShadow = "0 2px 8px rgba(66,133,244,0.15)"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.borderColor = "#E5E7EB"; (e.target as HTMLElement).style.boxShadow = "none"; }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Leave a Google Review
          </button>
          <button
            onClick={() => sendSentiment("positive", "facebook")}
            disabled={submitting}
            aria-label="Leave a Facebook Review"
            style={btnBase}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.borderColor = "#1877F2"; (e.target as HTMLElement).style.boxShadow = "0 2px 8px rgba(24,119,242,0.15)"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.borderColor = "#E5E7EB"; (e.target as HTMLElement).style.boxShadow = "none"; }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            Leave a Facebook Review
          </button>
        </div>
      </Wrapper>
    );
  }

  if (pageState === "positive") {
    return (
      <Wrapper>
        <CheckCircle2 size={32} style={{ color: "#22C55E", marginBottom: 16 }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: "#1a1a2e" }}>
          Thank you!
        </h2>
        <p style={{ color: "#555", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
          We're glad you had a great experience with <strong>{data?.businessName}</strong>.
          {data?.reviewUrl && " A quick Google review would really help them grow."}
        </p>
        {data?.reviewUrl && (
          <a
            href={data.reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "#0d3cfc", color: "#FFFFFF", fontSize: 14, fontWeight: 700,
              padding: "14px 28px", borderRadius: 10, textDecoration: "none",
            }}
          >
            Leave a Google Review <ExternalLink size={16} />
          </a>
        )}
      </Wrapper>
    );
  }

  if (pageState === "negative") {
    return (
      <Wrapper>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: "#1a1a2e" }}>
          We're sorry to hear that
        </h2>
        <p style={{ color: "#555", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
          Your feedback about <strong>{data?.businessName}</strong> helps us improve. Please tell us what happened — this is private and goes directly to the team.
        </p>
        <form onSubmit={handleFeedback}>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value.slice(0, 2000))}
            placeholder="What went wrong? How can we make it right?"
            rows={4}
            maxLength={2000}
            style={{
              width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ddd",
              fontSize: 14, fontFamily: "inherit", resize: "vertical", marginBottom: 4,
              boxSizing: "border-box",
            }}
          />
          {feedback.length > 1500 && (
            <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "right", margin: "0 0 8px" }}>{feedback.length}/2000</p>
          )}
          <Button
            type="submit"
            disabled={!feedback.trim() || submitting}
            style={{
              background: "#1a1a2e", color: "#fff", padding: "12px 24px",
              fontSize: 14, fontWeight: 600, borderRadius: 10, border: "none", cursor: "pointer",
              width: "100%",
            }}
          >
            {submitting ? "Sending..." : "Submit Feedback"}
          </Button>
        </form>
      </Wrapper>
    );
  }

  // submitted
  return (
    <Wrapper>
      <CheckCircle2 size={40} style={{ color: "#22C55E", marginBottom: 16 }} />
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: "#1a1a2e" }}>
        Thank you for your feedback
      </h2>
      <p style={{ color: "#555", fontSize: 14, lineHeight: 1.6 }}>
        The team at <strong>{data?.businessName}</strong> will review your comments and follow up if needed.
      </p>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f5f5f5", padding: 20 }}>
      <Card style={{ maxWidth: 480, width: "100%", padding: 32, textAlign: "center" }}>
        {children}
      </Card>
    </div>
  );
}
