/**
 * Centralized human-friendly status labels.
 * Use these instead of raw database status values in the UI.
 */

export const TASK_STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const CLIENT_STATUS_LABELS: Record<string, string> = {
  lead: "Lead",
  active: "Active",
  churned: "Churned",
  paused: "Paused",
};

export const TICKET_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_customer: "Waiting for response",
  resolved: "Resolved",
  closed: "Closed",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Unpaid",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
};

export const WAITING_ON_LABELS: Record<string, string> = {
  client: "Waiting on client",
  supplier: "Waiting on supplier",
  internal: "Waiting on team",
  automation: "Processing automatically",
};

/** Generic fallback: replace underscores and capitalize */
export function humanizeStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
