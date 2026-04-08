import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { processSocialSyncQueue } from "../jobs/socialSyncWorker";
import { generateWeekForClient, generateAllDue } from "../services/socialSync/orchestrator";
import { regeneratePost } from "../services/socialSync/contentGenerator";
import {
  validateFacebookConfig, buildFacebookOAuthUrl, handleFacebookCallback,
  selectFacebookPage, validateFacebookConnection,
} from "../services/socialSync/facebookService";
import {
  discoverInstagramAccounts, selectInstagramAccount, validateInstagramConnection,
} from "../services/socialSync/instagramService";
import { disconnectPlatform, checkConnectionExpiry } from "../services/socialSync/connectionLifecycle";
import { resolveMediaForPost } from "../services/socialSync/mediaService";
import { decryptToken } from "../services/socialSync/tokenEncryption";
import type { SocialSyncProfile, InsertSocialSyncTopic } from "@shared/schema";

/* ─── Seed Topic Templates ─── */

const TOPIC_TEMPLATES: { type: string; pattern: string; angle: string }[] = [
  { type: "tip", pattern: "{count} Signs You Need {service} This {season}", angle: "Educational awareness" },
  { type: "tip", pattern: "How to Tell If Your {service} Needs Attention", angle: "Problem identification" },
  { type: "tip", pattern: "{count} {service} Maintenance Tips for {season}", angle: "Seasonal maintenance advice" },
  { type: "before_after", pattern: "Before & After: {service} in {location}", angle: "Visual transformation showcase" },
  { type: "before_after", pattern: "This {location} Home Needed {service} — Here's the Result", angle: "Project story" },
  { type: "testimonial", pattern: "Why {location} Homeowners Trust Us for {service}", angle: "Social proof and trust" },
  { type: "testimonial", pattern: "Another Happy Customer: {service} Done Right", angle: "Client satisfaction" },
  { type: "seasonal", pattern: "Get Your Home Ready for {season} with {service}", angle: "Seasonal prep urgency" },
  { type: "seasonal", pattern: "Is Your {service} Ready for {season}?", angle: "Seasonal checklist" },
  { type: "promo", pattern: "This Week Only: Special Offer on {service}", angle: "Limited-time promotion" },
  { type: "promo", pattern: "Book {service} This Month and Save", angle: "Monthly deal" },
  { type: "educational", pattern: "What Every Homeowner Should Know About {service}", angle: "Knowledge sharing" },
  { type: "educational", pattern: "The Real Cost of Ignoring {service} Problems", angle: "Cost awareness" },
  { type: "behind_the_scenes", pattern: "A Day in the Life: {service} Work in {location}", angle: "Team and process showcase" },
  { type: "behind_the_scenes", pattern: "Meet the Team Behind Your {service}", angle: "Human connection" },
  { type: "tip", pattern: "Common {service} Mistakes Homeowners Make", angle: "Expert guidance" },
  { type: "educational", pattern: "DIY vs Professional {service}: When to Call the Pros", angle: "Authority positioning" },
  { type: "seasonal", pattern: "Top {count} {season} {service} Problems We See Every Year", angle: "Recurring seasonal issues" },
  { type: "testimonial", pattern: "From Emergency to Fixed: A {service} Success Story", angle: "Urgency and reliability" },
  { type: "promo", pattern: "Free {service} Inspection — Limited Spots Available", angle: "Lead generation offer" },
  { type: "before_after", pattern: "{service} Upgrade: See the Difference Quality Makes", angle: "Quality differentiation" },
  { type: "educational", pattern: "How Often Should You Service Your {service}?", angle: "Maintenance schedule" },
  { type: "tip", pattern: "{count} Warning Signs Your {service} Is Failing", angle: "Urgency trigger" },
  { type: "behind_the_scenes", pattern: "How We Handle {service} Jobs from Start to Finish", angle: "Process transparency" },
  { type: "seasonal", pattern: "Don't Wait Until {season} — Schedule {service} Now", angle: "Early booking incentive" },
];

const SEASONS = ["Spring", "Summer", "Fall", "Winter"];
const COUNTS = ["3", "5", "7"];

