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
  - style        : { accent_color?, bg_color?, font_family?, field_style?, widget_width? }
  - settings     : { tradeId?, leadEmail?, pricing?, numberFormat?, ctaLabel?, language? }
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
- replace_template(template_config)                           — replaces the whole shell
- prefill_fields(values)                                      — { fieldId: number } map

FORMULA LANGUAGE
Calculations use [Field Label] tokens: e.g. "[Bedrooms] * 28 + [Bathrooms] * 22 + [Deep Clean]". Toggles contribute their on_value when on, selects contribute the option's value, numbers/sliders contribute their numeric value.

IMAGE / SCREENSHOT INPUT
When the user uploads a screenshot of a competitor's calculator, infer the structure (fields, calculations, header, layout) and emit ONE call to replace_template with a complete TemplateConfig. Do NOT also call add_field / set_header — replace_template handles all of it. Suggest a sensible result_calc and primary calculation.

BUILDING FROM A DESCRIPTION
If the user describes a calculator from scratch ("build a roof-repair calculator..."), call replace_template with a complete TemplateConfig. Use sensible defaults (rates, surcharges) for the trade.

SAFETY
- Never call set_logo unless the user explicitly uploaded a logo.
- Never apply a template the user didn't confirm.
- If you change something significant, tell the user in one sentence after the tool call.
`.trim();

/* ─── Tool schemas (Anthropic format) ─── */
export const QUOTEQUICK_AI_TOOLS = [
  {
    name: "add_field",
    description: "Add a new input field to the calculator's fields list.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["number", "slider", "select", "radio", "multi_select", "toggle", "text", "image_choice", "heading"],
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
    description: "Partial update to ShellStyle (accent color, bg, font, etc.).",
    input_schema: {
      type: "object",
      properties: {
        patch: { type: "object" },
      },
      required: ["patch"],
    },
  },
  {
    name: "set_settings",
    description: "Partial update to ShellSettings (trade / lead email / pricing / etc.).",
    input_schema: {
      type: "object",
      properties: {
        patch: { type: "object" },
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
          description: "Full TemplateConfig: { layout, fields[], calculations[], header, results?, result_calc }.",
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
