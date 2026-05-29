/**
 * BookFlow Dispatch page — /portal/dispatch
 *
 * Mobile-first daily job list for tradespeople.
 * Shows today's appointments by default with date picker navigation.
 * Each job card: time, customer, address (tap to navigate), status, mark complete.
 */

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Phone, MapPin, CheckCircle, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import PortalLayout from "@/components/portal/PortalLayout";

interface Appointment {
  id: number;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  service_name: string | null;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);

  if (dateStr === todayStr) return "Today";
  if (dateStr === tomorrowStr) return "Tomorrow";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function statusColor(status: string): { bg: string; text: string } {
  switch (status) {
    case "completed": return { bg: "#f0fdf4", text: "#16a34a" };
    case "cancelled": return { bg: "#fef2f2", text: "#dc2626" };
    case "no_show": return { bg: "#fef2f2", text: "#dc2626" };
    case "pending": return { bg: "#fffbeb", text: "#d97706" };
    default: return { bg: "#eff6ff", text: "#2563eb" }; // confirmed
  }
}

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export default function DispatchPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/portal/bookflow/dispatch", selectedDate],
    queryFn: async () => {
      const res = await fetch(`/api/portal/bookflow/dispatch?date=${selectedDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/portal/bookflow/appointments/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/bookflow/dispatch", selectedDate] });
    },
  });

  const handleMarkComplete = (apt: Appointment) => {
    const prevStatus = apt.status;
    setStatus.mutate({ id: apt.id, status: "completed" });
    toast({
      title: "Marked complete · Undo",
      duration: 5000,
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => setStatus.mutate({ id: apt.id, status: prevStatus })}
        >
          Undo
        </ToastAction>
      ),
    });
  };

  const shiftDate = useCallback((days: number) => {
    const d = new Date(selectedDate + "T12:00:00");
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().slice(0, 10));
  }, [selectedDate]);

  const activeJobs = appointments.filter((a) => a.status !== "cancelled");
  const completedCount = appointments.filter((a) => a.status === "completed").length;

  return (
    <PortalLayout breadcrumb="Today's jobs" compact>
    <div data-theme="light" style={{ maxWidth: 600, margin: "0 auto", padding: "16px" }}>
      {/* Header — Dispatch is mobile-first for tradespeople in the field.
          PortalLayout's compact mode drops outer chrome on small screens so
          this surface still feels like a stripped-down field app, while
          desktop users get the full sidebar nav. */}
      <h1 className="text-gray-900" style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>
        Dispatch
      </h1>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>
        {activeJobs.length} job{activeJobs.length !== 1 ? "s" : ""} scheduled
        {completedCount > 0 && ` · ${completedCount} completed`}
      </p>

      {/* Date navigation */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#f9fafb",
        borderRadius: 10,
        padding: "8px 12px",
        marginBottom: 16,
        border: "1px solid #e5e7eb",
      }}>
        <button
          onClick={() => shiftDate(-1)}
          style={navBtnStyle}
          aria-label="Previous day"
        >
          <ChevronLeft size={20} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Calendar size={14} style={{ color: "#6b7280" }} />
          <span className="text-gray-900" style={{ fontSize: 14, fontWeight: 600 }}>
            {formatDateLabel(selectedDate)}
          </span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              opacity: 0,
              position: "absolute",
              width: 0,
              height: 0,
              pointerEvents: "none",
            }}
            id="dispatch-date"
          />
          <label
            htmlFor="dispatch-date"
            className="text-brand-blue"
            style={{ fontSize: 12, cursor: "pointer", fontWeight: 500 }}
            onClick={() => {
              const el = document.getElementById("dispatch-date") as HTMLInputElement;
              el?.showPicker?.();
            }}
          >
            Change
          </label>
        </div>
        <button
          onClick={() => shiftDate(1)}
          style={navBtnStyle}
          aria-label="Next day"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <p style={{ textAlign: "center", color: "#6b7280", fontSize: 14, padding: "40px 0" }}>
          Loading...
        </p>
      )}

      {/* Empty state */}
      {!isLoading && appointments.length === 0 && (
        <div style={{
          textAlign: "center",
          padding: "48px 20px",
          background: "#f9fafb",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
        }}>
          <Calendar size={32} style={{ color: "#d1d5db", marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: "#374151", margin: "0 0 4px" }}>
            No jobs scheduled
          </p>
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            {selectedDate === new Date().toISOString().slice(0, 10)
              ? "Nothing on the books for today."
              : "No appointments for this date."}
          </p>
        </div>
      )}

      {/* Job cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {appointments.map((apt) => {
          const sc = statusColor(apt.status);
          const isComplete = apt.status === "completed";
          return (
            <div
              key={apt.id}
              style={{
                background: "#fff",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                padding: "14px 16px",
                opacity: apt.status === "cancelled" ? 0.5 : 1,
              }}
            >
              {/* Time + status */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span className="text-gray-900" style={{ fontSize: 15, fontWeight: 700 }}>
                  {formatTime(apt.start_time)} - {formatTime(apt.end_time)}
                </span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: sc.text,
                  background: sc.bg,
                  padding: "3px 10px",
                  borderRadius: 20,
                }}>
                  {apt.status === "no_show" ? "No Show" : apt.status}
                </span>
              </div>

              {/* Customer */}
              <p style={{ fontSize: 14, fontWeight: 500, color: "#374151", margin: "0 0 2px" }}>
                {apt.customer_name}
              </p>

              {/* Service */}
              {apt.service_name && (
                <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 8px" }}>
                  {apt.service_name}
                </p>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {/* Phone */}
                {apt.customer_phone && (
                  <a
                    href={`tel:${apt.customer_phone}`}
                    style={actionBtnStyle}
                  >
                    <Phone size={14} />
                    <span>{apt.customer_phone}</span>
                  </a>
                )}

                {/* Navigate */}
                {apt.customer_address && (
                  <a
                    href={mapsUrl(apt.customer_address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={actionBtnStyle}
                  >
                    <MapPin size={14} />
                    <span>Navigate</span>
                  </a>
                )}

                {/* Mark Complete */}
                {!isComplete && apt.status !== "cancelled" && (
                  <button
                    onClick={() => handleMarkComplete(apt)}
                    disabled={setStatus.isPending}
                    style={{
                      ...actionBtnStyle,
                      background: "#f0fdf4",
                      borderColor: "#bbf7d0",
                      color: "#16a34a",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    <CheckCircle size={14} />
                    <span>Mark Complete</span>
                  </button>
                )}
              </div>

              {/* Notes */}
              {apt.notes && (
                <p style={{ fontSize: 12, color: "#6b7280", margin: "8px 0 0", lineHeight: 1.4 }}>
                  {apt.notes}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </PortalLayout>
  );
}

/* ─── Shared styles ─── */

const navBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: 4,
  color: "#374151",
  display: "flex",
  alignItems: "center",
};

const actionBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 12,
  fontWeight: 500,
  color: "#374151",
  textDecoration: "none",
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "10px 14px",
  minHeight: 44, // tap target ≥44px (DESIGN-SYSTEM rule 1)
  cursor: "pointer",
};
