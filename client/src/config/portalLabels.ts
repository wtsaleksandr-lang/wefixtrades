/**
 * Client-friendly status labels and colours for the portal.
 * Single source of truth — used across Dashboard, Services, ServiceDetail, Billing.
 *
 * Internal DB values are never shown directly to clients.
 */

/* ─── Task / fulfillment statuses ─── */
export const TASK_STATUS_LABELS: Record<string, string> = {
  not_started: "Not started yet",
  submitted: "Submitted",
  in_progress: "In progress",
  waiting: "Waiting on you",
  blocked: "Needs attention",
  delivered: "Complete",
  cancelled: "Cancelled",
};

export const TASK_STATUS_STYLES: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-600",
  submitted: "bg-blue-50 text-blue-700",
  in_progress: "bg-indigo-50 text-indigo-700",
  waiting: "bg-amber-50 text-amber-700",
  blocked: "bg-red-50 text-red-700",
  delivered: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-500",
};

/* ─── Service statuses ─── */
export const SERVICE_STATUS_LABELS: Record<string, string> = {
  pending: "Setting up",
  onboarding: "Getting started",
  active: "Active",
  paused: "Paused",
  cancelled: "Cancelled",
  completed: "Completed",
};

export const SERVICE_STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  onboarding: "bg-amber-50 text-amber-700",
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-blue-50 text-blue-700",
  cancelled: "bg-gray-100 text-gray-500",
  completed: "bg-indigo-50 text-indigo-700",
};

/* ─── Payment statuses ─── */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Unpaid",
  paid: "Paid",
  failed: "Failed",
  partial: "Partially paid",
  refunded: "Refunded",
};

export const PAYMENT_STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  partial: "bg-blue-50 text-blue-700",
  refunded: "bg-gray-100 text-gray-600",
};

/* ─── Onboarding statuses ─── */
export const ONBOARDING_STATUS_LABELS: Record<string, string> = {
  not_sent: "Not started",
  sent: "Waiting for you",
  viewed: "In progress",
  submitted: "Submitted",
  approved: "Approved",
  needs_followup: "Needs attention",
};

/* ─── ContentFlow draft statuses ─── */
export const CONTENT_DRAFT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  awaiting_admin: "Awaiting admin",
  awaiting_client: "Awaiting client",
  approved: "Approved",
  rejected: "Rejected",
  published: "Published",
  delivered: "Delivered",
  failed: "Failed",
};

export const CONTENT_DRAFT_STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  awaiting_admin: "bg-amber-50 text-amber-700",
  awaiting_client: "bg-blue-50 text-blue-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  published: "bg-indigo-50 text-indigo-700",
  delivered: "bg-indigo-50 text-indigo-700",
  failed: "bg-red-50 text-red-700",
};

/* ─── Helper ─── */
export function statusLabel(map: Record<string, string>, status: string): string {
  return map[status] || status.replace(/_/g, " ");
}
