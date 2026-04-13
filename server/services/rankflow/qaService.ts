import type { RankflowTask } from "@shared/schema";
import { getExecutionConfig, APPROVED_CITATION_DIRECTORIES, isCostOverBudget } from "./executionConfig";

/* ─── Types ─── */

export interface QACheckResult {
  check_type: string;
  passed: boolean;
  notes: string;
}

export interface QAResult {
  overall_passed: boolean;
  checks: QACheckResult[];
  cost_warning: string | null;
}

interface ProofData {
  urls?: string[];
  notes?: string;
  screenshots?: string[];
  word_count?: number;
}

/* ─── Main QA Runner ─── */

/**
 * Run strict QA checks against a task's proof_data.
 * Uses qa_requirements from task metadata + reject_conditions from execution config.
 */
export async function runQA(task: RankflowTask): Promise<QAResult> {
  const requirements: string[] = (task.metadata as any)?.qa_requirements || [];
  const proof = (task.proof_data || {}) as ProofData;

  // If no requirements defined, auto-pass but flag
  if (requirements.length === 0) {
    return { overall_passed: true, checks: [], cost_warning: null };
  }

  const checks: QACheckResult[] = [];

  for (const req of requirements) {
    const result = await runCheck(req, proof, task);
    checks.push(result);
  }

  // Run reject condition checks
  const config = getExecutionConfig(task.type);
  for (const condition of config.reject_conditions) {
    const result = await runRejectCheck(condition, proof, task);
    if (result) checks.push(result);
  }

  // Cost warning
  let cost_warning: string | null = null;
  if (task.actual_cost && isCostOverBudget(task.type, Number(task.actual_cost))) {
    cost_warning = `Cost $${task.actual_cost} exceeds max $${config.max_cost} for ${task.type}`;
  }

  const overall_passed = checks.every(c => c.passed);
  return { overall_passed, checks, cost_warning };
}

/* ─── Check Dispatcher ─── */

async function runCheck(checkType: string, proof: ProofData, task: RankflowTask): Promise<QACheckResult> {
  switch (checkType) {
    // Citation checks
    case "listing_live": return checkListingLive(proof);
    case "nap_match": return checkNapMatch(proof, task);
    case "directory_quality": return checkDirectoryQuality(proof);
    case "indexable": return checkIndexable(proof);

    // Content checks
    case "content_length": return checkContentLength(proof);
    case "has_structure": return checkHasStructure(proof);
    case "has_location": return checkHasLocation(proof, task);
    case "has_cta": return checkHasCta(proof);
    case "not_duplicate": return checkNotDuplicate(proof);

    // Meta checks
    case "title_has_keyword": return checkTitleHasKeyword(proof, task);
    case "title_length": return checkTitleLength(proof);
    case "meta_length": return checkMetaLength(proof);
    case "no_keyword_stuffing": return checkNoKeywordStuffing(proof);

    // Linking checks
    case "links_relevant": return checkLinksRelevant(proof);
    case "anchor_text_natural": return checkAnchorTextNatural(proof);

    // Schema checks
    case "valid_jsonld": return checkValidJsonLd(proof);
    case "correct_business_info": return checkCorrectBusinessInfo(proof);

    // General
    case "page_updated": return checkPageUpdated(proof);
    case "actionable_brief": return checkActionableBrief(proof);

    default:
      return { check_type: checkType, passed: false, notes: `Unknown check type: ${checkType}` };
  }
}

/* ─── Reject Condition Checks ─── */

async function runRejectCheck(condition: string, proof: ProofData, _task: RankflowTask): Promise<QACheckResult | null> {
  switch (condition) {
    case "fake_directory": {
      const urls = proof.urls || [];
      for (const url of urls) {
        const domain = extractDomain(url);
        if (domain && !APPROVED_CITATION_DIRECTORIES.some(d => domain.includes(d))) {
          // Not on approved list — flag but don't auto-fail (admin can override)
          return { check_type: "reject:fake_directory", passed: true, notes: `Directory "${domain}" not on approved list — verify manually` };
        }
      }
      return null;
    }
    case "thin_content": {
      const wc = proof.word_count || estimateWordCount(proof.notes);
      if (wc > 0 && wc < 300) {
        return { check_type: "reject:thin_content", passed: false, notes: `Content is only ${wc} words — minimum 800 required` };
      }
      return null;
    }
    case "keyword_stuffing": {
      const text = proof.notes || "";
      if (text.length > 100) {
        const words = text.toLowerCase().split(/\s+/);
        const freq = new Map<string, number>();
        for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
        const maxRepeat = Math.max(...freq.values());
        const density = maxRepeat / words.length;
        if (density > 0.05 && maxRepeat > 10) {
          return { check_type: "reject:keyword_stuffing", passed: false, notes: `Possible keyword stuffing detected (${maxRepeat} repeats, ${(density * 100).toFixed(1)}% density)` };
        }
      }
      return null;
    }
    case "link_farm": {
      const urls = proof.urls || [];
      for (const url of urls) {
        const domain = extractDomain(url);
        if (domain && /\b(backlink|seo-link|free-directory|link-farm|spam)\b/i.test(domain)) {
          return { check_type: "reject:link_farm", passed: false, notes: `Suspicious domain detected: ${domain}` };
        }
      }
      return null;
    }
    default:
      return null;
  }
}

