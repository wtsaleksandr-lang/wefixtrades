import { z } from "zod";

/* ─── Booking Settings ─── */

export const bookingSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  require_deposit: z.boolean().default(false),
  deposit_type: z.enum(['fixed', 'percentage']).default('fixed'),
  deposit_value: z.number().default(0),
  slot_duration_minutes: z.number().default(60),
  stripe_account_id: z.string().default(''),
  availability: z.object({
    timezone: z.string().default('America/New_York'),
    working_days: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).default(['mon', 'tue', 'wed', 'thu', 'fri']),
    start_time: z.string().default('09:00'),
    end_time: z.string().default('17:00'),
    buffer_minutes: z.number().default(0),
  }).default({}),
}).default({});

export type BookingSettings = z.infer<typeof bookingSettingsSchema>;