function generateSeedTopics(profile: SocialSyncProfile, count: number): Omit<InsertSocialSyncTopic, "id" | "created_at" | "updated_at">[] {
  const services = (profile.services as string[] | null) || [profile.niche || "home repair"];
  const location = profile.location || "your area";
  const topics: Omit<InsertSocialSyncTopic, "id" | "created_at" | "updated_at">[] = [];

  // Deterministic shuffle based on client_id for variety across clients
  const shuffled = [...TOPIC_TEMPLATES].sort((a, b) => {
    const hashA = (profile.client_id * 31 + a.pattern.length) % 1000;
    const hashB = (profile.client_id * 31 + b.pattern.length) % 1000;
    return hashA - hashB;
  });

  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    const tmpl = shuffled[i];
    const service = services[i % services.length];
    const season = SEASONS[i % SEASONS.length];
    const cnt = COUNTS[i % COUNTS.length];

    const title = tmpl.pattern
      .replace("{service}", service)
      .replace("{location}", location)
      .replace("{season}", season)
      .replace("{count}", cnt);

    topics.push({
      client_id: profile.client_id,
      title,
      type: tmpl.type,
      angle: tmpl.angle,
      target_service: service,
      target_location: profile.location,
      source_type: "template",
      status: "active",
      generation_context: { method: "seed_v1", template_index: i, profile_niche: profile.niche },
    });
  }

  return topics;
}

/* ─── Route Registration ─── */

