/**
 * WhatsApp/SMS booking confirmation formatter.
 *
 * When a booking is created via the AI chat engine's create_booking tool
 * during a WhatsApp conversation, this module formats the confirmation
 * message with rich formatting.
 */

/**
 * Check tool results for a successful booking creation and return
 * a formatted WhatsApp confirmation message. Returns null if no
 * booking was created.
 */
export function formatWhatsAppBookingConfirmation(
  toolResults: Array<{ tool: string; result: Record<string, unknown> }>,
): string | null {
  const bookingResult = toolResults.find(
    (tr) => tr.tool === "create_booking" && tr.result?.status === "created",
  );

  if (!bookingResult) return null;

  const { result } = bookingResult;
  const date = result.date as string | undefined;
  const time = result.time as string | undefined;

  if (!date || !time) return null;

  let displayDate = date;
  try {
    const dt = new Date(`${date}T${time}:00`);
    displayDate = dt.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  } catch {
    // Keep raw date string if parsing fails
  }

  let displayTime = time;
  try {
    const [h, m] = time.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    displayTime = `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
  } catch {
    // Keep raw time string if parsing fails
  }

  const service = result.service as string | undefined;
  const notes = result.notes as string | undefined;
  const serviceLabel = service || notes;

  const lines = [
    "✅ Booking confirmed!",
    `📅 ${displayDate} at ${displayTime}`,
  ];
  if (serviceLabel) {
    lines.push(`🔧 ${serviceLabel}`);
  }
  lines.push("We'll see you then!");

  return lines.join("\n");
}
