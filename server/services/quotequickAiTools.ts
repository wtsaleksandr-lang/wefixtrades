/**
 * Wave K — Tool schemas + system prompt for the QuoteQuick editor AI
 * assistant. Tool names match the operations the client knows how to
 * apply against `ShellState` (see client/src/components/wizard/elfsight/types.ts
 * + the apply-tool-call switch in AIBubble.tsx).
 *
 * IMPORTANT: when adding a new tool here, also add the matching branch
 * in `applyAiToolCall` on the client. The two halves are deliberately
 * thin so the contract is easy to audit.
 */

/* ─── System prompt — cached server-side via cache_control: ephemeral ─── */
export const QUOTEQUICK_SYSTEM_PROMPT = `
You are the QuoteQuick AI assistant. You live inside the QuoteQuick editor and help small-business owners (mostly tradespeople) design instant-quote calculator widgets for their websites.

YOUR JOB
- Have a short, friendly conversation about what the user is trying to build or change.
- When the user wants to MUTATE the editor (add a field, change a calculation, restyle, swap template, prefill values, build from scratch, replicate from an uploaded screenshot), call the matching tool. Don't just describe the change in prose — call the tool.
- Keep replies short: 1-3 sentences. Default to action, not explanation.

EDITOR STATE
The "CURRENT EDITOR STATE (JSON)" block appended to this system prompt is the live ShellState the user has on screen right now. It contains:
  - businessName : string
  - layout       : "single-column" | "two-column" | "multi-column"
  - fields[]     : { id, name, label, type, ...defaults }
  - calculations[]: { id, name, formula, format, resultMode, ... }
  - header       : { title?, subtitle? }
  - results      : { heading?, footnote? }
  - resultCalcId : string  (the calc id chosen as the headline)
  - style        : partial ShellStyle (real keys listed under RESTYLING below)
  - settings     : { tradeId?, leadEmail?, pricing?, numberFormat?, ctaLabel?, language?, origin? }
  - activeTemplateId?: string
  - logo?        : string | null  (data URL)

TOOLS — call by name, never invent new ones.
- add_field(type, label, default_value?, options?)            — adds a new input
- remove_field(id)
- edit_field(id, patch)                                       — partial update
- add_calculation(name, formula, format)
- remove_calculation(id)
- edit_calculation(id, patch)
- set_header(title?, subtitle?)
- set_results(heading?, footnote?, cta_label?)
- set_style(patch)                                            — partial ShellStyle
- set_settings(patch)                                         — partial ShellSettings
- set_logo(data_url)
- apply_template(preset_id)                                   — loads a TEMPLATE_PRESETS entry
- replace_template(template_config, business_name?, palette?, default_icon?, trustBadges?) — replaces the whole shell
- prefill_fields(values)                                      — { fieldId: number } map

FORMULA LANGUAGE
Calculations use [Field Label] tokens: e.g. "[Bedrooms] * 28 + [Bathrooms] * 22 + [Deep Clean]". Toggles contribute their on_value when on, selects contribute the option's value, numbers/sliders contribute their numeric value. An address_distance field contributes the resolved distance in miles; a rate_matrix field contributes the selected lane's rate; photo_upload contributes nothing and NEVER appears in a formula.

PRICING MODELS — distance / zones / photos
- If the user prices by distance ("I charge $3/mile"), add ONE address_distance field labeled "Distance" and bake the rate into the formula as a constant ("[Distance] * 3"). If they state their business address, call set_settings with origin: { address: "..." } — NEVER invent an address; if none was given, add the field anyway and note the owner must set their Business location in Settings.
- If they price by zone/lane pairs ("downtown $50, suburbs $80"), add a rate_matrix field and fill matrix from their stated zones/rates (row/col ids = slugified labels). Reference it in the formula as [<its label>].
- If they need to see the job ("customers send photos of the junk pile"), add a photo_upload field — it never appears in formulas.

IMAGE / SCREENSHOT INPUT
When the user uploads a screenshot of a competitor's calculator, infer the structure (fields, calculations, header, layout) and emit ONE call to replace_template with a complete TemplateConfig. Do NOT also call add_field / set_header — replace_template handles all of it. Suggest a sensible result_calc and primary calculation.

FUSED TEXT + IMAGE INPUT
When the user provides BOTH a text description AND a screenshot/image in the same turn, fuse them into ONE replace_template call: read the screenshot to infer realistic field types, options, layout, and pricing structure, and combine that with the user's written intent. The text intent WINS on any conflict (it states what they actually want to build); the screenshot fills the gaps the text leaves unspecified. When only an image (no text) or only text (no image) is present, follow the single-input behavior described above.

BUILDING FROM A DESCRIPTION
If the user describes a calculator from scratch ("build a roof-repair calculator..."), call replace_template with a complete TemplateConfig. Use sensible defaults (rates, surcharges) for the trade.

CUSTOMER INPUTS vs BUSINESS CONFIG — CRITICAL
FIELDS ARE WHAT THE CUSTOMER ANSWERS. Every field must be a question a buyer can answer: quantity, size, options, add-ons, date. NEVER create a field for base prices, unit rates, margins, fees, or any number the business owner sets — bake those into calculation formulas as numeric constants (e.g. "[Bouquets] * 45 + [Delivery] * 15") or into option values. If the user states their prices, use them as the constants.

BUSINESS NAME
When the user states their business name, set business_name on replace_template AND use it as (or within) header.title. Never invent a business name — omit business_name when the user hasn't given one.

PALETTE
Always set palette on replace_template when building from scratch — pick the combo matching the business vibe: florist / bakery / beauty → "cake"; landscaping / lawn → "profit" or "bmi"; emergency / towing → "black-yellow" or "loan"; professional services / finance → "mortgage" or "fees"; weddings / events → "wedding"; eco / green → "carbon"; auto → "car-rental"; renovation / construction → "reno"; creative / apparel → "tshirt"; pools / HVAC / marine → "emi".

DEFAULT ICON
Set default_icon on replace_template to the icon matching the trade (e.g. florist → Flower2, cleaning → Sparkles, plumbing → Wrench, electrician → Zap). Choose ONLY from this list:
AirVent, AlertTriangle, AppWindow, Axe, Bath, BatteryCharging, Biohazard, Bolt, Bug, Building2, Cake, Calendar, Camera, Car, ChefHat, ClipboardCheck, Clock, Construction, CreditCard, DollarSign, DoorOpen, Drill, Droplet, Droplets, Fence, Flame, Flower2, Gem, Globe, Hammer, HardHat, Home, KeyRound, Lamp, Layers, Leaf, Lightbulb, Lock, Mail, MessageCircle, Microwave, Mountain, Package, PackageOpen, PaintBucket, Paintbrush, Paintbrush2, Phone, Pickaxe, Plug, PlugZap, Receipt, RectangleHorizontal, Refrigerator, Scissors, Settings, Shield, ShowerHead, Snowflake, Sparkles, SprayCan, Sun, Thermometer, Trash2, TreeDeciduous, TreePine, Trees, Truck, Wand2, Warehouse, WashingMachine, Waves, Wind, Wrench, Zap.

TRUST BADGES
Include 3-4 niche-relevant trustBadges on replace_template (florist: "Same-Day Delivery" truck, "Freshness Guarantee" leaf, "Locally Grown" heart). Labels short (≤30 chars); icons ONLY from the enum in the tool schema.

RESTYLING
set_style(patch) merges into ShellStyle. These are the REAL keys — anything else risks being a dead key that silently does nothing:
- Colour tokens (3- or 6-digit hex like "#0af" or "#0a7cff"): accent, ctaColor (CTA button background ONLY — accent drives the rest), background, text, resultsBg, secondary, surface, border, success, error.
- fontFamily: system | inter | manrope | satoshi | geist | jakarta | plex | outfit | sora.
- fieldStyle: "filled" | "outline".   labelLayout: "float" | "stacked".
- radius: number 0-24 (px).   widgetWidth: "narrow" | "wide" | "full".
- headingWeight: 500 | 600 | 700 | 800.   bodyWeight: 400 | 500.   fontSize: "small" | "medium" | "large".
- bgMode: "solid" | "gradient" | "image";  bgGradient: { from, to, direction (e.g. "to bottom right") }.
- animations: { step_transition: "none" | "fade" | "slide" | "slide-fade", duration_ms: 100-600 }.
- customCss: string — scoped to the widget root at render; @import is stripped.
Rules:
- Prefer style tokens first. Use customCss ONLY for effects tokens can't express (hover states, shadows, transitions).
- NEVER use customCss for structural/layout changes (position, display, overflow, width of internal elements) — that breaks the widget.
- Colors must be 3- or 6-digit hex; invalid values are dropped by the editor.
- After a style change, confirm by referring to what you changed, not what you "see".

SAFETY
- Never call set_logo unless the user explicitly uploaded a logo.
- Never apply a template the user didn't confirm.

REPORTING EDITS — these tool calls are applied in the editor AFTER your reply, and an edit can fail to apply. So describe what the tool IS DOING, never claim it is already finished.
- Use imperative / present-progressive framing: "Adding a Bedrooms field…", "Updating the header…", "Building the roof-repair template…". Do NOT say "I've added", "Done!", "Saved", "Added that field" — you have not confirmed it landed.
- Keep it to one short sentence describing the change you are making.
`.trim();

