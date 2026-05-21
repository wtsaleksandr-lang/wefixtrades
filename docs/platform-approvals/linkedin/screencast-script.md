# LinkedIn Marketing Developer Platform — Screencast Script

Target length: 90 seconds. 1920x1080 MP4.

## Storyboard + Voiceover

```
00:00–00:05  [Opening: WFT logo + "SocialSync — LinkedIn"]
             VO: "Hi, I'm Alex from WeFixTrades. SocialSync is our
                  managed social posting service for small trades
                  businesses. This demo shows our LinkedIn integration."

00:05–00:25  [Cut to portal Connections tab. Click "Connect LinkedIn".
              LinkedIn OAuth consent screen with scopes — hold for 5+
              seconds. Approve.]
             VO: "Dave runs Apex Roofing. He clicks Connect LinkedIn.
                  The LinkedIn consent screen lists each requested
                  scope — read profile, read organizations he admins,
                  and post on behalf of those organizations. He
                  approves."

00:25–00:40  [Show company-page picker. Dave sees 'Apex Roofing'
              listed under organizations he administers; he selects it.]
             VO: "He picks Apex Roofing as the target company page.
                  All future SocialSync posts will land there."

00:40–01:00  [Cut to SocialSync content calendar. A queued post:
              'Just finished a 4,200 sq ft commercial reroof in
              Burlington. Three days from tear-off to membrane
              complete. Calling all developers and property managers —
              we have crews available in May. DM us.' with a photo.
              Click 'Approve and Post'.]
             VO: "Our AI has drafted a post highlighting a recent
                  commercial reroof. Dave reads it, edits one word,
                  hits Approve and Post."

01:00–01:20  [Cut to actual LinkedIn page in a new tab showing the
              live post under Apex Roofing's company page with
              timestamp.]
             VO: "Backend POSTs to /v2/ugcPosts using the organization
                  URN as the author. The post is live on Apex Roofing's
                  page within seconds."

01:20–01:30  [Closing privacy frame.]
             VO: "Tokens are encrypted at rest. Dave can disconnect
                  from WFT or from LinkedIn's app permissions page
                  any time. Thanks for reviewing."
```

## Production Notes

- Show the OAuth consent screen long enough to read every scope.
- Use a real LinkedIn Company Page test environment. `[TODO: Alex creates "WeFixTrades Demo Roofing" Company Page for the demo]`
- Filename: `wefixtrades-socialsync-linkedin-review.mp4`.
