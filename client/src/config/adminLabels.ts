/**
 * Admin-facing status labels, colors, and icons for all entity types.
 * Single source of truth for the admin dashboard — imported by overview,
 * detail, and list pages instead of hardcoding status colors inline.
 *
 * Each entry has:
 *   label   — human-readable display string
 *   color   — tailwind text/bg combo for badge rendering
 *   bgColor — standalone background class (for dots, indicators)
 *   icon    — optional lucide icon name hint (not enforced at type level)
 */

export interface StatusStyle {
  label: string;
  color: string;
  bgColor: string;
  icon?: string;
}

/* ─── Task / fulfillment statuses ─── */
export const TASK_STATUS: Record<string, StatusStyle> = {
  not_started:        { label: "Not Started",        color: "bg-gray-100 text-gray-600",    bgColor: "bg-gray-400",    icon: "circle" },
  in_progress:        { label: "In Progress",        color: "bg-indigo-50 text-indigo-700",  bgColor: "bg-indigo-500",  icon: "loader" },
  submitted:          { label: "Submitted",          color: "bg-blue-50 text-blue-700",      bgColor: "bg-blue-500",    icon: "send" },
  qa_review:          { label: "QA Review",          color: "bg-purple-50 text-purple-700",  bgColor: "bg-purple-500",  icon: "search" },
  revision_required:  { label: "Revision Required",  color: "bg-orange-50 text-orange-700",  bgColor: "bg-orange-500",  icon: "alert-triangle" },
  delivered:          { label: "Delivered",           color: "bg-emerald-50 text-emerald-700",bgColor: "bg-emerald-500", icon: "check-circle" },
  cancelled:          { label: "Cancelled",          color: "bg-gray-100 text-gray-500",     bgColor: "bg-gray-400",    icon: "x-circle" },
  waiting:            { label: "Waiting",            color: "bg-amber-50 text-amber-700",    bgColor: "bg-amber-500",   icon: "clock" },
  blocked:            { label: "Blocked",            color: "bg-red-50 text-red-700",        bgColor: "bg-red-500",     icon: "alert-octagon" },
};

/* ─── Client statuses ─── */
export const CLIENT_STATUS: Record<string, StatusStyle> = {
  lead:       { label: "Lead",       color: "bg-gray-100 text-gray-700",    bgColor: "bg-gray-400",    icon: "user-plus" },
  onboarding: { label: "Onboarding", color: "bg-amber-50 text-amber-700",   bgColor: "bg-amber-500",   icon: "clipboard-list" },
  active:     { label: "Active",     color: "bg-emerald-50 text-emerald-700",bgColor: "bg-emerald-500", icon: "check-circle" },
  paused:     { label: "Paused",     color: "bg-blue-50 text-blue-700",     bgColor: "bg-blue-500",    icon: "pause-circle" },
  churned:    { label: "Churned",    color: "bg-red-50 text-red-700",       bgColor: "bg-red-500",     icon: "user-x" },
};

/* ─── Service statuses ─── */
export const SERVICE_STATUS: Record<string, StatusStyle> = {
  pending:    { label: "Pending",    color: "bg-gray-100 text-gray-700",    bgColor: "bg-gray-400",    icon: "clock" },
  onboarding: { label: "Onboarding", color: "bg-amber-50 text-amber-700",  bgColor: "bg-amber-500",   icon: "clipboard-list" },
  active:     { label: "Active",     color: "bg-emerald-50 text-emerald-700",bgColor: "bg-emerald-500", icon: "check-circle" },
  paused:     { label: "Paused",     color: "bg-blue-50 text-blue-700",     bgColor: "bg-blue-500",    icon: "pause-circle" },
  cancelled:  { label: "Cancelled",  color: "bg-red-50 text-red-700",       bgColor: "bg-red-500",     icon: "x-circle" },
  completed:  { label: "Completed",  color: "bg-emerald-50 text-emerald-700",bgColor: "bg-emerald-500", icon: "check-circle-2" },
};

/* ─── Payment statuses ─── */
export const PAYMENT_STATUS: Record<string, StatusStyle> = {
  pending:  { label: "Pending",  color: "bg-amber-50 text-amber-700",    bgColor: "bg-amber-500",   icon: "clock" },
  paid:     { label: "Paid",     color: "bg-emerald-50 text-emerald-700", bgColor: "bg-emerald-500", icon: "check-circle" },
  failed:   { label: "Failed",   color: "bg-red-50 text-red-700",        bgColor: "bg-red-500",     icon: "x-circle" },
  partial:  { label: "Partial",  color: "bg-blue-50 text-blue-700",      bgColor: "bg-blue-500",    icon: "minus-circle" },
  refunded: { label: "Refunded", color: "bg-gray-100 text-gray-600",     bgColor: "bg-gray-400",    icon: "rotate-ccw" },
};

/* ─── Alert severities ─── */
export const ALERT_SEVERITY: Record<string, StatusStyle> = {
  critical: { label: "Critical", color: "bg-red-50 text-red-700 border border-red-200",      bgColor: "bg-red-500",    icon: "alert-octagon" },
  warning:  { label: "Warning",  color: "bg-orange-50 text-orange-700 border border-orange-200", bgColor: "bg-orange-500", icon: "alert-triangle" },
  info:     { label: "Info",     color: "bg-blue-50 text-blue-700 border border-blue-200",    bgColor: "bg-blue-500",   icon: "info" },
};

/* ─── Job statuses (background workers) ─── */
export const JOB_STATUS: Record<string, StatusStyle> = {
  running:   { label: "Running",   color: "bg-blue-50 text-blue-700",      bgColor: "bg-blue-500",    icon: "loader" },
  completed: { label: "Completed", color: "bg-emerald-50 text-emerald-700", bgColor: "bg-emerald-500", icon: "check-circle" },
  failed:    { label: "Failed",    color: "bg-red-50 text-red-700",        bgColor: "bg-red-500",     icon: "x-circle" },
};

/* ─── Combined lookup (merges all maps with task + client + service + payment) ─── */
const ALL_STATUS: Record<string, StatusStyle> = {
  ...TASK_STATUS,
  ...CLIENT_STATUS,
  ...SERVICE_STATUS,
  ...PAYMENT_STATUS,
};

/**
 * Get the color class string for any status value.
 * Falls back to neutral gray if the status is unknown.
 */
export function adminStatusColor(status: string): string {
  return ALL_STATUS[status]?.color ?? "bg-gray-100 text-gray-600";
}

/**
 * Get the full StatusStyle for any status value.
 */
export function adminStatusStyle(status: string): StatusStyle {
  return ALL_STATUS[status] ?? { label: status.replace(/_/g, " "), color: "bg-gray-100 text-gray-600", bgColor: "bg-gray-400" };
}
