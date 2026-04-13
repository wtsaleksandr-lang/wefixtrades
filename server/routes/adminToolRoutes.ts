import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { consumePendingAction, TOOL_EXECUTORS } from "../services/adminTools";

export function registerAdminToolRoutes(app: Express): void {
  /**
   * POST /api/admin/tool-confirm
   *
   * Confirms and executes a pending AI-proposed tool action.
   *
   * Body: { call_id: string, confirmed: true }
   *
   * Security:
   * - Requires authenticated admin session (requireAdmin)
   * - call_id must exist in pendingToolStore (server-side generated, never client-supplied args)
   * - user_id in store must match the session user
   * - Store entry is consumed (deleted) on first retrieval — no replay
   * - tool_name must be in the TOOL_EXECUTORS allowlist
   * - Args are re-validated inside the executor before any DB write
   */
  app.post("/api/admin/tool-confirm", requireAdmin, async (req: Request, res: Response) => {
    try {
      // Hard kill switch — must match the gate in chatRoutes
      if (process.env.ADMIN_TOOLS_ENABLED !== "true") {
        return res.status(404).json({ error: "Not found" });
      }

      const { call_id, confirmed } = req.body ?? {};

      if (typeof call_id !== "string" || call_id.trim() === "") {
        return res.status(400).json({ error: "call_id is required" });
      }
      if (confirmed !== true) {
        return res.status(400).json({ error: "confirmed must be true" });
      }

      // Look up and immediately consume the pending action (single-use)
      const action = consumePendingAction(call_id);
      if (!action) {
        return res.status(404).json({ error: "Pending action not found or expired" });
      }

      // Verify the confirming user matches the one who initiated the tool call
      const sessionUserId = (req.user as any)?.id;
      if (action.user_id !== sessionUserId) {
        return res.status(403).json({ error: "Action belongs to a different session" });
      }

      // Verify tool is in the allowlist
      const executor = TOOL_EXECUTORS[action.tool_name];
      if (!executor) {
        return res.status(400).json({ error: `Unknown tool: ${action.tool_name}` });
      }

      // Execute — full action passed so executor can use session_id and metadata
      const result = await executor(action, sessionUserId);

      return res.json({ success: true, narrative: result.narrative });
    } catch (err: any) {
      console.error("[tool-confirm] Execution error:", err.message);
      return res.status(500).json({ error: err.message || "Tool execution failed" });
    }
  });
}
