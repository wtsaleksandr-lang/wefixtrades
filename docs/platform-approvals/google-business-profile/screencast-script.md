# Google Business Profile API — Verification Screencast Script

Target length: 90 seconds. 1920x1080 MP4.

## Storyboard + Voiceover

```
00:00–00:05  [Opening: WFT logo + "MapGuard — Google Business Profile"]
             VO: "Hi, I'm Alex from WeFixTrades. We help small trades
                  businesses manage their Google Business Profile.
                  This demo shows our GBP integration."

00:05–00:25  [Cut to admin dashboard. Click into a sample client,
              then 'MapGuard' tab, then 'Connect Google Business
              Profile'. The Google OAuth consent screen appears
              showing the requested scope — `business.manage`. Hold
              for 5+ seconds.]
             VO: "Mike runs a plumbing shop. He clicks Connect Google
                  Business Profile. The Google consent screen lists
                  the business.manage scope, the privacy policy link,
                  and the terms. He approves."

00:25–00:40  [Show account/location picker. Mike picks his
              'Mike's Plumbing — Vancouver BC' location.]
             VO: "He picks his Vancouver location from the list of
                  GBPs he manages. From here, MapGuard takes over."

00:40–01:00  [Cut to MapGuard dashboard. Show the profile health
              audit: 'Hours up to date — yes', 'Categories optimized —
              recommend adding 2', 'Photos — last upload 47 days ago'.
              Click 'Apply recommendations' on the categories suggestion.]
             VO: "MapGuard runs a profile health audit using the
                  Business Information API. Mike approves a categories
                  recommendation; we PATCH the profile through the API."

01:00–01:15  [Cut to SocialSync tab. Show a queued Google Post: 'Spring
              tune-up special — book by May 15 for 10% off'. Click
              'Approve and Publish'.]
             VO: "SocialSync queues a Google Post. Mike approves and
                  we publish it through the My Business API Posts
                  endpoint."

01:15–01:30  [Cut to actual Google Maps in a new tab showing the
              live updated profile and the new Google Post visible.
              Closing privacy frame.]
             VO: "Both the profile update and the new post are live
                  on Mike's GBP. Tokens are encrypted at rest. Mike
                  can disconnect from his WFT portal or from
                  myaccount.google.com any time. Thanks for reviewing."
```

## Production Notes

- The consent screen showing `business.manage` must be visible for at least 3 seconds.
- Use a real GBP test location — `[TODO: Alex provisions a test GBP "WeFixTrades Demo Plumbing — Vancouver"]`.
- Filename: `wefixtrades-mapguard-gbp-review.mp4`.
