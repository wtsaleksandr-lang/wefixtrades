/**
 * Embeddable TradeLine chat widget — public + portal endpoints.
 *
 * Trades embed a one-line <script> snippet on their own website that
 * loads the widget bootstrap from /widget/v1.js. The bootstrap reads
 * the site key from the script tag, fetches widget config from
 * /api/widget/config/:key, and renders a chat panel that talks to
 * /api/widget/chat for AI replies (anonymous, rate-limited).
 *
 * Each widget chat uses the trade's TradeLine niche template +
 * customization — same AI brain that answers their phone, just
 * over chat instead of voice.
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { db } from "../db";
import { tradelineWidgetSites, clients } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireClient } from "../auth";
import { chatRateLimiter } from "../services/rateLimiter";
import { assistantSync } from "../services/assistant";
import { selectTemplate } from "../services/tradelineTemplates";
import { aiChannelGateOn } from "../services/aiChannelGate";
import { createLogger } from "../lib/logger";

const log = createLogger("Widget");

const DEFAULT_GREETING = "Hi there — how can we help today?";
const DEFAULT_ACCENT = "#0d3cfc";

function generateSiteKey(): string {
  // 32-hex characters — short enough to embed, long enough to be unguessable
  return crypto.randomBytes(16).toString("hex");
}

async function clientIdFromUser(req: Request, res: Response): Promise<number | null> {
  const [row] = await db.select({ id: clients.id }).from(clients).where(eq(clients.user_id, req.user!.id)).limit(1);
  if (!row) {
    res.status(403).json({ error: "No client record linked", code: "no_client_linked" });
    return null;
  }
  return row.id;
}

async function getOrCreateSite(clientId: number, businessName: string) {
  const [existing] = await db.select().from(tradelineWidgetSites).where(eq(tradelineWidgetSites.client_id, clientId)).limit(1);
  if (existing) return existing;
  const [inserted] = await db
    .insert(tradelineWidgetSites)
    .values({
      client_id: clientId,
      site_key: generateSiteKey(),
      enabled: true,
      display_name: businessName,
      greeting: DEFAULT_GREETING,
      accent_color: DEFAULT_ACCENT,
      position: "bottom-right",
    })
    .returning();
  return inserted;
}

function getClientIp(req: Request): string {
  const xfwd = req.headers["x-forwarded-for"];
  if (typeof xfwd === "string") return xfwd.split(",")[0].trim();
  return req.ip || "unknown";
}

export function registerTradelineWidgetRoutes(app: Express) {
  /* ─── PORTAL: get / update widget settings ─── */
  app.get("/api/portal/widget/site", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await clientIdFromUser(req, res);
      if (!clientId) return;
      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      if (!client) return res.status(404).json({ error: "Client not found" });
      const site = await getOrCreateSite(clientId, client.business_name);
      return res.json({ site, tradeType: client.trade_type ?? null });
    } catch (err: any) {
      log.error("portal get failed", { err: err?.message });
      return res.status(500).json({ error: "Failed to load widget settings" });
    }
  });

  const patchBody = z.object({
    enabled: z.boolean().optional(),
    display_name: z.string().max(120).optional(),
    greeting: z.string().max(500).optional(),
    accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    position: z.enum(["bottom-right", "bottom-left", "floating"]).optional(),
    allowed_origins: z.string().max(2000).optional(),
  });
  app.patch("/api/portal/widget/site", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await clientIdFromUser(req, res);
      if (!clientId) return;
      const parsed = patchBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      if (!client) return res.status(404).json({ error: "Client not found" });
      await getOrCreateSite(clientId, client.business_name);
      const [updated] = await db
        .update(tradelineWidgetSites)
        .set({ ...parsed.data, updated_at: new Date() })
        .where(eq(tradelineWidgetSites.client_id, clientId))
        .returning();
      return res.json(updated);
    } catch (err: any) {
      log.error("portal patch failed", { err: err?.message });
      return res.status(500).json({ error: "Failed to save widget settings" });
    }
  });

  /* ─── PUBLIC: widget config lookup by site_key ─── */
  app.get("/api/widget/config/:siteKey", async (req: Request, res: Response) => {
    try {
      const siteKey = String(req.params.siteKey || "").toLowerCase().trim();
      if (!/^[a-f0-9]{32}$/.test(siteKey)) return res.status(400).json({ error: "Invalid site key" });
      const [site] = await db
        .select({
          enabled: tradelineWidgetSites.enabled,
          display_name: tradelineWidgetSites.display_name,
          greeting: tradelineWidgetSites.greeting,
          accent_color: tradelineWidgetSites.accent_color,
          position: tradelineWidgetSites.position,
          allowed_origins: tradelineWidgetSites.allowed_origins,
        })
        .from(tradelineWidgetSites)
        .where(eq(tradelineWidgetSites.site_key, siteKey))
        .limit(1);
      if (!site || !site.enabled) return res.status(404).json({ error: "Widget not found or disabled" });

      // Origin allowlist (soft — when set, advise the loader but don't strictly block)
      const origin = req.headers.origin;
      let originAllowed: boolean | null = null;
      if (site.allowed_origins && origin) {
        const list = site.allowed_origins.split(",").map((o) => o.trim().toLowerCase()).filter(Boolean);
        originAllowed = list.includes(new URL(origin).host.toLowerCase());
      }

      res.set("Cache-Control", "public, max-age=60");
      // CORS — explicitly allow the embedding origin
      if (origin) {
        res.set("Access-Control-Allow-Origin", origin);
        res.set("Vary", "Origin");
      }
      return res.json({
        siteKey,
        displayName: site.display_name,
        greeting: site.greeting || DEFAULT_GREETING,
        accentColor: site.accent_color || DEFAULT_ACCENT,
        position: site.position,
        originAllowed,
      });
    } catch (err: any) {
      log.error("public config failed", { err: err?.message });
      return res.status(500).json({ error: "Failed to load widget config" });
    }
  });

  /* ─── PUBLIC: chat endpoint, anonymous, rate-limited per IP ─── */
  const chatBody = z.object({
    siteKey: z.string().regex(/^[a-f0-9]{32}$/),
    sessionId: z.string().min(8).max(64).optional(),
    messages: z
      .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) }))
      .min(1)
      .max(30),
  });
  app.post("/api/widget/chat", async (req: Request, res: Response) => {
    try {
      const ip = getClientIp(req);
      if (!(await chatRateLimiter.check(`widget:${ip}`))) {
        return res.status(429).json({ error: "Too many messages — please slow down" });
      }

      const parsed = chatBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

      // W-BA-1: per-channel emergency kill switch. When the chat channel is
      // gated OFF, return the offline notice instead of invoking the AI.
      if (!(await aiChannelGateOn("chat"))) {
        const origin = req.headers.origin;
        if (origin) {
          res.set("Access-Control-Allow-Origin", origin);
          res.set("Vary", "Origin");
        }
        return res.json({
          reply: "AI is currently offline; we'll respond shortly.",
          sessionId: parsed.data.sessionId || `widget-${parsed.data.siteKey}-offline`,
        });
      }

      const [row] = await db
        .select({
          enabled: tradelineWidgetSites.enabled,
          display_name: tradelineWidgetSites.display_name,
          greeting: tradelineWidgetSites.greeting,
          client_id: tradelineWidgetSites.client_id,
        })
        .from(tradelineWidgetSites)
        .where(eq(tradelineWidgetSites.site_key, parsed.data.siteKey))
        .limit(1);
      if (!row || !row.enabled) return res.status(404).json({ error: "Widget not found" });

      const [client] = await db
        .select({
          business_name: clients.business_name,
          trade_type: clients.trade_type,
        })
        .from(clients)
        .where(eq(clients.id, row.client_id))
        .limit(1);
      if (!client) return res.status(404).json({ error: "Widget owner not found" });

      const template = selectTemplate(client.trade_type);
      const services = template.fallbackServices.slice(0, 6);

      const systemPrompt = [
        `You are the AI assistant on the website of ${row.display_name || client.business_name}${client.trade_type ? `, a ${client.trade_type} business` : ""}. You handle inbound homeowner inquiries via the website chat widget.`,
        template.systemPromptBase,
        `TONE: ${template.defaultTone === "professional" ? "Professional and courteous." : template.defaultTone === "friendly" ? "Friendly and warm." : "Casual and natural."}`,
        `OUR SERVICES: ${services.join(", ")}.`,
        `CALL FLOW: ${template.callFlowNotes}`,
        `BOOKING: ${template.bookingBehavior}`,
        `ESCALATION: ${template.escalationRules}`,
        `WHEN UNSURE: ${template.fallbackBehavior}`,
        `IMPORTANT:`,
        `- You represent ${row.display_name || client.business_name} — always speak as "we".`,
        `- Keep replies to 1-3 short sentences. This is a web chat widget — people read quickly.`,
        `- Never claim to be human. If asked directly, say you're an AI assistant for the team.`,
        `- For emergencies described per the ESCALATION rules above, follow them literally (911, gas utility, poison control, etc.).`,
        `- At the end of a useful exchange, gently offer to take their name and phone number so the team can follow up.`,
      ].join("\n\n");

      const sessionId = parsed.data.sessionId || `widget-${parsed.data.siteKey}-${crypto.randomUUID()}`;
      const result = await assistantSync({
        surface: "tradeline_demo",
        messages: parsed.data.messages,
        sessionId,
        systemOverride: systemPrompt,
        maxTokens: 400,
      });

      // CORS for embedding sites
      const origin = req.headers.origin;
      if (origin) {
        res.set("Access-Control-Allow-Origin", origin);
        res.set("Vary", "Origin");
      }
      return res.json({ reply: result.reply, sessionId });
    } catch (err: any) {
      log.error("public chat failed", { err: err?.message });
      return res.status(500).json({ error: "Sorry — something went wrong on our end. Try again in a moment." });
    }
  });

  /* ─── CORS preflight ─── */
  app.options("/api/widget/config/:siteKey", (req: Request, res: Response) => {
    const origin = req.headers.origin;
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Allow-Methods", "GET");
      res.set("Vary", "Origin");
    }
    res.sendStatus(204);
  });
  app.options("/api/widget/chat", (req: Request, res: Response) => {
    const origin = req.headers.origin;
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Allow-Methods", "POST");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.set("Vary", "Origin");
    }
    res.sendStatus(204);
  });
}
