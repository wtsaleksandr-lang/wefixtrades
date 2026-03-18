# Primitive Component Status

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Logo | `client/src/components/primitives/Logo.tsx` | ✅ Done | Boot animation, hover checkmark redraw, size variants (sm/md/lg), animate prop. Used site-wide in nav + footer. |
| NavButton (Services/dark) | `client/src/components/primitives/NavButton.tsx` | ✅ Done | Dark style. Et Mono font, elastic cubic-bezier, conveyor arrow, hover-forced demo. Test page at `/dev/primitives`. |
| NavButton (Product/cyan) | — | ⏳ Next | Not built yet. |
| PillarAnimation | `client/src/components/sections/PillarAnimation.tsx` | ✅ Done | 4-pillar tabbed showcase. Auto-advances 5s, manual click resets timer. CSS-only progress bar + content fade-in. Uses nav Lucide icons (MapPinned, Calculator, Workflow, ShieldCheck). Logo component embedded. Added to homepage after StickyStackCards. DemoCanvas at `/dev/canvas`. |
| Hero CTA Buttons | `client/src/pages/marketing/home.tsx` + `index.css` | ✅ Done | Services (dark, no border) + Product (cyan, -1px). Em-based sizing. Square expands left on hover. Arrow conveyor via left/right transitions. Text centered in square using px positioning. Satoshi font. |
