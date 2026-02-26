const CACHE_KEY = "fx_cad_usd";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FALLBACK_RATE = 0.74;

interface CachedRate {
  rate: number;
  timestamp: number;
}

function getCachedRate(): number | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedRate = JSON.parse(raw);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.rate;
    }
    return null;
  } catch {
    return null;
  }
}

function setCachedRate(rate: number): void {
  try {
    const entry: CachedRate = { rate, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
  }
}

export async function fetchFxRate(): Promise<number> {
  const cached = getCachedRate();
  if (cached !== null) return cached;

  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=CAD&to=USD");
    if (!res.ok) throw new Error("FX fetch failed");
    const data = await res.json();
    const rate = data?.rates?.USD;
    if (typeof rate === "number" && rate > 0) {
      setCachedRate(rate);
      return rate;
    }
    throw new Error("Invalid rate");
  } catch {
    return FALLBACK_RATE;
  }
}

export function getFallbackRate(): number {
  const cached = getCachedRate();
  return cached ?? FALLBACK_RATE;
}

export function convert(amountCAD: number, rate: number): number {
  return Math.round(amountCAD * rate);
}

export function formatMoney(amount: number, currency: "CAD" | "USD"): string {
  if (currency === "CAD") {
    return `CA$${amount.toLocaleString("en-CA")}`;
  }
  return `$${amount.toLocaleString("en-US")}`;
}
