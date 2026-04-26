/**
 * Welcome package email — sent when a service is fully delivered
 * (all fulfillment tasks reach `delivered` and the service status
 * transitions to `active` or `completed`).
 *
 * Different services have different "you are live" artifacts:
 *  - QuoteQuick: widget embed snippet + portal link
 *  - TradeLine: the number/widget + call-back dashboard link
 *  - MapGuard / ReputationShield / RankFlow: portal link + first report ETA
 *  - SocialSync: portal link + approval queue link
 *  - SiteLaunch / SiteLaunch-Template: the live URL + admin access
 *  - AdFlow: live campaign dashboard link
 *  - WebFix: summary of fixes + before/after report
 *
 * For now we build a generic template that the per-service blocks fill in.
 * Service-specific deep links can be added over time without changing callers.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildLegalFooter } from "./emailFooter";
import { db } from "../db";
import { clients, clientServices, serviceCatalog } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Client, ClientService } from "@shared/schema";

interface WelcomeArtifact {
  label: string;
  value: string;
  kind: "link" | "text" | "code";
}

interface ServiceCopy {
  hero: string;                 // One-line headline replacement
  intro: string;                // Paragraph under headline
  firstAction?: string;         // Optional next-step callout ("Here's your embed code...")
}

function getServiceCopy(serviceId: string): ServiceCopy {
  if (serviceId.startsWith("quotequick")) return {
    hero: "Your instant quote calculator is live",
    intro: "Customers visiting your website can now get real-time quotes and submit qualified leads straight to your inbox.",
    firstAction: "Grab the embed code from your portal and paste it into your site's footer — takes 30 seconds.",
  };
  if (serviceId.startsWith("tradeline")) return {
    hero: "Your AI employee is answering 24/7",
    intro: "Every inbound call and chat is now handled by your trained AI assistant. You'll get an SMS for every lead in real time.",
    firstAction: "Watch the first few conversations in your call log and tweak tone or pricing rules any time.",
  };
  if (serviceId.startsWith("mapguard")) return {
    hero: "Your Google Business Profile is optimized",
    intro: "We rebuilt your profile, uploaded fresh photos, and scheduled your first batch of posts. Monthly monitoring is live.",
    firstAction: "Your first visibility report drops in ~30 days. We'll alert you immediately if anything breaks.",
  };
  if (serviceId.startsWith("reputationshield")) return {
    hero: "Review automation is active",
    intro: "New reviews are now monitored across Google (and any other platforms you gave us). Request automation runs on the schedule you picked.",
    firstAction: "Negative reviews under 4 stars will ping you before they post publicly — check the dashboard for your first batch.",
  };
  if (serviceId.startsWith("rankflow")) return {
    hero: "Your SEO plan is in motion",
    intro: "Google Search Console is connected, target keywords are locked in, and your first batch of on-page work is already underway.",
    firstAction: "Your first ranking report will land in 2 weeks with early movement data and next-cycle actions.",
  };
  if (serviceId.startsWith("socialsync")) return {
    hero: "Your content calendar is scheduled",
    intro: "We've generated a month of posts tailored to your trade. You'll approve each one before it goes live.",
    firstAction: "Check your approval queue — the first posts are waiting for your thumbs-up.",
  };
  if (serviceId.startsWith("adflow")) return {
    hero: "Your ad campaigns are running",
    intro: "Tracking, creatives, and targeting are all live. The white-label team is monitoring daily for the first week to dial in performance.",
    firstAction: "Your first performance snapshot drops in 7 days. We'll flag winners and losers so you can decide where to double down.",
  };
  if (serviceId === "sitelaunch-template") return {
    hero: "Your new site is live",
    intro: "Built from a proven trade template, populated with your content, and published. Mobile-first, SEO-ready, lead-capture wired.",
    firstAction: "Share the link with a customer and watch your first form submission land in your inbox.",
  };
  if (serviceId.startsWith("sitelaunch")) return {
    hero: "Your custom website is live",
    intro: "Design finalized, 5 pages built, on-page SEO set, and DNS cut over. You own everything — we're just the team that shipped it.",
    firstAction: "Send the first link to a customer and keep an eye on your analytics — the first data should arrive within 24 hours.",
  };
  if (serviceId === "webfix") return {
    hero: "All fixes deployed",
    intro: "Every issue from your brief has been addressed, tested, and pushed live. No action needed from your side.",
    firstAction: "Review the before/after summary in your portal — keep it for your records or share with your team.",
  };
  // Fallback
  return {
    hero: "Your service is up and running",
    intro: "Everything is configured and live. Here's what you need to get started.",
  };
}

function buildArtifacts(serviceId: string, _cs: ClientService, baseUrl: string): WelcomeArtifact[] {
  // Portal link is always relevant
  const artifacts: WelcomeArtifact[] = [
    { label: "Your dashboard", value: `${baseUrl}/portal`, kind: "link" },
  ];

  if (serviceId.startsWith("quotequick")) {
    artifacts.push({ label: "Calculator & embed code", value: `${baseUrl}/portal/services`, kind: "link" });
  }
  if (serviceId.startsWith("tradeline")) {
    artifacts.push({ label: "Call log & chat history", value: `${baseUrl}/portal/services`, kind: "link" });
  }
  if (serviceId.startsWith("mapguard")) {
    artifacts.push({ label: "Visibility report", value: `${baseUrl}/portal/mapguard`, kind: "link" });
  }
  if (serviceId.startsWith("reputationshield")) {
    artifacts.push({ label: "Review dashboard", value: `${baseUrl}/portal/reputation`, kind: "link" });
  }
  if (serviceId.startsWith("rankflow")) {
    artifacts.push({ label: "Ranking dashboard", value: `${baseUrl}/portal/rankflow`, kind: "link" });
  }
  if (serviceId.startsWith("socialsync")) {
    artifacts.push({ label: "Content approval queue", value: `${baseUrl}/portal/socialsync`, kind: "link" });
  }
  if (serviceId.startsWith("adflow")) {
    artifacts.push({ label: "Campaign dashboard", value: `${baseUrl}/portal/services`, kind: "link" });
  }
  if (serviceId.startsWith("sitelaunch") || serviceId === "webfix") {
    artifacts.push({ label: "Site & handoff details", value: `${baseUrl}/portal/services`, kind: "link" });
  }

  return artifacts;
}

function buildHtml(params: {
  contactName: string;
  serviceName: string;
  copy: ServiceCopy;
  artifacts: WelcomeArtifact[];
  supportEmail: string;
}): string {
  const artifactRows = params.artifacts
    .map(a => {
      if (a.kind === "link") {
        return `<tr>
          <td style="padding:10px 14px;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:8px;">
            <div style="font-size:11px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">${a.label}</div>
            <a href="${a.value}" style="font-size:14px;color:#66E8FA;text-decoration:none;word-break:break-all;">${a.value}</a>
          </td>
        </tr>
        <tr><td style="height:8px;"></td></tr>`;
      }
      return `<tr>
        <td style="padding:10px 14px;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:8px;">
          <div style="font-size:11px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">${a.label}</div>
          <code style="font-size:12px;color:#F0F0F0;font-family:'DM Mono',monospace;word-break:break-all;">${a.value}</code>
        </td>
      </tr>
      <tr><td style="height:8px;"></td></tr>`;
    })
    .join("");

  return `
    <div style="font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0B0F14;padding:40px 16px;">
      <div style="max-width:520px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:32px;">
          <span style="display:inline-block;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:12px;font-weight:800;padding:5px 16px;border-radius:999px;letter-spacing:0.06em;">WeFixTrades</span>
        </div>
        <div style="background:#151A21;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:36px 28px;">
          <p style="font-size:12px;font-weight:700;color:#66E8FA;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px;">You're live · ${params.serviceName}</p>
          <h1 style="font-size:26px;font-weight:700;color:#F0F0F0;margin:0 0 12px;line-height:1.25;">
            ${params.copy.hero}
          </h1>
          <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 14px;">
            Hi ${params.contactName}, ${params.copy.intro}
          </p>
          ${params.copy.firstAction ? `
          <div style="background:rgba(102,232,250,0.06);border-left:2px solid #66E8FA;border-radius:4px;padding:12px 14px;margin:0 0 24px;">
            <p style="font-size:13px;color:#CDD1D6;line-height:1.55;margin:0;">
              <strong style="color:#66E8FA;font-weight:600;">Next:</strong> ${params.copy.firstAction}
            </p>
          </div>
          ` : `<div style="height:10px;"></div>`}

          <table style="width:100%;border-collapse:separate;border-spacing:0;">
            ${artifactRows}
          </table>

          <div style="border-top:1px solid rgba(255,255,255,0.06);margin:28px 0;"></div>

          <p style="font-size:12px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 10px;">
            Need anything?
          </p>
          <p style="font-size:13px;color:#CDD1D6;line-height:1.6;margin:0;">
            Reply to this email or reach us at
            <a href="mailto:${params.supportEmail}" style="color:#66E8FA;text-decoration:none;">${params.supportEmail}</a>.
            We monitor every inbox and reply fast.
          </p>
        </div>
        <p style="font-size:11px;color:#555B63;text-align:center;margin:24px 0 0;line-height:1.5;">
          Thanks for choosing WeFixTrades.
        </p>
        ${buildLegalFooter()}
      </div>
    </div>
  `;
}

export async function sendWelcomePackage(clientServiceId: number): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn("[welcome-email] SMTP not configured — skipping welcome email");
    return false;
  }

  const [cs] = await db.select().from(clientServices).where(eq(clientServices.id, clientServiceId)).limit(1);
  if (!cs) {
    console.warn(`[welcome-email] client_service #${clientServiceId} not found`);
    return false;
  }

  // Idempotency — skip if already sent
  const csMeta = (cs.metadata as any) || {};
  if (csMeta.welcome_sent_at) {
    console.log(`[welcome-email] Already sent for client_service #${clientServiceId} at ${csMeta.welcome_sent_at}`);
    return false;
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, cs.client_id)).limit(1);
  if (!client || !client.contact_email) {
    console.warn(`[welcome-email] Client #${cs.client_id} missing email — skipping`);
    return false;
  }

  const [svc] = await db.select().from(serviceCatalog).where(eq(serviceCatalog.id, cs.service_id)).limit(1);
  const serviceName = svc?.name || cs.service_id;

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const supportEmail = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress();
  const contactName = client.contact_name || client.business_name || "there";

  const artifacts = buildArtifacts(cs.service_id, cs, baseUrl);
  const copy = getServiceCopy(cs.service_id);

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: client.contact_email,
      replyTo: supportEmail,
      subject: `${serviceName} is live — welcome aboard`,
      html: buildHtml({ contactName, serviceName, copy, artifacts, supportEmail }),
    });

    // Mark as sent
    await db.update(clientServices)
      .set({
        metadata: { ...csMeta, welcome_sent_at: new Date().toISOString() },
        updated_at: new Date(),
      } as any)
      .where(eq(clientServices.id, cs.id));

    console.log(`[welcome-email] Sent for ${serviceName} to ${client.contact_email}`);
    return true;
  } catch (err: any) {
    console.error(`[welcome-email] Failed to send for client_service #${clientServiceId}:`, err.message);
    return false;
  }
}
