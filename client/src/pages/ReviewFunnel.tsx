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
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f5f5f5" }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "#00D4C8" }} />
      </div>
    );
  }

  if (pageState === "error") {
    return (
      <Wrapper>
        <AlertCircle size={40} style={{ color: "#EF4444", marginBottom: 16 }} />
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Link not found</h2>
        <p style={{ color: "#666", fontSize: 14 }}>This review link is no longer valid or has expired.</p>
      </Wrapper>
    );
  }

  if (pageState === "already_done") {
    return (
      <Wrapper>
        <CheckCircle2 size={40} style={{ color: "#22C55E", marginBottom: 16 }} />
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
            <Star size={18} /> Great experience!
          </Button>
          <Button
            onClick={() => handleSentiment("negative")}
            disabled={submitting}
            variant="outline"
            style={{ padding: "14px 28px", fontSize: 14, fontWeight: 600, borderRadius: 10, display: "flex", alignItems: "center", gap: 8 }}
          >
            <MessageSquare size={18} /> I had an issue
          </Button>
        </div>
      </Wrapper>
    );
  }

  if (pageState === "choose_platform") {
    return (
      <Wrapper>
        <CheckCircle2 size={40} style={{ color: "#22C55E", marginBottom: 16 }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: "#1a1a2e" }}>
          Great to hear!
        </h2>
        <p style={{ color: "#555", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
          Where would you like to leave your review for <strong>{data?.businessName}</strong>?
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => sendSentiment("positive", "google")}
            disabled={submitting}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10,
              padding: "14px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer",
              color: "#1a1a2e", transition: "border-color 0.2s",
            }}
          >
            <span style={{ fontSize: 20 }}>G</span> Leave a Google Review
          </button>
          <button
            onClick={() => sendSentiment("positive", "facebook")}
            disabled={submitting}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10,
              padding: "14px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer",
              color: "#1a1a2e", transition: "border-color 0.2s",
            }}
          >
            <span style={{ fontSize: 20, color: "#1877F2" }}>f</span> Leave a Facebook Review
          </button>
        </div>
      </Wrapper>
    );
  }

  if (pageState === "positive") {
    return (
      <Wrapper>
        <CheckCircle2 size={40} style={{ color: "#22C55E", marginBottom: 16 }} />
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
              background: "#00D4C8", color: "#1A1A2E", fontSize: 14, fontWeight: 700,
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
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What went wrong? How can we make it right?"
            rows={4}
            style={{
              width: "100%", padding: 12, borderRadius: 8, border: "1px solid #ddd",
              fontSize: 14, fontFamily: "inherit", resize: "vertical", marginBottom: 12,
              boxSizing: "border-box",
            }}
          />
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
