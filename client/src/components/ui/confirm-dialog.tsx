/**
 * Shared <ConfirmDialog> — replaces ad-hoc `window.confirm()` calls in admin
 * pages with the same styled <AlertDialog> pattern CommunicationsPage has
 * been using. Controlled API (caller owns open state + the action closure).
 *
 * Visual rules:
 *   - Uses existing <AlertDialog> primitives unchanged — no new styling.
 *   - `destructive` swaps the action button to the red destructive tone
 *     (matches the inline pattern from CommunicationsPage / SuppliersPage).
 *
 * Usage:
 *   const [pending, setPending] = useState<number | null>(null);
 *   <ConfirmDialog
 *     open={pending != null}
 *     onOpenChange={(o) => !o && setPending(null)}
 *     title="Deactivate supplier?"
 *     description="Active tasks stay assigned."
 *     destructive
 *     confirmLabel="Deactivate"
 *     onConfirm={() => { mutation.mutate(pending!); setPending(null); }}
 *   />
 */
import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, the confirm action renders with destructive red styling. */
  destructive?: boolean;
  /** Disables the confirm button — wire to mutation.isPending if needed. */
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  pending = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-theme="light" data-testid="confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={pending}
            className={
              destructive ? "bg-red-600 hover:bg-red-700 text-white" : undefined
            }
            data-testid="confirm-dialog-action"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
