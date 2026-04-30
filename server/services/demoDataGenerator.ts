/**
 * Demo data generator — seeds a client with realistic-looking
 * SocialSync + ReputationShield data for sales demos.
 *
 * Creates:
 * - SocialSync profile (enabled, autopilot)
 * - 8 posts (mixed platforms, mixed statuses)
 * - 4 reviews (varied ratings)
 * - 3 review replies
 * - 3 review requests (sent, with attribution)
 *
 * Trigger: POST /api/admin/demo/seed/:clientId
 * Reset:   POST /api/admin/demo/reset/:clientId
 */
import { storage } from "../storage";
import crypto from "crypto";

const DEMO_POSTS = [
  { platform: "facebook", text: "Spring is here and that means it's time to check your plumbing! Frozen pipes from winter can cause hidden leaks. Call us for a free inspection before small problems become expensive ones.", caption: "Spring plumbing check — don't let winter damage surprise you.", hashtags: ["plumbing", "springmaintenance", "homerepair"], status: "published", daysAgo: 2 },
  { platform: "instagram", text: "Before & after: This kitchen sink was backed up for weeks. 2 hours of work and it's flowing like new. That's what we do. 💪", caption: "Kitchen sink rescue — backed up to brand new in 2 hours.", hashtags: ["beforeandafter", "plumber", "kitchenreno", "drainclean"], status: "published", daysAgo: 4 },
  { platform: "google_business", text: "Did you know? A dripping faucet can waste over 3,000 gallons of water per year. If you hear that drip, give us a call — we'll fix it fast and save you money on your water bill.", caption: "Fix that drip — save water and money.", hashtags: [], status: "published", daysAgo: 7 },
  { platform: "facebook", text: "Thank you to the Johnson family in Lakewood for trusting us with their water heater replacement! New tankless unit installed and running perfectly. Another happy customer. 🙏", caption: "New tankless water heater in Lakewood — another happy customer.", hashtags: ["waterheater", "tankless", "lakewood"], status: "published", daysAgo: 10 },
  { platform: "instagram", text: "Pro tip: Know where your main water shutoff valve is BEFORE an emergency. It could save you thousands in water damage. Usually near the front of your house or in the basement.", caption: "Know your shutoff valve — it could save you thousands.", hashtags: ["plumbingtips", "homeowner", "emergencyprep"], status: "published", daysAgo: 14 },
  { platform: "facebook", text: "We're now booking appointments for next week. Whether it's a leaky faucet, clogged drain, or full bathroom remodel — we've got you covered. Call or text to schedule.", caption: "Booking next week — call or text to schedule.", hashtags: ["plumber", "booking"], status: "queued", daysAgo: -2 },
  { platform: "instagram", text: "Behind the scenes: Early morning service call. Burst pipe in the crawl space — not fun, but that's why we're here. Fixed and tested before breakfast. ☀️", caption: "Early morning burst pipe fix — done before breakfast.", hashtags: ["behindthescenes", "plumberlife", "emergencyrepair"], status: "queued", daysAgo: -4 },
  { platform: "google_business", text: "Reminder: If your water heater is over 10 years old, it's time to start thinking about replacement. We offer free estimates and can usually install same-week.", caption: "Water heater over 10 years? Time for an upgrade.", hashtags: [], status: "ready", daysAgo: -1 },
];

const DEMO_REVIEWS = [
  { name: "Mike Johnson", stars: 5, text: "Absolutely fantastic service! They came out same day when our kitchen sink was completely backed up. Professional, fast, and reasonably priced. Will definitely use again.", daysAgo: 3, replied: true, reply: "Thank you so much, Mike! We're glad we could get your kitchen sink flowing again quickly. Don't hesitate to call us anytime you need help." },
  { name: "Sarah Chen", stars: 5, text: "Great experience from start to finish. They replaced our old water heater with a tankless unit. Clean work, on time, and they even cleaned up after themselves.", daysAgo: 8, replied: true, reply: "We appreciate the kind words, Sarah! Enjoy the endless hot water from your new tankless unit. Thanks for choosing us!" },
  { name: "Tom Williams", stars: 4, text: "Good work on the bathroom faucet replacement. Price was fair. Only reason for 4 stars is the scheduling took a couple extra days, but the work itself was excellent.", daysAgo: 15, replied: true, reply: "Thanks for the feedback, Tom! We're working on improving our scheduling to get to customers even faster. Glad the work met your expectations." },
  { name: "Jennifer L.", stars: 2, text: "Had to call back twice because the leak came back after the first visit. Eventually got it fixed but was frustrating to deal with.", daysAgo: 20, replied: false, reply: null },
];

