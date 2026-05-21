# YouTube Data API v3 — Verification Screencast Script

Target length: 90 seconds. Format: MP4 1920x1080.

Google's verification reviewers require a screencast that **clearly shows the OAuth consent screen** with every requested scope visible, plus the end-to-end use of each scope in the app.

## Storyboard + Voiceover

```
00:00–00:05  [Opening: WeFixTrades wordmark + "SocialSync — YouTube"]
             VO: "Hi, I'm Alex from WeFixTrades. SocialSync is our
                  managed social posting service for small trades
                  businesses. This demo shows our YouTube integration."

00:05–00:20  [Cut to portal /portal/socialsync/connections. Click
              "Connect YouTube". The Google OAuth consent screen
              appears showing the requested scopes — pause for 5+
              seconds so all scopes are visible and readable.]
             VO: "Mike, a plumber, connects his business YouTube
                  channel. The Google consent screen lists the exact
                  scopes — YouTube upload and YouTube read-only — and
                  the privacy policy and terms links. He approves."

00:20–00:35  [Back in WFT portal: connection card now shows the
              connected channel name and avatar. Click into the
              SocialSync content calendar.]
             VO: "Back in his portal, Mike sees his channel is
                  connected. The content calendar shows a queued
                  video clip about replacing a leaking shutoff valve
                  that our AI produced from photos he uploaded."

00:35–00:55  [Click "Approve & Upload to YouTube". Show the upload
              progress indicator, then the success state with the
              YouTube video URL.]
             VO: "Mike clicks Approve and Upload. Our backend uses
                  youtube.videos.insert to upload the video as
                  unlisted by default, then youtube.thumbnails.set
                  to set the custom thumbnail."

00:55–01:15  [Cut to actual YouTube Studio in a new browser tab
              showing the uploaded video in the library, with
              thumbnail and metadata.]
             VO: "The video lands in his YouTube Studio with the
                  correct title, description, tags, and custom
                  thumbnail — all sent through the API."

01:15–01:30  [Closing: privacy + disconnect frame showing the
              "Disconnect YouTube" button.]
             VO: "Mike's refresh token is encrypted at rest. He can
                  disconnect from his portal or revoke from his
                  Google account permissions at any time. Thanks for
                  reviewing."
```

## Production Notes

- Google reviewers reject videos where the consent screen flashes for under 3 seconds. Pause and zoom on it.
- Use a real Google account on a sandbox YouTube channel — `[TODO: Alex creates a "WeFixTrades Demo" YouTube channel for the screencast]`.
- Filename: `wefixtrades-socialsync-youtube-review.mp4`. Final under 100MB.
- Upload to YouTube as **Unlisted** and include the URL in the verification submission form.
