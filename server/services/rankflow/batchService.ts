import { storage } from "../../storage";
import type { RankflowTask } from "@shared/schema";

/**
 * Maps vendor_type to batch_type category.
 */
function getBatchType(vendorType: string): string {
  if (vendorType.includes("citation")) return "citations";
  if (vendorType.includes("backlink")) return "backlinks";
  if (vendorType.includes("upload") || vendorType.includes("content")) return "uploads";
  return "misc";
}

/**
 * Create a vendor batch from a set of outsourced task IDs.
 */
export async function createVendorBatch(vendorType: string, taskIds: number[]) {
  if (taskIds.length === 0) throw new Error("No task IDs provided");

  const batchType = getBatchType(vendorType);

  // Calculate estimated cost from tasks
  const tasks: RankflowTask[] = [];
  for (const id of taskIds) {
    const task = await storage.getRankFlowTaskById(id);
    if (!task) throw new Error(`Task ${id} not found`);
    if (task.execution_mode !== "outsourced") throw new Error(`Task ${id} is not outsourced`);
    tasks.push(task);
  }

  const totalEstimated = tasks.reduce((sum, t) => sum + (Number(t.estimated_cost) || 0), 0);

  const batch = await storage.createRankflowVendorBatch({
    vendor_type: vendorType,
    batch_type: batchType,
    status: "draft",
    task_ids: taskIds,
    estimated_cost: String(totalEstimated),
  });

  // Link tasks to batch
  for (const id of taskIds) {
    await storage.linkTaskToBatch(id, batch.id);
  }

  return batch;
}

/**
 * Find an existing draft batch for the given vendor type, or return null.
 */
export async function getOpenBatch(vendorType: string) {
  const batches = await storage.listRankflowVendorBatches({ status: "draft", vendor_type: vendorType });
  return batches.length > 0 ? batches[0] : null;
}

/**
 * Add a single task to an existing batch.
 */
export async function addTaskToBatch(batchId: number, taskId: number) {
  const batch = await storage.getRankflowVendorBatch(batchId);
  if (!batch) throw new Error("Batch not found");

  const task = await storage.getRankFlowTaskById(taskId);
  if (!task) throw new Error("Task not found");
  if (task.execution_mode !== "outsourced") throw new Error("Task is not outsourced");

  const existingIds = (batch.task_ids as number[]) || [];
  if (existingIds.includes(taskId)) return batch;

  const updatedIds = [...existingIds, taskId];
  const updatedCost = (Number(batch.estimated_cost) || 0) + (Number(task.estimated_cost) || 0);

  await storage.updateRankflowVendorBatchStatus(batch.id, batch.status, {
    task_ids: updatedIds,
    estimated_cost: String(updatedCost),
  });
  await storage.linkTaskToBatch(taskId, batchId);

  return storage.getRankflowVendorBatch(batchId);
}

export interface DispatchTaskItem {
  task_id: number;
  client_id: number;
  business_name: string;
  website_url: string;
  target_location: string;
  instructions: string;
  proof_required: string[];
}

/**
 * Build a structured dispatch packet for a batch — ready to hand to a vendor.
 */
export async function buildDispatchPacket(batchId: number) {
  const batch = await storage.getRankflowVendorBatch(batchId);
  if (!batch) throw new Error("Batch not found");

  const taskIds = (batch.task_ids as number[]) || [];
  const dispatchTasks: DispatchTaskItem[] = [];

  for (const taskId of taskIds) {
    const task = await storage.getRankFlowTaskById(taskId);
    if (!task) continue;

    // Load client profile for business context
    const profile = await storage.getRankFlowProfile(task.client_id);
    const qaReqs = ((task.metadata as any)?.qa_requirements || []) as string[];

    dispatchTasks.push({
      task_id: task.id,
      client_id: task.client_id,
      business_name: profile?.niche || `Client #${task.client_id}`,
      website_url: profile?.website_url || "TBD",
      target_location: profile?.location || "TBD",
      instructions: task.instructions || task.title,
      proof_required: qaReqs,
    });
  }

  const packet = {
    batch_id: batch.id,
    vendor_type: batch.vendor_type,
    batch_type: batch.batch_type,
    summary: `${batch.batch_type} batch — ${dispatchTasks.length} tasks for ${new Set(dispatchTasks.map(t => t.client_id)).size} client(s)`,
    estimated_cost: batch.estimated_cost,
    tasks: dispatchTasks,
  };

  // Save packet to batch
  await storage.updateRankflowVendorBatchStatus(batch.id, batch.status, {
    dispatch_packet: packet,
  });

  return packet;
}

/**
 * Auto-group unbatched outsourced tasks into draft batches by vendor_type.
 * Returns the number of draft batches created/updated.
 */
export async function autoBatchUnbatchedTasks(): Promise<number> {
  const unbatched = await storage.listUnbatchedOutsourcedTasks();
  if (unbatched.length === 0) return 0;

  // Group by vendor_type
  const groups = new Map<string, number[]>();
  for (const task of unbatched) {
    const vt = task.vendor_type || "misc";
    if (!groups.has(vt)) groups.set(vt, []);
    groups.get(vt)!.push(task.id);
  }

  let batchCount = 0;
  for (const [vendorType, taskIds] of groups) {
    // Try to add to existing open batch first
    const openBatch = await getOpenBatch(vendorType);
    if (openBatch) {
      for (const id of taskIds) {
        await addTaskToBatch(openBatch.id, id);
      }
    } else {
      await createVendorBatch(vendorType, taskIds);
      batchCount++;
    }
  }

  return batchCount;
}
