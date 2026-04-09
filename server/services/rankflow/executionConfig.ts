/**
 * Execution configuration per task type.
 * Defines how each task type should be executed, by whom, and what QA is needed.
 */

export interface ExecutionConfig {
  execution_mode: "ai" | "manual_admin" | "outsourced";
  vendor_type: string | null;
  qa_requirements: string[];
  estimated_cost: number;
}

const EXECUTION_MAP: Record<string, ExecutionConfig> = {
  page_create: {
    execution_mode: "ai",
    vendor_type: null,
    qa_requirements: ["content_length", "readability"],
    estimated_cost: 1,
  },
  meta_fix: {
    execution_mode: "ai",
    vendor_type: null,
    qa_requirements: ["page_updated"],
    estimated_cost: 0,
  },
  citation_build: {
    execution_mode: "outsourced",
    vendor_type: "fiverr_citations",
    qa_requirements: ["listing_exists", "nap_consistency"],
    estimated_cost: 15,
  },
  internal_linking: {
    execution_mode: "manual_admin",
    vendor_type: null,
    qa_requirements: ["page_updated"],
    estimated_cost: 0,
  },
  content_support: {
    execution_mode: "ai",
    vendor_type: null,
    qa_requirements: ["content_length"],
    estimated_cost: 1,
  },
  schema_basic: {
    execution_mode: "ai",
    vendor_type: null,
    qa_requirements: ["page_updated"],
    estimated_cost: 0,
  },
};

const DEFAULT_CONFIG: ExecutionConfig = {
  execution_mode: "manual_admin",
  vendor_type: null,
  qa_requirements: [],
  estimated_cost: 0,
};

export function getExecutionConfig(taskType: string): ExecutionConfig {
  return EXECUTION_MAP[taskType] || DEFAULT_CONFIG;
}
