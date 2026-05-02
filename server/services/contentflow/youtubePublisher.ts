/**
 * ContentFlow Sprint 18 -- YouTube video upload publisher.
 *
 * Uses googleapis (already installed) with YouTube Data API v3 to
 * upload videos and set thumbnails. Auth uses existing Google OAuth
 * credentials stored per-client.
 *
 * Video generation failure must NEVER block article/social publishing.
 * Every code path is wrapped in try/catch and returns null on failure.
 */

import { google } from "googleapis";
import { Readable } from "stream";
import { createLogger } from "../../lib/logger";

const log = createLogger("YouTubePublisher");

/* ─── Types ───────────────────────────────────────────────────────── */

export interface GoogleCredentials {
  access_token: string;
  refresh_token?: string;
  client_id?: string;
  client_secret?: string;
}

export interface YouTubeUploadOpts {
  videoUrl: string;
  title: string;
  description: string;
  tags: string[];
  thumbnailUrl?: string;
  privacyStatus?: "public" | "unlisted" | "private";
  scheduledPublishAt?: string; // ISO datetime
  credentials: GoogleCredentials;
}

export interface YouTubeUploadResult {
  youtubeVideoId: string;
  youtubeUrl: string;
}

/* ─── Auth helper ─────────────────────────────────────────────────── */

function buildOAuth2Client(creds: GoogleCredentials) {
  const clientId = creds.client_id || process.env.GOOGLE_BUSINESS_CLIENT_ID;
  const clientSecret = creds.client_secret || process.env.GOOGLE_BUSINESS_CLIENT_SECRET;

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({
    access_token: creds.access_token,
    refresh_token: creds.refresh_token,
  });
  return auth;
}

/* ─── Download video to buffer ────────────────────────────────────── */

async function downloadVideo(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download video: HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/* ─── Public entry point ──────────────────────────────────────────── */

/**
 * Upload a video to YouTube and optionally set a custom thumbnail.
 * Returns the YouTube video ID and URL, or null on any failure.
 * NEVER throws.
 */
export async function uploadToYouTube(
  opts: YouTubeUploadOpts,
): Promise<YouTubeUploadResult | null> {
  const t0 = Date.now();

  try {
    // Download the video to a buffer
    log.info(`Downloading video from: ${opts.videoUrl.slice(0, 80)}...`);
    const videoBuffer = await downloadVideo(opts.videoUrl);
    log.info(`Video downloaded: ${videoBuffer.length} bytes`);

    // Set up YouTube client
    const auth = buildOAuth2Client(opts.credentials);
    const youtube = google.youtube({ version: "v3", auth });

    // Determine status
    const status: Record<string, any> = {
      privacyStatus: opts.privacyStatus || "unlisted",
    };
    if (opts.scheduledPublishAt) {
      status.publishAt = opts.scheduledPublishAt;
      // Scheduled videos must be "private" until publish time
      status.privacyStatus = "private";
    }

    // Upload video
    log.info(`Uploading to YouTube: title="${opts.title.slice(0, 60)}" privacy=${status.privacyStatus}`);
    const uploadRes = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: opts.title.slice(0, 100),
          description: opts.description.slice(0, 5000),
          tags: opts.tags.slice(0, 30),
          categoryId: "26", // Howto & Style
        },
        status,
      },
      media: {
        body: Readable.from(videoBuffer),
      },
    });

    const videoId = uploadRes.data.id;
    if (!videoId) {
      log.error("YouTube upload returned no video ID");
      return null;
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    log.info(`YouTube upload succeeded: videoId=${videoId} duration_ms=${Date.now() - t0}`);

    // Set thumbnail if provided (best-effort)
    if (opts.thumbnailUrl) {
      try {
        log.info(`Setting YouTube thumbnail for videoId=${videoId}`);
        const thumbBuffer = await downloadVideo(opts.thumbnailUrl);
        await youtube.thumbnails.set({
          videoId,
          media: {
            mimeType: "image/png",
            body: Readable.from(thumbBuffer),
          },
        });
        log.info(`YouTube thumbnail set for videoId=${videoId}`);
      } catch (thumbErr: any) {
        // Thumbnail failure should never block the upload result
        log.warn(`YouTube thumbnail failed for videoId=${videoId}: ${thumbErr?.message || thumbErr}`);
      }
    }

    return { youtubeVideoId: videoId, youtubeUrl };
  } catch (err: any) {
    log.error(`YouTube upload failed: ${err?.message || err}`);
    return null;
  }
}