const DEMO_REQUESTS = [
  { name: "Mike Johnson", phone: "+15551234001", channel: "sms", status: "sent", daysAgo: 5 },
  { name: "Sarah Chen", email: "sarah@example.com", channel: "email", status: "sent", daysAgo: 10 },
  { name: "David Park", phone: "+15551234003", channel: "sms", status: "sent", daysAgo: 12 },
];

function daysAgoDate(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function seedDemoData(clientId: number): Promise<{ posts: number; reviews: number; requests: number }> {
  // 1. Ensure SocialSync profile
  await storage.upsertSocialSyncProfile({
    client_id: clientId,
    enabled: true,
    niche: "plumbing",
    location: "Denver, CO",
    services: ["Drain cleaning", "Water heater repair", "Pipe replacement", "Faucet installation", "Emergency plumbing"],
    service_focus: ["Emergency plumbing", "Water heater repair"],
    tone: "professional",
    frequency: "3_per_week",
    autopilot: true,
    platform_preferences: ["facebook", "instagram", "google_business"],
  } as any);

  // 2. Create posts
  for (const p of DEMO_POSTS) {
    const hash = crypto.createHash("sha256").update(p.text.trim().toLowerCase()).digest("hex");
    await storage.createSocialSyncPost({
      client_id: clientId,
      topic_id: null,
      platform: p.platform,
      post_text: p.text,
      caption: p.caption,
      hashtags: p.hashtags.length > 0 ? p.hashtags : null,
      media_plan: null,
      status: p.status,
      quality_score: 75 + Math.floor(Math.random() * 20),
      duplicate_hash: hash,
      scheduled_for: p.daysAgo < 0 ? daysAgoDate(p.daysAgo) : null,
      published_at: p.status === "published" ? daysAgoDate(p.daysAgo) : null,
      created_by_system: true,
    } as any);
  }

  // 3. Create reviews
  for (const r of DEMO_REVIEWS) {
    const review = await storage.upsertReview({
      client_id: clientId,
      platform: "google_business",
      external_review_id: `demo-${clientId}-${r.name.replace(/\s/g, "-").toLowerCase()}`,
      reviewer_name: r.name,
      star_rating: r.stars,
      review_text: r.text,
      review_time: daysAgoDate(r.daysAgo),
      sentiment: r.stars >= 4 ? "positive" : r.stars === 3 ? "neutral" : "negative",
      needs_reply: !r.replied,
      eligible_for_auto_reply: r.stars >= 4,
      requires_human_attention: r.stars <= 2,
      has_existing_owner_reply: r.replied,
      escalation_flag: false,
      reply_status: r.replied ? "auto_replied" : (r.stars <= 2 ? "draft_ready" : "pending"),
      reply_text: r.reply,
      reply_posted_at: r.replied ? daysAgoDate(r.daysAgo - 1) : null,
      reply_result: r.replied ? { status: 200 } : null,
      metadata: { demo: true },
    } as any);
  }

  // 4. Create review requests
  for (const rr of DEMO_REQUESTS) {
    await storage.createReviewRequest({
      client_id: clientId,
      source_type: "booking",
      source_id: null as any,
      customer_name: rr.name,
      customer_phone: rr.phone || null,
      customer_email: rr.email || null,
      channel: rr.channel,
      status: rr.status,
      review_link: "https://g.page/r/demo/review",
      message_text: `Hi ${rr.name.split(" ")[0]}! Thanks for choosing us. A quick Google review would mean a lot: https://g.page/r/demo/review`,
      run_at: daysAgoDate(rr.daysAgo),
      sent_at: daysAgoDate(rr.daysAgo),
      dedup_key: `demo-${clientId}-${rr.name.replace(/\s/g, "-").toLowerCase()}`,
      attempts: 1,
      max_attempts: 2,
    } as any);
  }

  // 5. Mark client as demo
  await storage.updateClient(clientId, { demo_mode: true } as any);

  return { posts: DEMO_POSTS.length, reviews: DEMO_REVIEWS.length, requests: DEMO_REQUESTS.length };
}

export async function resetDemoData(clientId: number): Promise<void> {
  // This is a simplified reset — in production you'd want cascade deletes
  // For now, just mark the client as non-demo
  await storage.updateClient(clientId, { demo_mode: false } as any);
}
