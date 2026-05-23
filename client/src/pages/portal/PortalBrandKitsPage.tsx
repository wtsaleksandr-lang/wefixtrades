/**
 * Portal Brand Kits — /portal/brand-kits (Wave W-AO-6d).
 *
 * Management surface for QuoteQuick Brand Kits (Pro $29+ feature).
 * Lists the user's saved kits with rename / delete actions. Save +
 * Apply happen in the calculator wizard's Style tab; this page is the
 * cross-calculator "library" view.
 *
 * Backend: /api/portal/brand-kits (portalBrandKitsRoutes.ts):
 *   GET    /                        — list MY kits
 *   PATCH  /:id                     — rename / update
 *   DELETE /:id                     — hard delete
 *
 * Pro gate: the GET responds 403 with `pro_tier_required` when the user
 * doesn't own a Pro+ calculator; we render the upsell card in that case.
 */

import { useEffect, useState, useCallback } from "react";
import { Sparkles, Trash2, Pencil, Palette } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";

interface BrandKitRow {
  id: string;
  name: string;
  description: string | null;
  style: Record<string, unknown>;
  logo_url: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export default function PortalBrandKitsPage() {
  usePageTitle("Brand Kits");

  const [kits, setKits] = useState<BrandKitRow[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "pro-required" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setState("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/portal/brand-kits", { credentials: "include" });
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        if (body?.error === "pro_tier_required") {
          setState("pro-required");
          setKits(null);
          return;
        }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setKits(Array.isArray(body?.kits) ? body.kits : []);
      setState("ready");
    } catch (err: any) {
      setState("error");
      setErrorMsg(err?.message ?? "Failed to load Brand Kits");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const startEdit = (kit: BrandKitRow) => {
    setEditingId(kit.id);
    setEditName(kit.name);
    setEditDesc(kit.description ?? "");
  };

  const saveEdit = useCallback(async () => {
    if (!editingId || !editName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/brand-kits/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setEditingId(null);
      await refresh();
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Failed to save Brand Kit");
    } finally {
      setBusy(false);
    }
  }, [editingId, editName, editDesc, refresh]);

  const deleteKit = useCallback(async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/brand-kits/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      await refresh();
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Failed to delete Brand Kit");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return (
    <PortalLayout>
      <div data-theme="light" style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 880 }}>
        <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Palette size={20} />
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Brand Kits</h1>
          <span style={{
            fontSize: 11, fontWeight: 600, color: "#6d28d9",
            background: "#ede9fe", borderRadius: 999, padding: "2px 8px",
            display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            <Sparkles size={10} aria-hidden="true" /> Pro
          </span>
        </header>
        <p style={{ margin: 0, color: "#475569", fontSize: 14 }}>
          A Brand Kit is a saved bundle of QuoteQuick widget style settings (colours,
          typography, custom CSS, animations, logo) you can apply across every
          calculator you own. Save and apply Brand Kits from the wizard's Style tab.
        </p>

        {state === "loading" && (
          <p style={{ color: "#475569" }}>Loading…</p>
        )}

        {state === "pro-required" && (
          <section
            data-testid="brand-kits-pro-required"
            style={{
              border: "1px solid #e5e7eb", borderRadius: 12, padding: 18,
              background: "#f8fafc", display: "flex", flexDirection: "column", gap: 8,
            }}
          >
            <strong style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15 }}>
              <Sparkles size={14} aria-hidden="true" /> Brand Kits require Pro
            </strong>
            <p style={{ margin: 0, color: "#475569", fontSize: 13 }}>
              Upgrade at least one QuoteQuick calculator to Pro ($29/mo) to unlock reusable
              Brand Kits, custom CSS, image backgrounds, and step animations.
            </p>
            <a
              href="/pricing/quotequick"
              data-testid="brand-kits-upgrade"
              style={{
                alignSelf: "flex-start", marginTop: 4,
                background: "#0d3cfc", color: "#fff", borderRadius: 8,
                padding: "8px 14px", fontWeight: 600, textDecoration: "none", fontSize: 13,
              }}
            >
              Upgrade to Pro →
            </a>
          </section>
        )}

        {state === "error" && (
          <p style={{ color: "#b91c1c" }} data-testid="brand-kits-error">
            {errorMsg ?? "Failed to load Brand Kits."}
          </p>
        )}

        {state === "ready" && kits && kits.length === 0 && (
          <section
            data-testid="brand-kits-empty"
            style={{
              border: "1px dashed #cbd5e1", borderRadius: 12, padding: 24,
              textAlign: "center", color: "#475569",
            }}
          >
            <p style={{ margin: 0, fontSize: 14 }}>
              No Brand Kits yet. Save one from any calculator's Style tab to see it here.
            </p>
          </section>
        )}

        {state === "ready" && kits && kits.length > 0 && (
          <ul
            data-testid="brand-kits-list"
            style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}
          >
            {kits.map((kit) => {
              const accent = (kit.style as any)?.accent ?? "#0d3cfc";
              const isEditing = editingId === kit.id;
              return (
                <li
                  key={kit.id}
                  data-testid={`brand-kit-row-${kit.id}`}
                  style={{
                    border: "1px solid #e5e7eb", borderRadius: 12, padding: 14,
                    display: "flex", flexDirection: "column", gap: 10, background: "#fff",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {kit.logo_url ? (
                      <img
                        src={kit.logo_url}
                        alt=""
                        style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", border: "1px solid #e5e7eb" }}
                      />
                    ) : (
                      <span style={{ width: 36, height: 36, borderRadius: 8, background: "#f1f5f9", display: "inline-block" }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isEditing ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <Label htmlFor={`kit-name-${kit.id}`} style={{ fontSize: 11 }}>Name</Label>
                          <Input
                            id={`kit-name-${kit.id}`}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={120}
                            data-testid={`brand-kit-edit-name-${kit.id}`}
                          />
                          <Label htmlFor={`kit-desc-${kit.id}`} style={{ fontSize: 11 }}>Description</Label>
                          <Input
                            id={`kit-desc-${kit.id}`}
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            maxLength={2000}
                            data-testid={`brand-kit-edit-desc-${kit.id}`}
                          />
                        </div>
                      ) : (
                        <>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{kit.name}</p>
                          {kit.description && (
                            <p style={{ margin: "2px 0 0", color: "#475569", fontSize: 12 }}>
                              {kit.description}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    <span
                      aria-hidden="true"
                      title="Accent colour"
                      style={{ width: 20, height: 20, borderRadius: "50%", background: String(accent), border: "1px solid #e5e7eb" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    {isEditing ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingId(null)}
                          disabled={busy}
                          data-testid={`brand-kit-cancel-${kit.id}`}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => void saveEdit()}
                          disabled={busy || !editName.trim()}
                          data-testid={`brand-kit-save-${kit.id}`}
                        >
                          {busy ? "Saving…" : "Save"}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEdit(kit)}
                          data-testid={`brand-kit-edit-${kit.id}`}
                        >
                          <Pencil size={14} /> Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirmId(kit.id)}
                          disabled={busy}
                          data-testid={`brand-kit-delete-${kit.id}`}
                          style={{ color: "#b91c1c" }}
                        >
                          <Trash2 size={14} /> Delete
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <AlertDialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this Brand Kit?</AlertDialogTitle>
            <AlertDialogDescription>
              This can't be undone. The kit will no longer be available to apply to your calculators.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirmId) {
                  const id = deleteConfirmId;
                  setDeleteConfirmId(null);
                  void deleteKit(id);
                }
              }}
              disabled={busy}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PortalLayout>
  );
}
