import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import { processSocialSyncQueue } from "../jobs/socialSyncWorker";
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
}
