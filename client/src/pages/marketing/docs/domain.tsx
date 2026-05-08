import { useEffect } from "react";
import DocsLayout, { Step, CodeBlock, Accordion, InfoBox, DocH2, DocH3, Checklist } from "@/components/marketing/DocsLayout";
import { mkt } from "@/theme/tokens";

export default function DocsDomain() {
  useEffect(() => { document.title = "Custom Domain — QuoteQuick Pro Docs"; }, []);

  return (
    <DocsLayout
      activeSlug="domain"
      title="Custom Domain"
      description="Point your own subdomain (e.g. quotes.yourbusiness.com) to your hosted calculator. SSL issued automatically."
    >

      <InfoBox type="tip">
        <strong>Don't need a custom domain?</strong> Your free hosted link works immediately: <code>quickquotepro.com/your-business</code>. Custom domain is optional — only needed if you want your own branded URL.
      </InfoBox>

      <DocH2>Your Default Hosted Link</DocH2>
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.7, marginBottom: 12 }}>
        Every account gets a free hosted URL the moment you publish your calculator:
      </p>
      <CodeBlock lang="text" code={`https://quickquotepro.com/your-business-name`} />
      <Checklist items={[
        "Free on all plans — available immediately",
        "Share it anywhere: Google Business, email signature, social media",
        "Your customers see the QuoteQuick Pro domain in the URL",
      ]} />

      <DocH2>Custom Subdomain (Recommended)</DocH2>
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.7, marginBottom: 12 }}>
        With a Pro or Elite plan, you can serve your calculator under your own subdomain:
      </p>
      <CodeBlock lang="text" code={`https://quotes.yourbusiness.com`} />
      <Checklist items={[
        "Fully branded — no mention of QuoteQuick Pro in the URL",
        "SSL certificate issued and renewed automatically",
        "Takes 10–30 minutes to set up once DNS is configured",
        "Requires one CNAME record added to your domain's DNS",
      ]} />

      <DocH2>Setup Steps</DocH2>
      <Step n={1} title="Go to Dashboard → Settings → Custom Domain">
        Enter the subdomain you want to use (e.g. <code>quotes.yourbusiness.com</code>) and click <strong>Add Domain</strong>. We'll give you a CNAME target to point to.
      </Step>
      <Step n={2} title="Add a CNAME record in your DNS provider">
        Log into wherever you manage your domain (GoDaddy, Cloudflare, Namecheap, Google Domains, etc.). Add this record:
        <CodeBlock lang="DNS" code={`Type:  CNAME
Name:  quotes          (just the subdomain part, not the full domain)
Value: cname.quickquotepro.com
TTL:   3600 (or "Auto")`} />
      </Step>
      <Step n={3} title="Click Verify in your Dashboard">
        Come back to Dashboard → Settings → Custom Domain and click <strong>Verify DNS</strong>. Once DNS propagates (usually 5–30 minutes), we'll issue your SSL certificate automatically.
      </Step>
      <Step n={4} title="You're live">
        Your calculator is now accessible at your custom subdomain with HTTPS. No further action needed — SSL renews automatically every 90 days.
      </Step>

      <DocH2>What We Need (Done-For-You Service)</DocH2>
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.7, marginBottom: 12 }}>
        If you'd prefer we handle the setup, our Done-For-You service includes domain configuration. We'll need:
      </p>
      <Checklist items={[
        "Temporary read/write access to your DNS provider, OR",
        "You to add one CNAME record we send you (5 minutes of your time)",
        "The exact subdomain you want to use",
      ]} />

      <DocH2>Troubleshooting DNS</DocH2>

      <Accordion title="How long does DNS propagation take?" icon="⏱️">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.7, margin: 0 }}>
          Usually 5–30 minutes, but can take up to 48 hours in rare cases depending on your DNS provider and TTL settings. While waiting, you can still use your free hosted link.
        </p>
      </Accordion>

      <Accordion title="I added the CNAME but verification fails" icon="❌">
        <DocH3>Common causes:</DocH3>
        <Checklist items={[
          `Wrong "Name" — the name field should be just the subdomain (e.g. "quotes"), not the full domain`,
          `Trailing dot — some providers add a trailing dot automatically; that's fine, ignore it`,
          `Wrong record type — must be CNAME, not A or TXT`,
          `Cloudflare "Proxy" enabled — set the CNAME to "DNS only" (grey cloud), not proxied (orange cloud)`,
        ]} />
      </Accordion>

      <Accordion title="Can I use a root domain (e.g. yourbusiness.com without a subdomain)?" icon="🌐">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.7, margin: 0 }}>
          Root domains (APEX domains) require an A record pointing to an IP, which we don't currently support directly. We recommend using a subdomain like <code>quotes.yourbusiness.com</code> — it's more professional anyway and takes seconds to set up.
        </p>
      </Accordion>

      <Accordion title="My SSL certificate shows as invalid" icon="🔒">
        <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.7, margin: 0 }}>
          SSL certificates are issued after DNS verification succeeds. If the certificate shows as invalid, DNS may not have fully propagated yet. Wait 10 minutes and try again. If it persists after 1 hour, contact support.
        </p>
      </Accordion>

      <InfoBox type="info">
        Custom domain requires a <strong>Pro or Elite plan</strong>. If you're on Free or Starter, upgrade from Dashboard → Settings → Plan.
      </InfoBox>

    </DocsLayout>
  );
}