export function registerSocialSyncRoutes(app: Express): void {

  // 1. GET profile
  app.get("/api/socialsync/clients/:clientId/profile", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const profile = await storage.getSocialSyncProfile(clientId);
      if (!profile) return res.json({ exists: false, client_id: clientId });
      res.json(profile);
    } catch (err: any) {
      console.error("[socialsync] Profile get error:", err.message);
      res.status(500).json({ error: "Failed to load SocialSync profile" });
    }
  });

  // 2. PUT profile (upsert)
  app.put("/api/socialsync/clients/:clientId/profile", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const profile = await storage.upsertSocialSyncProfile({
        client_id: clientId,
        enabled: req.body.enabled,
        niche: req.body.niche,
        location: req.body.location,
        services: req.body.services,
        tone: req.body.tone,
        frequency: req.body.frequency,
        autopilot: req.body.autopilot,
        platform_preferences: req.body.platform_preferences,
        service_focus: req.body.service_focus,
      });

      await storage.createSocialSyncLog({
        client_id: clientId,
        entity_type: "profile",
        entity_id: profile.id,
        action: "profile.updated",
        status: "success",
        details: { fields: Object.keys(req.body) },
      });

      res.json(profile);
    } catch (err: any) {
      console.error("[socialsync] Profile upsert error:", err.message);
      res.status(500).json({ error: "Failed to update SocialSync profile" });
    }
  });

  // 3. POST generate seed topics
  app.post("/api/socialsync/clients/:clientId/topics/generate-seed", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const count = Math.min(25, Math.max(1, parseInt(req.body.count) || 10));

      const profile = await storage.getSocialSyncProfile(clientId);
      if (!profile) return res.status(400).json({ error: "SocialSync profile not found. Create a profile first." });

      const topicData = generateSeedTopics(profile, count);
      const topics = await storage.createSocialSyncTopics(topicData as any[]);

      await storage.createSocialSyncLog({
        client_id: clientId,
        entity_type: "topic",
        entity_id: null as any,
        action: "topics.seed_generated",
        status: "success",
        details: { count: topics.length, method: "seed_v1" },
      });

      res.status(201).json({ topics, count: topics.length });
    } catch (err: any) {
      console.error("[socialsync] Seed topics error:", err.message);
      res.status(500).json({ error: "Failed to generate seed topics" });
    }
  });

  // 4. GET topics
  app.get("/api/socialsync/clients/:clientId/topics", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const status = req.query.status as string | undefined;
      const topics = await storage.listSocialSyncTopics(clientId, status);
      res.json(topics);
    } catch (err: any) {
      console.error("[socialsync] List topics error:", err.message);
      res.status(500).json({ error: "Failed to list topics" });
    }
  });

  // 5. POST create post from topic
  app.post("/api/socialsync/clients/:clientId/posts/create-from-topic", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const { topic_id, platform, post_text, caption, hashtags, media_plan, scheduled_for } = req.body;

      if (!platform || typeof platform !== "string") return res.status(400).json({ error: "platform is required" });
      if (!post_text || typeof post_text !== "string") return res.status(400).json({ error: "post_text is required" });

      // Validate topic if provided
      if (topic_id) {
        const topics = await storage.listSocialSyncTopics(clientId);
        const topic = topics.find(t => t.id === topic_id);
        if (!topic) return res.status(404).json({ error: "Topic not found or does not belong to this client" });
      }

      // Compute duplicate hash
      const duplicate_hash = crypto.createHash("sha256")
        .update(post_text.trim().toLowerCase())
        .digest("hex");

      const post = await storage.createSocialSyncPost({
        client_id: clientId,
        topic_id: topic_id || null,
        platform,
        post_text,
        caption: caption || null,
        hashtags: hashtags || null,
        media_plan: media_plan || null,
        status: "draft",
        duplicate_hash,
        scheduled_for: scheduled_for ? new Date(scheduled_for) : null,
        created_by_system: false,
      } as any);

      // Mark topic as used
      if (topic_id) {
        await storage.updateSocialSyncTopic(topic_id, { status: "used" });
      }

      await storage.createSocialSyncLog({
        client_id: clientId,
        entity_type: "post",
        entity_id: post.id,
        action: "post.created",
        status: "success",
        details: { topic_id, platform },
      });

      res.status(201).json(post);
    } catch (err: any) {
      console.error("[socialsync] Create post error:", err.message);
      res.status(500).json({ error: "Failed to create post" });
    }
  });

  // 6. GET posts
  app.get("/api/socialsync/clients/:clientId/posts", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const status = req.query.status as string | undefined;
      const platform = req.query.platform as string | undefined;
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

      const posts = await storage.listSocialSyncPosts(clientId, { status, platform, limit, offset });
      res.json(posts);
    } catch (err: any) {
      console.error("[socialsync] List posts error:", err.message);
      res.status(500).json({ error: "Failed to list posts" });
    }
  });

  // 7. POST enqueue post for publishing
  app.post("/api/socialsync/clients/:clientId/posts/:postId/enqueue", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const postId = parseInt(req.params.postId as string);
      if (isNaN(postId)) return res.status(400).json({ error: "Invalid post ID" });

      const post = await storage.getSocialSyncPostById(postId);
      if (!post || post.client_id !== clientId) return res.status(404).json({ error: "Post not found" });
      if (post.status !== "ready") return res.status(400).json({ error: `Post status must be "ready" to enqueue. Current: "${post.status}"` });

      const runAt = req.body.run_at ? new Date(req.body.run_at) : new Date();

      const queueItem = await storage.enqueueSocialSyncJob({
        client_id: clientId,
        post_id: postId,
        platform: post.platform,
        status: "pending",
        run_at: runAt,
        attempts: 0,
        max_attempts: 3,
      } as any);

      await storage.updateSocialSyncPost(postId, { status: "queued" } as any);

      await storage.createSocialSyncLog({
        client_id: clientId,
        entity_type: "queue",
        entity_id: queueItem.id,
        action: "queue.enqueued",
        status: "success",
        details: { post_id: postId, platform: post.platform, run_at: runAt.toISOString() },
      });

      res.status(201).json(queueItem);
    } catch (err: any) {
      console.error("[socialsync] Enqueue error:", err.message);
      res.status(500).json({ error: "Failed to enqueue post" });
    }
  });

  // 8. GET queue
  app.get("/api/socialsync/clients/:clientId/queue", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const queue = await storage.listSocialSyncQueue(clientId);
      res.json(queue);
    } catch (err: any) {
      console.error("[socialsync] List queue error:", err.message);
      res.status(500).json({ error: "Failed to list queue" });
    }
  });

  // 9. POST process due queue items (internal/manual trigger)
  app.post("/api/socialsync/internal/queue/process-due", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await processSocialSyncQueue();
      res.json(result);
    } catch (err: any) {
      console.error("[socialsync] Queue process error:", err.message);
      res.status(500).json({ error: "Failed to process queue" });
    }
  });

  // 10. GET activity logs
  app.get("/api/socialsync/clients/:clientId/activity", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const logs = await storage.listSocialSyncLogs(clientId, limit);
      res.json(logs);
    } catch (err: any) {
      console.error("[socialsync] List activity error:", err.message);
      res.status(500).json({ error: "Failed to list activity logs" });
    }
  });

  // ─── Phase 2B: AI Generation Endpoints ───

  // 11. POST generate a full week of content for a client
  app.post("/api/socialsync/clients/:clientId/generate-week", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const result = await generateWeekForClient(clientId);
      res.json(result);
    } catch (err: any) {
      console.error("[socialsync] Generate week error:", err.message);
      res.status(500).json({ error: "Failed to generate weekly content" });
    }
  });

  // 12. POST batch-generate for all due autopilot clients
  app.post("/api/socialsync/internal/generate-all-due", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await generateAllDue();
      res.json(result);
    } catch (err: any) {
      console.error("[socialsync] Generate all due error:", err.message);
      res.status(500).json({ error: "Failed to generate batch content" });
    }
  });

  // 13. POST regenerate a specific post
  app.post("/api/socialsync/posts/:postId/regenerate", requireAdmin, async (req: Request, res: Response) => {
    try {
      const postId = parseInt(req.params.postId as string);
      if (isNaN(postId)) return res.status(400).json({ error: "Invalid post ID" });

      const result = await regeneratePost(postId);
      if (result.error) return res.status(400).json({ error: result.error });
      if (result.rejected) return res.json({ rejected: true, reason: result.rejectionReason });

      res.status(201).json(result.post);
    } catch (err: any) {
      console.error("[socialsync] Regenerate post error:", err.message);
      res.status(500).json({ error: "Failed to regenerate post" });
    }
  });

  // 15. PATCH update topic status (reject/archive)
  app.patch("/api/socialsync/topics/:topicId/status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const topicId = parseInt(req.params.topicId as string);
      if (isNaN(topicId)) return res.status(400).json({ error: "Invalid topic ID" });

      const { status } = req.body;
      if (!status || !["active", "used", "archived", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be: active, used, archived, rejected" });
      }

      const topic = await storage.updateSocialSyncTopic(topicId, { status });
      if (!topic) return res.status(404).json({ error: "Topic not found" });

      await storage.createSocialSyncLog({
        client_id: topic.client_id,
        entity_type: "topic",
        entity_id: topic.id,
        action: `topic.${status}`,
        status: "success",
        details: { new_status: status },
      });

      res.json(topic);
    } catch (err: any) {
      console.error("[socialsync] Update topic status error:", err.message);
      res.status(500).json({ error: "Failed to update topic status" });
    }
  });

  // 16. PATCH update post status (ready/cancelled/rejected)
  app.patch("/api/socialsync/posts/:postId/status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const postId = parseInt(req.params.postId as string);
      if (isNaN(postId)) return res.status(400).json({ error: "Invalid post ID" });

      const { status } = req.body;
      if (!status || !["draft", "ready", "cancelled"].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be: draft, ready, cancelled" });
      }

      const post = await storage.updateSocialSyncPost(postId, { status } as any);
      if (!post) return res.status(404).json({ error: "Post not found" });

      await storage.createSocialSyncLog({
        client_id: post.client_id,
        entity_type: "post",
        entity_id: post.id,
        action: `post.${status}`,
        status: "success",
        details: { new_status: status },
      });

      res.json(post);
    } catch (err: any) {
      console.error("[socialsync] Update post status error:", err.message);
      res.status(500).json({ error: "Failed to update post status" });
    }
  });

  // 17. POST retry a failed queue item
  app.post("/api/socialsync/queue/:queueId/retry", requireAdmin, async (req: Request, res: Response) => {
    try {
      const queueId = parseInt(req.params.queueId as string);
      if (isNaN(queueId)) return res.status(400).json({ error: "Invalid queue ID" });

      await storage.updateSocialSyncQueueItem(queueId, {
        status: "pending",
        locked_at: null,
        last_error: null,
        updated_at: new Date(),
      });

      res.json({ ok: true });
    } catch (err: any) {
      console.error("[socialsync] Retry queue item error:", err.message);
      res.status(500).json({ error: "Failed to retry queue item" });
    }
  });

  // 18. GET summary/overview for a client's SocialSync state
  app.get("/api/socialsync/clients/:clientId/summary", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const [profile, topics, posts, queue, logs] = await Promise.all([
        storage.getSocialSyncProfile(clientId),
        storage.listSocialSyncTopics(clientId),
        storage.listSocialSyncPosts(clientId, { limit: 100 }),
        storage.listSocialSyncQueue(clientId),
        storage.listSocialSyncLogs(clientId, 10),
      ]);

      const activeTopics = topics.filter(t => t.status === "active").length;
      const draftPosts = posts.filter(p => p.status === "draft").length;
      const readyPosts = posts.filter(p => p.status === "ready").length;
      const queuedPosts = posts.filter(p => p.status === "queued").length;
      const publishedPosts = posts.filter(p => p.status === "published").length;
      const failedPosts = posts.filter(p => p.status === "failed").length;

      const pendingQueue = queue.filter(q => q.status === "pending").length;
      const failedQueue = queue.filter(q => q.status === "failed").length;
      const completedQueue = queue.filter(q => q.status === "completed").length;

      const nextScheduled = posts
        .filter(p => p.scheduled_for && ["queued", "ready"].includes(p.status))
        .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime())[0];

      const lastGeneration = logs.find(l => l.action === "week.generated" || l.action === "topics.seed_generated");

      res.json({
        profile: profile || null,
        stats: {
          active_topics: activeTopics,
          total_topics: topics.length,
          draft_posts: draftPosts,
          ready_posts: readyPosts,
          queued_posts: queuedPosts,
          published_posts: publishedPosts,
          failed_posts: failedPosts,
          pending_queue: pendingQueue,
          failed_queue: failedQueue,
          completed_queue: completedQueue,
        },
        next_scheduled: nextScheduled ? {
          id: nextScheduled.id,
          platform: nextScheduled.platform,
          scheduled_for: nextScheduled.scheduled_for,
        } : null,
        last_generation: lastGeneration ? {
          action: lastGeneration.action,
          created_at: lastGeneration.created_at,
          details: lastGeneration.details,
        } : null,
      });
    } catch (err: any) {
      console.error("[socialsync] Summary error:", err.message);
      res.status(500).json({ error: "Failed to load summary" });
    }
  });

  // 14. GET calendar feed (JSON) for a client's upcoming scheduled posts
  app.get("/api/socialsync/clients/:clientId/calendar-feed", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      // Get all posts that are queued, ready, or published with a scheduled_for date
      const allPosts = await storage.listSocialSyncPosts(clientId, { limit: 100 });
      const calendarItems = allPosts
        .filter(p => p.scheduled_for && ["ready", "queued", "published", "publishing"].includes(p.status))
        .map(p => ({
          id: p.id,
          platform: p.platform,
          status: p.status,
          scheduled_for: p.scheduled_for,
          published_at: p.published_at,
          post_text: p.post_text.slice(0, 120) + (p.post_text.length > 120 ? "..." : ""),
          caption: p.caption,
          hashtags: p.hashtags,
          topic_id: p.topic_id,
        }))
        .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime());

      res.json({
        client_id: clientId,
        count: calendarItems.length,
        items: calendarItems,
      });
    } catch (err: any) {
      console.error("[socialsync] Calendar feed error:", err.message);
      res.status(500).json({ error: "Failed to load calendar feed" });
    }
  });

  // ─── Phase 3A: Facebook OAuth & Connection Routes ───

  // 19. GET Facebook connect URL
  app.get("/api/socialsync/clients/:clientId/facebook/connect-url", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const configCheck = validateFacebookConfig();
      if (!configCheck.valid) {
        return res.status(503).json({
          error: "Facebook integration not configured",
          missing: configCheck.missing,
        });
      }

      const url = buildFacebookOAuthUrl(clientId);
      res.json({ url });
    } catch (err: any) {
      console.error("[socialsync] Facebook connect URL error:", err.message);
      res.status(500).json({ error: "Failed to generate Facebook connect URL" });
    }
  });

  // 20. GET Facebook OAuth callback (browser redirect — not JSON)
  app.get("/api/socialsync/oauth/facebook/callback", async (req: Request, res: Response) => {
    try {
      const { code, state, error: oauthError, error_description } = req.query;

      if (oauthError) {
        console.error("[socialsync] Facebook OAuth denied:", oauthError, error_description);
        return res.redirect(`/admin/crm/clients?fb_error=${encodeURIComponent(String(error_description || oauthError))}`);
      }

      if (!code || typeof code !== "string") {
        return res.redirect("/admin/crm/clients?fb_error=missing_code");
      }

      // Decode state to get clientId
      let clientId: number;
      try {
        const decoded = JSON.parse(Buffer.from(String(state), "base64url").toString());
        clientId = decoded.clientId;
        if (!clientId || typeof clientId !== "number") throw new Error("Invalid clientId in state");
      } catch {
        return res.redirect("/admin/crm/clients?fb_error=invalid_state");
      }

      const result = await handleFacebookCallback(clientId, code);

      // Redirect back to the client's SocialSync tab
      res.redirect(`/admin/crm/clients/${clientId}?tab=socialsync&fb_connected=1&pages=${result.pages.length}`);
    } catch (err: any) {
      console.error("[socialsync] Facebook callback error:", err.message);
      res.redirect(`/admin/crm/clients?fb_error=${encodeURIComponent(err.message)}`);
    }
  });

  // 21. GET discovered Facebook pages for a client
  app.get("/api/socialsync/clients/:clientId/facebook/pages", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const connections = await storage.listSocialSyncConnections(clientId);
      const fbConn = connections.find(c => c.platform === "facebook");

      if (!fbConn || !fbConn.token_ref) {
        return res.status(404).json({ error: "No Facebook connection found. Connect Facebook first." });
      }

      if (fbConn.connection_status !== "connected") {
        return res.status(400).json({ error: `Connection status is "${fbConn.connection_status}". Reconnect required.` });
      }

      // Return pages from stored metadata (from discovery during auth)
      const metadata = (fbConn.metadata as any) || {};
      const discoveredPages = metadata.pages_discovered || [];

      // Also include currently selected page info
      const selectedPage = metadata.selected_page || null;

      res.json({
        pages: discoveredPages,
        selected_page: selectedPage,
        external_page_id: fbConn.external_page_id,
      });
    } catch (err: any) {
      console.error("[socialsync] Facebook pages error:", err.message);
      res.status(500).json({ error: "Failed to load Facebook pages" });
    }
  });

  // 22. POST select a Facebook page as publishing target
  app.post("/api/socialsync/clients/:clientId/facebook/select-page", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const { page_id } = req.body;
      if (!page_id || typeof page_id !== "string") {
        return res.status(400).json({ error: "page_id is required" });
      }

      await selectFacebookPage(clientId, page_id);
      res.json({ ok: true, page_id });
    } catch (err: any) {
      console.error("[socialsync] Facebook select page error:", err.message);
      res.status(500).json({ error: err.message || "Failed to select Facebook page" });
    }
  });

  // 23. POST validate Facebook connection
  app.post("/api/socialsync/clients/:clientId/facebook/validate", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const result = await validateFacebookConnection(clientId);
      res.json(result);
    } catch (err: any) {
      console.error("[socialsync] Facebook validate error:", err.message);
      res.status(500).json({ error: "Failed to validate Facebook connection" });
    }
  });

  // 24. GET Facebook connection status (safe: no tokens exposed)
  app.get("/api/socialsync/clients/:clientId/facebook/status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const connections = await storage.listSocialSyncConnections(clientId);
      const fbConn = connections.find(c => c.platform === "facebook");

      if (!fbConn) {
        return res.json({ connected: false, status: "not_connected" });
      }

      const metadata = (fbConn.metadata as any) || {};

      res.json({
        connected: fbConn.connection_status === "connected",
        status: fbConn.connection_status,
        external_account_id: fbConn.external_account_id,
        external_page_id: fbConn.external_page_id,
        user_name: metadata.user_name || null,
        selected_page: metadata.selected_page || null,
        pages_count: (metadata.pages_discovered || []).length,
        token_expires_at: fbConn.token_expires_at,
        last_validated_at: fbConn.last_validated_at,
        last_error: metadata.last_error || null,
      });
    } catch (err: any) {
      console.error("[socialsync] Facebook status error:", err.message);
      res.status(500).json({ error: "Failed to load Facebook status" });
    }
  });

  // ─── Phase 3B: Instagram Connection Routes ───

  // 25. GET discovered Instagram business accounts
  app.get("/api/socialsync/clients/:clientId/instagram/accounts", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const result = await discoverInstagramAccounts(clientId);
      if (result.error && result.accounts.length === 0) {
        return res.status(400).json({ error: result.error, accounts: [] });
      }

      // Also get current IG connection if any
      const connections = await storage.listSocialSyncConnections(clientId);
      const igConn = connections.find(c => c.platform === "instagram");

      res.json({
        accounts: result.accounts.map(a => ({
          id: a.id,
          username: a.username,
          name: a.name,
          profile_picture_url: a.profile_picture_url,
          followers_count: a.followers_count,
          facebook_page_id: a.facebook_page_id,
          facebook_page_name: a.facebook_page_name,
        })),
        selected_account_id: igConn?.external_account_id || null,
        connection_status: igConn?.connection_status || "not_connected",
      });
    } catch (err: any) {
      console.error("[socialsync] Instagram accounts error:", err.message);
      res.status(500).json({ error: "Failed to load Instagram accounts" });
    }
  });

  // 26. POST select an Instagram business account
  app.post("/api/socialsync/clients/:clientId/instagram/select-account", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const { account_id } = req.body;
      if (!account_id || typeof account_id !== "string") {
        return res.status(400).json({ error: "account_id is required" });
      }

      await selectInstagramAccount(clientId, account_id);
      res.json({ ok: true, account_id });
    } catch (err: any) {
      console.error("[socialsync] Instagram select account error:", err.message);
      res.status(500).json({ error: err.message || "Failed to select Instagram account" });
    }
  });

  // 27. POST validate Instagram connection
  app.post("/api/socialsync/clients/:clientId/instagram/validate", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const result = await validateInstagramConnection(clientId);
      res.json(result);
    } catch (err: any) {
      console.error("[socialsync] Instagram validate error:", err.message);
      res.status(500).json({ error: "Failed to validate Instagram connection" });
    }
  });

  // 28. GET Instagram connection status (safe: no tokens)
  app.get("/api/socialsync/clients/:clientId/instagram/status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const connections = await storage.listSocialSyncConnections(clientId);
      const igConn = connections.find(c => c.platform === "instagram");

      if (!igConn) {
        return res.json({ connected: false, status: "not_connected" });
      }

      const metadata = (igConn.metadata as any) || {};

      res.json({
        connected: igConn.connection_status === "connected",
        status: igConn.connection_status,
        account_id: igConn.external_account_id,
        username: metadata.username || null,
        name: metadata.name || null,
        profile_picture_url: metadata.profile_picture_url || null,
        followers_count: metadata.followers_count ?? null,
        facebook_page_id: igConn.external_page_id,
        facebook_page_name: metadata.facebook_page_name || null,
        token_expires_at: igConn.token_expires_at,
        last_validated_at: igConn.last_validated_at,
        last_error: metadata.last_error || null,
      });
    } catch (err: any) {
      console.error("[socialsync] Instagram status error:", err.message);
      res.status(500).json({ error: "Failed to load Instagram status" });
    }
  });

  // ─── Phase 3F: Connection Lifecycle Routes ───

  // 29. POST disconnect Facebook
  app.post("/api/socialsync/clients/:clientId/facebook/disconnect", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const result = await disconnectPlatform(clientId, "facebook");
      if (!result.ok) return res.status(400).json({ error: result.error });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[socialsync] Facebook disconnect error:", err.message);
      res.status(500).json({ error: "Failed to disconnect Facebook" });
    }
  });

  // 30. POST disconnect Instagram
  app.post("/api/socialsync/clients/:clientId/instagram/disconnect", requireAdmin, async (req: Request, res: Response) => {
    try {
      const clientId = parseInt(req.params.clientId as string);
      if (isNaN(clientId)) return res.status(400).json({ error: "Invalid client ID" });

      const result = await disconnectPlatform(clientId, "instagram");
      if (!result.ok) return res.status(400).json({ error: result.error });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[socialsync] Instagram disconnect error:", err.message);
      res.status(500).json({ error: "Failed to disconnect Instagram" });
    }
  });

  // 31. POST manually trigger connection expiry check
  app.post("/api/socialsync/internal/check-connection-expiry", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await checkConnectionExpiry();
      res.json(result);
    } catch (err: any) {
      console.error("[socialsync] Expiry check error:", err.message);
      res.status(500).json({ error: "Failed to check connection expiry" });
    }
  });

  // ─── Phase 4A: Media Pipeline Routes ───

  // 32. POST prepare media for a post (generate/resolve image)
  app.post("/api/socialsync/posts/:postId/prepare-media", requireAdmin, async (req: Request, res: Response) => {
    try {
      const postId = parseInt(req.params.postId as string);
      if (isNaN(postId)) return res.status(400).json({ error: "Invalid post ID" });

      const post = await storage.getSocialSyncPostById(postId);
      if (!post) return res.status(404).json({ error: "Post not found" });

      const result = await resolveMediaForPost(post);

      if (result.resolved) {
        await storage.createSocialSyncLog({
          client_id: post.client_id,
          entity_type: "post",
          entity_id: post.id,
          action: "media.resolved",
          status: "success",
          details: { source: result.source, public_url: result.public_url },
        });
      }

      res.json({
        resolved: result.resolved,
        public_url: result.public_url,
        source: result.source,
        error: result.error || null,
      });
    } catch (err: any) {
      console.error("[socialsync] Prepare media error:", err.message);
      res.status(500).json({ error: "Failed to prepare media" });
    }
  });

  // ─── Phase 4C: Operations Dashboard Endpoint ───

  // 33. GET cross-client operations overview
  app.get("/api/socialsync/ops/overview", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const profiles = await storage.listEnabledSocialSyncProfiles();
      const allConnections = await storage.listAllSocialSyncConnections();

      // Get all profiles (including disabled) for total count
      const allProfiles: any[] = [];
      for (const p of profiles) {
        allProfiles.push(p);
      }

      // Build per-client summaries
      const clientSummaries: any[] = [];
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;

      let totalFbConnected = 0;
      let totalIgConnected = 0;
      let totalExpired = 0;
      let totalExpiringSoon = 0;
      let totalQueueFailed = 0;
      let totalPublished24h = 0;
      let totalPublished7d = 0;
      let totalQueuedDueToday = 0;
      let clientsAtRisk = 0;

      for (const profile of profiles) {
        const clientId = profile.client_id;
        const connections = await storage.listSocialSyncConnections(clientId);
        const posts = await storage.listSocialSyncPosts(clientId, { limit: 50 });
        const queue = await storage.listSocialSyncQueue(clientId);

        const fbConn = connections.find(c => c.platform === "facebook");
        const igConn = connections.find(c => c.platform === "instagram");

        const fbConnected = fbConn?.connection_status === "connected" || fbConn?.connection_status === "expiring_soon";
        const igConnected = igConn?.connection_status === "connected" || igConn?.connection_status === "expiring_soon";

        if (fbConnected) totalFbConnected++;
        if (igConnected) totalIgConnected++;

        const hasExpired = connections.some(c => c.connection_status === "expired");
        const hasExpiringSoon = connections.some(c => c.connection_status === "expiring_soon");
        if (hasExpired) totalExpired++;
        if (hasExpiringSoon) totalExpiringSoon++;

        const failedQueue = queue.filter(q => q.status === "failed").length;
        totalQueueFailed += failedQueue;

        const published24h = posts.filter(p => p.published_at && (now - new Date(p.published_at).getTime()) < day).length;
        const published7d = posts.filter(p => p.published_at && (now - new Date(p.published_at).getTime()) < 7 * day).length;
        totalPublished24h += published24h;
        totalPublished7d += published7d;

        const queuedDueToday = queue.filter(q => q.status === "pending" && new Date(q.run_at).getTime() < now + day).length;
        totalQueuedDueToday += queuedDueToday;

        const upcomingPosts = posts.filter(p => p.scheduled_for && ["queued", "ready"].includes(p.status)).length;

        // Risk assessment
        const isAtRisk = hasExpired || failedQueue > 0 || (upcomingPosts === 0 && profile.autopilot);
        if (isAtRisk) clientsAtRisk++;

        const riskReasons: string[] = [];
        if (hasExpired) riskReasons.push("expired_token");
        if (hasExpiringSoon) riskReasons.push("expiring_soon");
        if (failedQueue > 0) riskReasons.push(`${failedQueue}_queue_failures`);
        if (upcomingPosts === 0 && profile.autopilot) riskReasons.push("no_upcoming_posts");
        if (!fbConnected && !igConnected) riskReasons.push("no_connections");

        clientSummaries.push({
          client_id: clientId,
          enabled: profile.enabled,
          autopilot: profile.autopilot,
          niche: profile.niche,
          location: profile.location,
          fb_status: fbConn?.connection_status || "not_connected",
          ig_status: igConn?.connection_status || "not_connected",
          upcoming_posts: upcomingPosts,
          published_7d: published7d,
          failed_queue: failedQueue,
          at_risk: isAtRisk,
          risk_reasons: riskReasons,
        });
      }

      res.json({
        metrics: {
          total_enabled: profiles.length,
          total_autopilot: profiles.filter(p => p.autopilot).length,
          fb_connected: totalFbConnected,
          ig_connected: totalIgConnected,
          expired_tokens: totalExpired,
          expiring_soon: totalExpiringSoon,
          queued_due_today: totalQueuedDueToday,
          queue_failures: totalQueueFailed,
          published_24h: totalPublished24h,
          published_7d: totalPublished7d,
          clients_at_risk: clientsAtRisk,
        },
        clients: clientSummaries.sort((a, b) => {
          // At-risk first, then by published_7d descending
          if (a.at_risk !== b.at_risk) return a.at_risk ? -1 : 1;
          return b.published_7d - a.published_7d;
        }),
      });
    } catch (err: any) {
      console.error("[socialsync] Ops overview error:", err.message);
      res.status(500).json({ error: "Failed to load operations overview" });
    }
  });
}
