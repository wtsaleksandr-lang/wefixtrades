# Meta App Review — Screencast Script (SocialSync)

Target length: 75 seconds. Resolution: 1920x1080. Format: MP4 with clear voiceover. Use mouse highlights so reviewer can follow clicks.

## Storyboard + Voiceover

```
00:00–00:05  [Opening shot: WeFixTrades wordmark + "SocialSync" product card]
             VO: "Hi, I'm Alex from WeFixTrades. We help small trades
                  businesses — plumbers, electricians, HVAC — stay
                  visible online without doing the posting themselves."

00:05–00:15  [Cut to admin dashboard /admin/clients showing a sample
              client "Mike's Plumbing"]
             VO: "Mike runs a two-person plumbing shop. He hasn't posted
                  on Facebook in eight months. SocialSync is going to
                  fix that — without him touching anything."

00:15–00:30  [Click into the client's portal → SocialSync tab →
              "Connect Facebook" button. Show the Meta OAuth consent
              screen with the requested permissions visible.]
             VO: "Mike clicks Connect Facebook. He sees the standard
                  Meta consent screen listing the exact permissions —
                  read pages, manage posts, Instagram publish. He
                  picks his page, Mike's Plumbing, and confirms."

00:30–00:50  [Return to SocialSync dashboard. Show the weekly content
              calendar with three drafted posts: a "spring boiler check"
              tip, a "we're hiring" notice, and a before/after photo.
              Highlight the "Approve" button on one of them.]
             VO: "Our backend generates one weekly post tuned to his
                  trade and service area. He can preview every post,
                  edit, or just let autopilot ship it. Today he hits
                  Approve on the spring boiler tip."

00:50–01:05  [Cut to the actual Facebook page in a new browser tab —
              show the published post live on the page with a timestamp.
              Then switch to the Instagram profile showing the same
              content posted to the linked IG Business account.]
             VO: "Two seconds later, the post is live on Facebook — and
                  because Mike's IG Business account is linked to that
                  page, it's also live on Instagram. He didn't write
                  a word."

01:05–01:15  [Closing shot: privacy commitment panel — WeFixTrades
              logo, "Tokens encrypted at rest, revocable anytime."]
             VO: "Mike's tokens are encrypted at rest with AES-256.
                  He can disconnect from his portal — or from his
                  Facebook business settings — at any time. Thanks
                  for reviewing our app."
```

## Production Notes

- Record at 1080p, 30fps. Final file under 100MB.
- Show the Meta OAuth consent screen fully — reviewers explicitly look for this.
- Show the WeFixTrades brand chrome (logo top-left) on every frame so it's clear which app is being demoed.
- Use a real test page (`[TODO: Alex creates a "WeFixTrades Demo Plumbing" Facebook Page for the demo]`), not a screenshot.
- Caption track: bake in lower-third captions ("Connecting Facebook…", "Approving post…", "Posted live").
- Avoid showing any real customer data — use the demo tenant.

## Filename

`wefixtrades-socialsync-meta-review.mp4` — store final in `docs/platform-approvals/meta/` (or attach directly in Meta dashboard; do not commit the binary).