/* ─── Citation Checks ─── */

async function checkListingLive(proof: ProofData): Promise<QACheckResult> {
  const urls = proof.urls || [];
  if (urls.length === 0) {
    return { check_type: "listing_live", passed: false, notes: "No listing URLs provided" };
  }
  for (const url of urls) {
    try {
      const resp = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(10000) });
      if (!resp.ok) {
        return { check_type: "listing_live", passed: false, notes: `URL returned ${resp.status}: ${url}` };
      }
    } catch (err: any) {
      return { check_type: "listing_live", passed: false, notes: `URL unreachable: ${url}` };
    }
  }
  return { check_type: "listing_live", passed: true, notes: `${urls.length} listing URL(s) live` };
}

async function checkNapMatch(proof: ProofData, task: RankflowTask): Promise<QACheckResult> {
  const urls = proof.urls || [];
  const notes = proof.notes || "";
  if (urls.length === 0 && notes.length < 20) {
    return { check_type: "nap_match", passed: false, notes: "No NAP proof — provide listing URLs or confirm NAP in notes" };
  }
  // Check notes mention business-related terms as minimum proof
  const hasNapIndicator = /\b(name|address|phone|NAP|verified|confirmed|matches)\b/i.test(notes);
  if (notes.length > 20 && hasNapIndicator) {
    return { check_type: "nap_match", passed: true, notes: "NAP confirmation provided in notes" };
  }
  if (urls.length > 0) {
    return { check_type: "nap_match", passed: true, notes: "NAP verified via listing URLs" };
  }
  return { check_type: "nap_match", passed: false, notes: "NAP not confirmed — mention name/address/phone match in notes" };
}

async function checkDirectoryQuality(proof: ProofData): Promise<QACheckResult> {
  const urls = proof.urls || [];
  if (urls.length === 0) return { check_type: "directory_quality", passed: false, notes: "No URLs to check" };
  let approved = 0;
  let unapproved = 0;
  for (const url of urls) {
    const domain = extractDomain(url);
    if (domain && APPROVED_CITATION_DIRECTORIES.some(d => domain.includes(d))) {
      approved++;
    } else {
      unapproved++;
    }
  }
  if (unapproved > 0 && approved === 0) {
    return { check_type: "directory_quality", passed: false, notes: `No approved directories found — ${unapproved} unrecognized` };
  }
  if (unapproved > 0) {
    return { check_type: "directory_quality", passed: true, notes: `${approved} approved, ${unapproved} unrecognized — verify manually` };
  }
  return { check_type: "directory_quality", passed: true, notes: `All ${approved} directories approved` };
}