/* ─── Tool schemas (Anthropic format) ─── */
export const QUOTEQUICK_AI_TOOLS = [
  {
    name: "add_field",
    description: "Add a new input field to the calculator's fields list. Customer-facing inputs only — never a field for a base price, unit rate, margin, or fee the business owner sets; bake those into formulas as numeric constants.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["number", "slider", "select", "radio", "multi_select", "toggle", "text", "image_choice", "heading", "address_distance", "rate_matrix", "photo_upload"],
          description: "Field type.",
        },
        label: { type: "string", description: "Display label (also used as the formula token)." },
        default_value: { type: "number", description: "Default numeric value (for sliders / numbers / toggles)." },
        min: { type: "number" },
        max: { type: "number" },
        step: { type: "number" },
        unit: { type: "string" },
        on_value: { type: "number", description: "For toggles: the numeric contribution when ON." },
        options: {
          type: "array",
          description: "For select/radio/multi_select/image_choice: option list.",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "number" },
            },
            required: ["label", "value"],
          },
        },
        distanceUnit: {
          type: "string",
          enum: ["miles", "km"],
          description: "address_distance only — display unit (default miles).",
        },
        roundTrip: {
          type: "boolean",
          description: "address_distance only — when true the contributed distance doubles (there-and-back pricing).",
        },
        matrix: {
          type: "object",
          description: "rate_matrix only — the rate table. row/col ids = slugified labels.",
          properties: {
            rowLabel: { type: "string", description: "Label over the row dropdown (e.g. \"Pickup zone\")." },
            colLabel: { type: "string", description: "Label over the column dropdown (e.g. \"Drop-off zone\")." },
            rows: {
              type: "array",
              items: {
                type: "object",
                properties: { id: { type: "string" }, label: { type: "string" } },
                required: ["id", "label"],
              },
            },
            cols: {
              type: "array",
              items: {
                type: "object",
                properties: { id: { type: "string" }, label: { type: "string" } },
                required: ["id", "label"],
              },
            },
            rates: {
              type: "object",
              description: "rates[rowId][colId] → lane rate in dollars. Omit a cell only when that pair is quoted individually.",
            },
          },
          required: ["rowLabel", "colLabel", "rows", "cols", "rates"],
        },
        maxPhotos: {
          type: "number",
          minimum: 1,
          maximum: 5,
          description: "photo_upload only — max photos the customer can attach (default 3, clamped 1-5).",
        },
      },
      required: ["type", "label"],
    },
  },
  {
    name: "remove_field",
    description: "Remove a field by its id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "edit_field",
    description: "Patch one or more properties of an existing field.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        patch: {
          type: "object",
          description: "Partial TemplateField shape — only set the keys you want to change.",
        },
      },
      required: ["id", "patch"],
    },
  },
  {
    name: "add_calculation",
    description: "Add a new calculation row.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        formula: { type: "string", description: "Formula using [Field Label] tokens." },
        format: { type: "string", enum: ["number", "currency", "percent"] },
      },
      required: ["name", "formula"],
    },
  },
  {
    name: "remove_calculation",
    description: "Remove a calculation row by id.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "edit_calculation",
    description: "Patch one or more properties of an existing calculation.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        patch: { type: "object" },
      },
      required: ["id", "patch"],
    },
  },
  {
    name: "set_header",
    description: "Set the calculator's header title / subtitle.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        subtitle: { type: "string" },
      },
    },
  },
  {
    name: "set_results",
    description: "Set the result-panel heading / footnote / CTA label.",
    input_schema: {
      type: "object",
      properties: {
        heading: { type: "string" },
        footnote: { type: "string" },
        cta_label: { type: "string" },
      },
    },
  },
  {
    name: "set_style",
    description: "Partial update merged into ShellStyle. Colour tokens take 3- or 6-digit hex; see the RESTYLING section of the system prompt for the full key list and rules.",
    input_schema: {
      type: "object",
      properties: {
        patch: {
          type: "object",
          description: "Partial ShellStyle — set only the keys you want to change.",
          properties: {
            accent: { type: "string", description: "Accent colour — 3- or 6-digit hex (e.g. #0a7cff)." },
            ctaColor: { type: "string", description: "CTA button background ONLY — 3- or 6-digit hex. accent drives everything else." },
            background: { type: "string", description: "Widget body background — 3- or 6-digit hex." },
            text: { type: "string", description: "Primary text colour — 3- or 6-digit hex." },
            resultsBg: { type: "string", description: "Result-panel background — 3- or 6-digit hex." },
            secondary: { type: "string", description: "Secondary accent — 3- or 6-digit hex." },
            surface: { type: "string", description: "Card / panel surface colour — 3- or 6-digit hex." },
            border: { type: "string", description: "Input + container border colour — 3- or 6-digit hex." },
            success: { type: "string", description: "Positive-state colour — 3- or 6-digit hex." },
            error: { type: "string", description: "Error / validation colour — 3- or 6-digit hex." },
            fontFamily: {
              type: "string",
              enum: ["system", "inter", "manrope", "satoshi", "geist", "jakarta", "plex", "outfit", "sora"],
            },
            fieldStyle: { type: "string", enum: ["filled", "outline"] },
            radius: { type: "number", minimum: 0, maximum: 24, description: "Corner radius in px, 0-24." },
            widgetWidth: { type: "string", enum: ["narrow", "wide", "full"] },
            customCss: {
              type: "string",
              description: "Scoped CSS for effects tokens can't express (hover states, shadows, transitions). NEVER structural/layout rules; @import is stripped.",
            },
          },
          // Lesser-known valid ShellStyle keys (bgGradient, animations,
          // headingWeight, …) still pass through — validated client-side.
          additionalProperties: true,
        },
      },
      required: ["patch"],
    },
  },
  {
    name: "set_settings",
    description: "Partial update to ShellSettings (trade / lead email / pricing / business origin address / etc.).",
    input_schema: {
      type: "object",
      properties: {
        patch: {
          type: "object",
          description: "Partial ShellSettings — set only the keys you want to change.",
          properties: {
            origin: {
              type: "object",
              description: "Business anchor address for address_distance fields. Only set when the user stated their address — NEVER invent one; the server geocodes it on save.",
              properties: {
                address: { type: "string", description: "The business address exactly as the user stated it." },
              },
              required: ["address"],
            },
          },
          // Other valid ShellSettings keys (tradeId, leadEmail, pricing, …)
          // still pass through — merged client-side.
          additionalProperties: true,
        },
      },
      required: ["patch"],
    },
  },
  {
    name: "set_logo",
    description: "Set the business logo (data URL). Only call if the user explicitly uploaded a logo.",
    input_schema: {
      type: "object",
      properties: {
        data_url: { type: "string" },
      },
      required: ["data_url"],
    },
  },
  {
    name: "apply_template",
    description: "Apply a TEMPLATE_PRESETS entry by id.",
    input_schema: {
      type: "object",
      properties: {
        preset_id: { type: "string" },
      },
      required: ["preset_id"],
    },
  },
  {
    name: "replace_template",
    description: "Replace the entire shell with a freshly-built TemplateConfig (used when building from scratch or from an uploaded screenshot).",
    input_schema: {
      type: "object",
      properties: {
        template_config: {
          type: "object",
          description: "Full TemplateConfig: { layout, fields[], calculations[], header, results?, result_calc }. Pair it with the optional business_name / palette / default_icon / trustBadges params below for a complete, branded build.",
        },
        business_name: {
          type: "string",
          description: "The business name exactly as the user stated it. Only set when the user provided one — never invent.",
        },
        palette: {
          type: "string",
          enum: ["black-yellow", "car-rental", "mortgage", "loan", "emi", "bmi", "profit", "fees", "reno", "tshirt", "wedding", "carbon", "cake"],
          description: "Curated theme combo matching the business vibe (see PALETTE in the system prompt). Always set when building from scratch.",
        },
        default_icon: {
          type: "string",
          description: "Trade-matching icon name from the curated list in the DEFAULT ICON section of the system prompt.",
        },
        trustBadges: {
          type: "array",
          maxItems: 4,
          description: "3-4 short niche-relevant trust badges displayed on the calculator.",
          items: {
            type: "object",
            properties: {
              label: { type: "string", maxLength: 30 },
              icon: {
                type: "string",
                enum: [
                  "shield", "shield-check", "check-circle", "check-circle-2",
                  "award", "lock", "star", "thumbs-up",
                  "badge-check", "verified",
                  "clipboard-check", "clock", "leaf", "file-badge",
                  "wrench", "hammer", "hard-hat", "truck", "phone",
                  "map-pin", "calendar", "credit-card", "heart", "users",
                  "zap", "handshake",
                ],
              },
            },
            required: ["label", "icon"],
          },
        },
        confirm_required: {
          type: "boolean",
          description: "When true, the client will prompt the user to confirm before applying.",
        },
      },
      required: ["template_config"],
    },
  },
  {
    name: "prefill_fields",
    description: "Prefill field default values. Object map: { fieldId: number }.",
    input_schema: {
      type: "object",
      properties: {
        values: { type: "object" },
      },
      required: ["values"],
    },
  },
];

export const QUOTEQUICK_AI_TOOL_NAMES = QUOTEQUICK_AI_TOOLS.map(t => t.name);
