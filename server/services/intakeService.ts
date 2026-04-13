import { db } from "../db";
import { intakeEvents } from "@shared/schema";
import { normalizePublicForm } from "./intake/normalizers/publicFormNormalizer";

export type SourceType =
  | 'public_form'
  | 'webhook'
  | 'ai_chat'
  | 'admin_crm'
  | 'portal'
  | 'background_job';

export type ActorType =
  | 'anonymous'
  | 'authenticated_client'
  | 'admin'
  | 'system'
  | 'webhook';

export interface CaptureIntakeInput {
  sourceType: SourceType;
  eventType: string;
  correlationId: string;
  actorType: ActorType;
  actorId?: number;
  entityType?: string;
  entityId?: string;
  accountId?: number;
  rawPayload: Record<string, unknown>;
  context?: {
    ipAddress?: string;
    userAgent?: string;
  };
}

export async function captureIntakeEvent(
  input: CaptureIntakeInput,
): Promise<string | null> {
  try {
    if (!input.correlationId || input.correlationId.length < 3) {
      return null;
    }

    let normalizedData: Record<string, unknown> | null = null;
    let status: 'normalized' | 'failed' = 'normalized';
    let lastError: string | null = null;

    if (input.sourceType === 'public_form') {
      normalizedData = normalizePublicForm(input.eventType, input.rawPayload);
      if (!normalizedData) {
        status = 'failed';
        lastError = 'normalization returned null';
      }
    }

    if (normalizedData) {
      normalizedData = {
        ...normalizedData,
        _meta: {
          normalized_at: new Date().toISOString(),
          version: 1,
        },
      };
    }

    const [row] = await db
      .insert(intakeEvents)
      .values({
        correlation_id:  input.correlationId,
        source_type:     input.sourceType,
        event_type:      input.eventType,
        actor_type:      input.actorType,
        actor_id:        input.actorId ?? null,
        entity_type:     input.entityType ?? null,
        entity_id:       input.entityId ?? null,
        account_id:      input.accountId ?? null,
        event_version:   1,
        status,
        raw_payload:     input.rawPayload,
        normalized_data: normalizedData,
        last_error:      lastError,
        ip_address:      input.context?.ipAddress ?? null,
        user_agent:      input.context?.userAgent ?? null,
        normalized_at:   status === 'normalized' ? new Date() : null,
      })
      .onConflictDoNothing()
      .returning({ event_id: intakeEvents.event_id });

    return row?.event_id ?? null;
  } catch {
    return null;
  }
}