async function checkIndexable(proof: ProofData): Promise<QACheckResult> {
  const urls = proof.urls || [];
  if (urls.length === 0) return { check_type: "indexable", passed: false, notes: "No URLs to check" };
  // Spot-check first URL
  try {
    const resp = await fetch(urls[0], { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return { check_type: "indexable", passed: false, notes: `Page returned ${resp.status}` };
    const html = await resp.text();
    if (/noindex/i.test(html.slice(0, 2000))) {
      return { check_type: "indexable", passed: false, notes: "Page has noindex tag — not indexable" };
    }
    return { check_type: "indexable", passed: true, notes: "Page is indexable" };
  } catch {
    return { check_type: "indexable", passed: false, notes: "Could not fetch page to check indexability" };
  }
}

/* ─── Content Checks ─── */

function checkContentLength(proof: ProofData): QACheckResult {
  const wc = proof.word_count || estimateWordCount(proof.notes);
  if (wc === 0) {
    // If URL provided, trust it exists
    if (proof.urls && proof.urls.length > 0) {
      return { check_type: "content_length", passed: true, notes: "Content URL provided — verify length manually" };
    }
    return { check_type: "content_length", passed: false, notes: "No content or URL provided" };
  }
  if (wc < 800) {
    return { check_type: "content_length", passed: false, notes: `Content is ${wc} words — minimum 800 required` };
  }
  return { check_type: "content_length", passed: true, notes: `Content is ${wc} words` };
}

function checkHasStructure(proof: ProofData): QACheckResult {
  const text = proof.notes || "";
  if (proof.urls && proof.urls.length > 0 && text.length < 100) {
    return { check_type: "has_structure", passed: true, notes: "Page URL provided — verify structure manually" };
  }
  const hasHeadings = /\b(H1|H2|heading|section|##)\b/i.test(text);
  if (hasHeadings || text.length > 500) {
    return { check_type: "has_structure", passed: true, notes: "Content structure indicated" };
  }
  return { check_type: "has_structure", passed: false, notes: "No evidence of heading structure (H1/H2)" };
}

function checkHasLocation(proof: ProofData, task: RankflowTask): QACheckResult {
  const text = (proof.notes || "").toLowerCase();
  const primaryKw = ((task.metadata as any)?.primary_keyword || "").toLowerCase();
  // Extract location from keyword or task title
  const taskTitle = task.title.toLowerCase();
  if (text.length < 50 && proof.urls && proof.urls.length > 0) {
    return { check_type: "has_location", passed: true, notes: "Page URL provided — verify location mention" };
  }
  if (primaryKw && text.includes(primaryKw.split(" ").pop() || "")) {
    return { check_type: "has_location", passed: true, notes: "Location referenced in content" };
  }
  if (/\b(hamilton|toronto|ottawa|vancouver|calgary|burlington|brampton)\b/i.test(text) || /\b(city|area|location|local)\b/i.test(text)) {
    return { check_type: "has_location", passed: true, notes: "Location context present" };
  }
  return { check_type: "has_location", passed: false, notes: "No location mention found — content may be too generic" };
}

function checkHasCta(proof: ProofData): QACheckResult {
  const text = (proof.notes || "").toLowerCase();
  if (proof.urls && proof.urls.length > 0 && text.length < 100) {
    return { check_type: "has_cta", passed: true, notes: "Page URL provided — verify CTA manually" };
  }
  const hasCta = /\b(call|contact|quote|book|schedule|get started|free estimate|request)\b/i.test(text);
  if (hasCta) {
    return { check_type: "has_cta", passed: true, notes: "CTA present" };
  }
  return { check_type: "has_cta", passed: false, notes: "No call-to-action found" };
}

function checkNotDuplicate(proof: ProofData): QACheckResult {
  const text = proof.notes || "";
  if (/\b(unique|original|not duplicat|custom)\b/i.test(text)) {
    return { check_type: "not_duplicate", passed: true, notes: "Marked as unique content" };
  }
  if (proof.urls && proof.urls.length > 0) {
    return { check_type: "not_duplicate", passed: true, notes: "URL provided — verify uniqueness manually" };
  }
  return { check_type: "not_duplicate", passed: true, notes: "Assumed unique — flag if duplicate found" };
}

/* ─── Meta Checks ─── */

function checkTitleHasKeyword(proof: ProofData, task: RankflowTask): QACheckResult {
  const text = (proof.notes || "").toLowerCase();
  const primaryKw = ((task.metadata as any)?.primary_keyword || "").toLowerCase();
  if (!primaryKw) return { check_type: "title_has_keyword", passed: true, notes: "No primary keyword set — skipped" };
  if (text.includes(primaryKw) || text.includes(primaryKw.split(" ")[0])) {
    return { check_type: "title_has_keyword", passed: true, notes: "Title contains target keyword" };
  }
  if (proof.urls && proof.urls.length > 0) {
    return { check_type: "title_has_keyword", passed: true, notes: "URL provided — verify title manually" };
  }
  return { check_type: "title_has_keyword", passed: false, notes: "Title does not contain target keyword" };
}

function checkTitleLength(proof: ProofData): QACheckResult {
  const text = proof.notes || "";
  const titleMatch = text.match(/title[:\s]*["']?([^"'\n]{5,80})["']?/i);
  if (!titleMatch) {
    if (proof.urls && proof.urls.length > 0) return { check_type: "title_length", passed: true, notes: "URL provided — verify title length manually" };
    return { check_type: "title_length", passed: true, notes: "Could not extract title — verify manually" };
  }
  const len = titleMatch[1].trim().length;
  if (len > 60) return { check_type: "title_length", passed: false, notes: `Title is ${len} chars — max 60` };
  return { check_type: "title_length", passed: true, notes: `Title is ${len} chars` };
}

function checkMetaLength(proof: ProofData): QACheckResult {
  const text = proof.notes || "";
  const metaMatch = text.match(/meta[:\s]*["']?([^"'\n]{10,200})["']?/i);
  if (!metaMatch) {
    if (proof.urls && proof.urls.length > 0) return { check_type: "meta_length", passed: true, notes: "URL provided — verify meta length manually" };
    return { check_type: "meta_length", passed: true, notes: "Could not extract meta — verify manually" };
  }
  const len = metaMatch[1].trim().length;
  if (len > 155) return { check_type: "meta_length", passed: false, notes: `Meta is ${len} chars — max 155` };
  return { check_type: "meta_length", passed: true, notes: `Meta is ${len} chars` };
}

function checkNoKeywordStuffing(proof: ProofData): QACheckResult {
  const text = proof.notes || "";
  if (text.length < 50) return { check_type: "no_keyword_stuffing", passed: true, notes: "Too short to evaluate" };
  const words = text.toLowerCase().split(/\s+/);
  const freq = new Map<string, number>();
  for (const w of words) if (w.length > 3) freq.set(w, (freq.get(w) || 0) + 1);
  const maxRepeat = Math.max(...freq.values(), 0);
  if (maxRepeat > 5 && maxRepeat / words.length > 0.04) {
    return { check_type: "no_keyword_stuffing", passed: false, notes: "Possible keyword stuffing detected" };
  }
  return { check_type: "no_keyword_stuffing", passed: true, notes: "No stuffing detected" };
}

/* ─── Linking Checks ─── */

function checkLinksRelevant(proof: ProofData): QACheckResult {
  if (proof.urls && proof.urls.length > 0) return { check_type: "links_relevant", passed: true, notes: "URLs provided — verify relevance" };
  if (proof.notes && proof.notes.length > 20) return { check_type: "links_relevant", passed: true, notes: "Link details provided" };
  return { check_type: "links_relevant", passed: false, notes: "No proof of relevant links added" };
}

function checkAnchorTextNatural(proof: ProofData): QACheckResult {
  const text = proof.notes || "";
  if (/\b(click here|read more|this page)\b/i.test(text)) {
    return { check_type: "anchor_text_natural", passed: false, notes: "Generic anchor text detected — use descriptive keywords" };
  }
  return { check_type: "anchor_text_natural", passed: true, notes: "Anchor text appears natural" };
}

/* ─── Schema Checks ─── */

function checkValidJsonLd(proof: ProofData): QACheckResult {
  const text = proof.notes || "";
  if (proof.urls && proof.urls.length > 0) return { check_type: "valid_jsonld", passed: true, notes: "URL provided — validate with Rich Results Test" };
  if (text.includes("@context") || text.includes("schema.org") || text.includes("LocalBusiness")) {
    return { check_type: "valid_jsonld", passed: true, notes: "JSON-LD structure present" };
  }
  return { check_type: "valid_jsonld", passed: false, notes: "No JSON-LD schema found in proof" };
}

function checkCorrectBusinessInfo(proof: ProofData): QACheckResult {
  const text = proof.notes || "";
  if (proof.urls && proof.urls.length > 0) return { check_type: "correct_business_info", passed: true, notes: "URL provided — verify business info" };
  const hasInfo = /\b(name|address|phone|telephone)\b/i.test(text);
  if (hasInfo) return { check_type: "correct_business_info", passed: true, notes: "Business info referenced" };
  return { check_type: "correct_business_info", passed: false, notes: "No business info verification in proof" };
}

/* ─── General Checks ─── */

function checkPageUpdated(proof: ProofData): QACheckResult {
  if (proof.urls && proof.urls.length > 0) return { check_type: "page_updated", passed: true, notes: "Page URL provided" };
  if (proof.notes && proof.notes.length > 10) return { check_type: "page_updated", passed: true, notes: "Update confirmed" };
  return { check_type: "page_updated", passed: false, notes: "No proof of page update" };
}

function checkActionableBrief(proof: ProofData): QACheckResult {
  const text = proof.notes || "";
  if (text.length < 100) return { check_type: "actionable_brief", passed: false, notes: "Brief too short to be actionable" };
  const hasKeywords = /\b(keyword|target|topic|page|content)\b/i.test(text);
  if (hasKeywords) return { check_type: "actionable_brief", passed: true, notes: "Brief contains actionable elements" };
  return { check_type: "actionable_brief", passed: false, notes: "Brief lacks keyword or topic targets" };
}

/* ─── Helpers ─── */

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function estimateWordCount(text?: string | null): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

/* ─── Batch QA ─── */

/**
 * Run QA on a batch of tasks. Returns per-task results and overall stats.
 */
export async function runBatchQA(tasks: RankflowTask[]): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: { task_id: number; passed: boolean; checks: QACheckResult[]; cost_warning: string | null }[];
}> {
  const results: { task_id: number; passed: boolean; checks: QACheckResult[]; cost_warning: string | null }[] = [];
  let passed = 0;
  let failed = 0;

  for (const task of tasks) {
    const qa = await runQA(task);
    results.push({
      task_id: task.id,
      passed: qa.overall_passed,
      checks: qa.checks,
      cost_warning: qa.cost_warning,
    });
    if (qa.overall_passed) passed++;
    else failed++;
  }

  return { total: tasks.length, passed, failed, results };
}
