export function normalizePublicForm(
  eventType: string,
  raw: Record<string, unknown>,
): Record<string, unknown> | null {
  switch (eventType) {
    case 'lead.submitted':             return normalizeLeadSubmitted(raw);
    case 'demo_lead.submitted':        return normalizeDemoLeadSubmitted(raw);
    case 'missed_call_lead.submitted': return normalizeMissedCallLeadSubmitted(raw);
    default:
      return null;
  }
}

function normalizeLeadSubmitted(raw: Record<string, unknown>) {
  return {
    contact: {
      name:  str(raw.name),
      email: str(raw.email),
      phone: str(raw.phone),
    },
    calculator: {
      id: num(raw.calculator_id),
    },
    quote: {
      amount: str(raw.quote_amount),
    },
    consent: {
      sms: bool(raw.sms_consent),
    },
  };
}

function normalizeDemoLeadSubmitted(raw: Record<string, unknown>) {
  return {
    contact: {
      name:  str(raw.name),
      email: str(raw.email),
      phone: str(raw.phone),
    },
    business: {
      trade:              str(raw.trade),
      demo_business_name: str(raw.demoBusinessName),
    },
    quote: {
      amount: str(raw.quoteAmount),
    },
  };
}

function normalizeMissedCallLeadSubmitted(raw: Record<string, unknown>) {
  return {
    contact: {
      name:  str(raw.name),
      email: str(raw.email),
      phone: str(raw.phone),
    },
    business: {
      trade: str(raw.trade),
    },
    metrics: {
      missed_calls_per_week: num(raw.missedCallsPerWeek),
      close_rate_percent:    num(raw.closeRatePercent),
      avg_job_value:         num(raw.avgJobValue),
      estimated_annual_loss: num(raw.estimatedAnnualLoss),
    },
  };
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function bool(v: unknown): boolean {
  return v === true || v === 'true';
}
