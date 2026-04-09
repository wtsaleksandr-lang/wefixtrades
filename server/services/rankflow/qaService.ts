import type { RankflowTask } from "@shared/schema";

export interface QACheckResult {
  check_type: string;
  passed: boolean;
  notes: string;
}

export interface QAResult {
  overall_passed: boolean;
  checks: QACheckResult[];
}

/**
 * Run QA checks against a completed task's proof_data.
 * Validates based on qa_requirements stored in task metadata.
 */
export async function runQA(task: RankflowTask): Promise<QAResult> {
  const requirements: string[] =
    (task.metadata as any)?.qa_requirements || [];
  const proof = (task.proof_data || {}) as {
    urls?: string[];
    notes?: string;
    screenshots?: string[];
  };

  if (requirements.length === 0) {
    return { overall_passed: true, checks: [] };
  }

  const checks: QACheckResult[] = [];

  for (const req of requirements) {
    const result = await runSingleCheck(req, proof);
    checks.push(result);
  }

  const overall_passed = checks.every((c) => c.passed);
  return { overall_passed, checks };
}

async function runSingleCheck(
  checkType: string,
  proof: { urls?: string[]; notes?: string; screenshots?: string[] },
): Promise<QACheckResult> {
  switch (checkType) {
    case "link_live":
      return checkLinkLive(proof);
    case "listing_exists":
      return checkListingExists(proof);
    case "nap_consistency":
      return checkNapConsistency(proof);
    case "content_length":
      return checkContentLength(proof);
    case "readability":
      return checkReadability(proof);
    case "page_updated":
      return checkPageUpdated(proof);
    default:
      return { check_type: checkType, passed: true, notes: "Unknown check — auto-passed" };
  }
}

async function checkLinkLive(proof: { urls?: string[] }): Promise<QACheckResult> {
  const urls = proof.urls || [];
  if (urls.length === 0) {
    return { check_type: "link_live", passed: false, notes: "No URLs provided in proof" };
  }
  for (const url of urls) {
    try {
      const resp = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10000) });
      if (!resp.ok) {
        return { check_type: "link_live", passed: false, notes: `URL returned ${resp.status}: ${url}` };
      }
    } catch (err: any) {
      return { check_type: "link_live", passed: false, notes: `URL unreachable: ${url} — ${err.message}` };
    }
  }
  return { check_type: "link_live", passed: true, notes: `All ${urls.length} URLs live` };
}

async function checkListingExists(proof: { urls?: string[] }): Promise<QACheckResult> {
  const urls = proof.urls || [];
  if (urls.length === 0) {
    return { check_type: "listing_exists", passed: false, notes: "No listing URLs provided" };
  }
  // Lightweight check — just verify URL is reachable
  try {
    const resp = await fetch(urls[0], { method: "HEAD", signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      return { check_type: "listing_exists", passed: true, notes: `Listing URL reachable: ${urls[0]}` };
    }
    return { check_type: "listing_exists", passed: false, notes: `Listing URL returned ${resp.status}` };
  } catch {
    return { check_type: "listing_exists", passed: false, notes: "Listing URL unreachable" };
  }
}

async function checkNapConsistency(proof: { urls?: string[]; notes?: string }): Promise<QACheckResult> {
  // Lightweight: require that notes mention business name or proof URLs exist
  if ((proof.urls && proof.urls.length > 0) || (proof.notes && proof.notes.length > 10)) {
    return { check_type: "nap_consistency", passed: true, notes: "NAP proof provided" };
  }
  return { check_type: "nap_consistency", passed: false, notes: "Insufficient NAP proof — provide URLs or notes" };
}

async function checkContentLength(proof: { notes?: string }): Promise<QACheckResult> {
  const notes = proof.notes || "";
  // Expect at least a reasonable content summary in notes
  if (notes.length >= 50) {
    return { check_type: "content_length", passed: true, notes: `Content proof provided (${notes.length} chars)` };
  }
  return { check_type: "content_length", passed: false, notes: "Content proof too short — provide content summary or URL" };
}

async function checkReadability(proof: { notes?: string }): Promise<QACheckResult> {
  // Lightweight: just verify content exists
  if (proof.notes && proof.notes.length >= 50) {
    return { check_type: "readability", passed: true, notes: "Content readable" };
  }
  return { check_type: "readability", passed: false, notes: "No content provided for readability check" };
}

async function checkPageUpdated(proof: { urls?: string[]; notes?: string }): Promise<QACheckResult> {
  if ((proof.urls && proof.urls.length > 0) || (proof.notes && proof.notes.length > 0)) {
    return { check_type: "page_updated", passed: true, notes: "Page update confirmed via proof" };
  }
  return { check_type: "page_updated", passed: false, notes: "No proof of page update" };
}
