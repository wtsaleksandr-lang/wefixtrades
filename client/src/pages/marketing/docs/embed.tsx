import { useEffect } from "react";
import DocsLayout, { Step, CodeBlock, Accordion, InfoBox, DocH2, DocH3, Checklist } from "@/components/marketing/DocsLayout";
import { mkt } from "@/theme/tokens";
import { HOSTING_DOMAIN } from "@shared/slugUtils";

export default function DocsEmbed() {
  useEffect(() => { document.title = "Embed Guide — QuoteQuick™ Docs"; }, []);

  return (
    <DocsLayout
      activeSlug="embed"
      title="Embed Guide"
      description="Get your calculator live on any website in under 5 minutes. Three options — pick what fits your setup."
    >

      <DocH2>Quick Start — 2 Steps</DocH2>
      <Step n={1} title="Copy your embed code">
        Open your Dashboard → select your calculator → click <strong>Deploy</strong>. Copy the script snippet shown.
        <CodeBlock lang="html" code={`<script src="https://YOUR_DOMAIN/embed-widget.js"
  data-calculator-slug="your-business-slug"
  async>
</script>
<div id="quotequick-widget"></div>`} />
      </Step>
      <Step n={2} title="Paste into your website">
        Paste the code into any page where you want the calculator to appear — in the body, inside a content block, or a custom HTML section. That's it. The widget loads automatically and resizes to fit.
      </Step>

      <InfoBox type="tip">
        <strong>Fastest option:</strong> Skip embedding entirely. Share your free hosted link (e.g. <code>your-slug.{HOSTING_DOMAIN}</code>) via email, Instagram bio, or Google Business profile — no website needed.
      </InfoBox>

      <DocH2>Three Embed Options</DocH2>

      <DocH3>Option 1 — Hosted Link (Fastest)</DocH3>
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.7, marginBottom: 12 }}>
        Every calculator gets a free public URL. No embedding required.
      </p>
      <CodeBlock lang="text" code={`https://your-slug.${HOSTING_DOMAIN}`} />
      <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6, marginBottom: 12 }}>
        Or use the direct link:
      </p>
      <CodeBlock lang="text" code={`https://YOUR_DOMAIN/calculator?slug=your-business-slug`} />
      <Checklist items={[
        "Share in emails, text messages, or social bios",
        "Works immediately — no website changes needed",
        "Upgrade to Pro for a custom domain (e.g. quotes.yoursite.com)",
      ]} />

      <DocH3>Option 2 — Inline Script Embed</DocH3>
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.7, marginBottom: 12 }}>
        Renders the full calculator directly on your page. Best for service pages.
      </p>
      <CodeBlock lang="html" code={`<!-- Place in your page <body>, where you want it to appear -->
<script src="https://YOUR_DOMAIN/embed-widget.js"
  data-calculator-slug="your-business-slug"
  async>
</script>
<div id="quotequick-widget" style="max-width: 600px; margin: 0 auto;"></div>`} />

      <DocH3>Option 3 — Popup Button</DocH3>
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.7, marginBottom: 12 }}>
        Adds a "Get a Quote" button. When clicked, the calculator opens as a modal overlay.
      </p>
      <CodeBlock lang="html" code={`<script src="https://YOUR_DOMAIN/embed-widget.js"
  data-calculator-slug="your-business-slug"
  data-mode="popup"
  data-button-label="Get a Free Quote"
  data-accent-color="#394247"
  async>
</script>`} />
      <InfoBox type="info">
        The button appears at the bottom-right of your page. Customize the label and color via the data attributes above.
      </InfoBox>

      <DocH2>Platform-Specific Steps</DocH2>
      <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.65, marginBottom: 16 }}>
        Choose your website platform below for step-by-step instructions.
      </p>

      <Accordion title="WordPress (Elementor / Gutenberg)" icon="📝">
        <DocH3>Elementor</DocH3>
        <Checklist items={[
          "Open the page in Elementor editor",
          "Search for the HTML widget and drag it onto your page",
          "Paste your embed code into the HTML widget",
          "Click Update — you're done",
        ]} />
        <DocH3>Gutenberg (Block Editor)</DocH3>
        <Checklist items={[
          "Open your page",
          `Click the + to add a block → search for "Custom HTML"`,
          "Paste your embed code into the block",
          "Click Save",
        ]} />
        <InfoBox type="warn">
          <strong>Common mistake:</strong> Don't paste the script in the WordPress Visual editor — always use the Custom HTML block or switch to the Code editor view first.
        </InfoBox>
      </Accordion>

      <Accordion title="Wix" icon="🔷">
        <Checklist items={[
          "Open Wix Editor → click Add (+) → Embed → Custom Embeds → Embed HTML",
          "Drag the HTML element onto your page",
          "Click the element → Enter Code",
          "Paste your embed code → Apply",
          "Resize the element to fit your layout",
        ]} />
        <InfoBox type="tip">
          Set the HTML element height to at least 600px so the calculator has space to display correctly.
        </InfoBox>
      </Accordion>

      <Accordion title="Squarespace" icon="⬛">
        <Checklist items={[
          "Open the page editor in Squarespace",
          "Click the + icon to add a block → choose Code",
          "Paste your embed script into the code block",
          "Make sure the block mode is set to HTML (not Markdown)",
          "Save and preview",
        ]} />
        <InfoBox type="warn">
          <strong>Common mistake:</strong> The Code block in Squarespace must be set to HTML mode, not Markdown. Toggle it from the block settings.
        </InfoBox>
      </Accordion>

      <Accordion title="Shopify" icon="🛍️">
        <Checklist items={[
          "Go to Shopify Admin → Online Store → Themes → Edit Code",
          "Open the page template or a section file where you want the calculator",
          "Paste the embed code in the correct location within the HTML",
          "Click Save — the widget appears on your storefront",
        ]} />
        <InfoBox type="info">
          Alternatively, use a <strong>Custom Liquid</strong> section or a Shopify Page that allows HTML editing — both work equally well.
        </InfoBox>
      </Accordion>

      <DocH2>Common Issues</DocH2>
      <Checklist items={[
        "Widget not showing? Check that data-calculator-slug matches your slug from the Dashboard",
        "Widget too tall or short? The iframe auto-resizes, but you can set a max-height on the container div",
        "Popup not appearing? Make sure the script has data-mode=\"popup\" set",
        "Fonts look different? The widget loads Inter as a fallback. Custom branding fonts require Pro plan",
      ]} />

    </DocsLayout>
  );
}
