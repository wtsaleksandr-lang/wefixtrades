import { mkt } from "@/theme/tokens";
import { Link } from "wouter";
import { LegalShell, LegalSection, type TocItem } from "@/components/marketing/legal/LegalLayout";

/**
 * Cookie Policy. AI-drafted baseline — have an attorney review before EU
 * market entry or if a consent-management banner is added. Keep in sync with
 * the actual cookies set by the app (auth/session, chat-widget state, and any
 * analytics / Stripe / Cloudflare cookies).
 */

const ulStyle: React.CSSProperties = { paddingLeft: 20, marginTop: 8, display: "flex", flexDirection: "column", gap: 6 };
const EFFECTIVE = "June 1, 2026";

const TOC: TocItem[] = [
  { id: "what", label: "What are cookies?" },
  { id: "types", label: "The cookies we use" },
  { id: "managing", label: "Managing cookies" },
  { id: "changes", label: "Changes & contact" },
];

export default function CookiesPage() {
  return (
    <LegalShell
      title="Cookie Policy"
      sub={`Effective ${EFFECTIVE}`}
      metaTitle="Cookie policy"
      metaDescription="How WeFixTrades uses cookies and similar technologies, the types we set, and how you can control them."
      canonical="/cookies"
      toc={TOC}
    >
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.75, marginBottom: 32 }}>
        This Cookie Policy explains how MR Holdings &amp; Trade LLC (operating as
        "WeFixTrades") uses cookies and similar technologies when you visit our website
        or use our Service. It should be read alongside our{" "}
        <Link href="/privacy" style={{ color: mkt.accent, textDecoration: "none" }}>Privacy Policy</Link>.
      </p>

      <LegalSection id="what" title="What are cookies?">
        <p>
          Cookies are small text files a website stores on your device. They let the site
          remember your actions and preferences (such as staying signed in) and help us
          understand how the site is used. We also use similar technologies like local
          storage for the same purposes.
        </p>
      </LegalSection>

      <LegalSection id="types" title="The cookies we use">
        <ul style={ulStyle}>
          <li>
            <strong>Strictly necessary</strong> — required for the site to work: keeping you
            signed in, securing forms (CSRF protection), and load balancing. These can't be
            switched off without breaking the Service.
          </li>
          <li>
            <strong>Functional</strong> — remember your choices and improve your experience,
            such as the state of the on-site chat assistant (your conversation and whether
            the window is open).
          </li>
          <li>
            <strong>Analytics</strong> — help us understand which pages and tools are used so
            we can improve them. These are aggregated and not used to identify you personally.
          </li>
          <li>
            <strong>Third-party</strong> — some features rely on trusted providers that may set
            their own cookies, for example Cloudflare (security &amp; performance) and Stripe
            (fraud prevention during checkout).
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="managing" title="Managing cookies">
        <p>
          You can control or delete cookies through your browser settings — most browsers let
          you block or remove them. Note that blocking strictly necessary cookies may stop
          parts of the Service from working (for example, you may not be able to stay signed
          in). Guides are available in your browser's help pages.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes & contact">
        <p>
          We may update this policy as our product and the cookies we use change. The
          "Effective" date above reflects the latest version. Questions? Email{" "}
          <a href="mailto:support@wefixtrades.com" style={{ color: mkt.accent, textDecoration: "none" }}>support@wefixtrades.com</a>.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
